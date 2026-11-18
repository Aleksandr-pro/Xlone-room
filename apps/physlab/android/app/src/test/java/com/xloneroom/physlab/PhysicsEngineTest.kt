package com.xloneroom.physlab

import com.xloneroom.physlab.engine.PhysicsEngine
import com.xloneroom.physlab.model.*
import com.xloneroom.physlab.storage.RoomRepository
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs
import kotlin.math.hypot

class PhysicsEngineTest {

    @Test
    fun ballisticsVacuumMatchesAnalyticalRangeAndHeight() {
        val params = ExperimentTopic.BALLISTICS.defaultParams().apply {
            put("v0", 20.0)
            put("angle", 45.0)
            put("height", 0.0)
            put("gravity", 9.81)
            put("airDrag", 0.0)
            put("wind", 0.0)
            put("restitution", 0.0)
        }
        val engine = PhysicsEngine(ExperimentTopic.BALLISTICS)
        engine.reset(ExperimentTopic.BALLISTICS, params)

        var landed = false
        for (i in 0 until 200) {
            engine.step(0.02, params)
            if (engine.simTime > 0.2 && engine.ballPos.y <= 0.001 && abs(engine.ballVel.y) < 0.05) {
                landed = true
                break
            }
        }
        assertTrue("Ball should land within 4s", landed)
        val expectedRange = (20.0 * 20.0) / 9.81
        val expectedMaxH = (20.0 * 20.0 * 0.5) / (2.0 * 9.81)
        assertEquals(expectedRange, engine.ballRange, 0.5)
        assertEquals(expectedMaxH, engine.ballMaxH, 0.15)
    }

    @Test
    fun ballisticsAirDragReducesRange() {
        val vacuum = ExperimentTopic.BALLISTICS.defaultParams().apply { put("airDrag", 0.0); put("restitution", 0.0) }
        val air = ExperimentTopic.BALLISTICS.defaultParams().apply { put("airDrag", 0.45); put("restitution", 0.0) }

        val eVac = PhysicsEngine(ExperimentTopic.BALLISTICS).apply { reset(ExperimentTopic.BALLISTICS, vacuum) }
        val eAir = PhysicsEngine(ExperimentTopic.BALLISTICS).apply { reset(ExperimentTopic.BALLISTICS, air) }

        repeat(250) {
            eVac.step(0.02, vacuum)
            eAir.step(0.02, air)
        }
        assertTrue("Air drag must reduce range (${eAir.ballRange} < ${eVac.ballRange})", eAir.ballRange < eVac.ballRange - 3.0)
    }

    @Test
    fun pendulumConservesEnergyWithoutDamping() {
        val params = ExperimentTopic.PENDULUM.defaultParams().apply {
            put("mode", 0.0)
            put("length", 1.0)
            put("mass", 2.0)
            put("angle0", 20.0)
            put("damping", 0.0)
            put("gravity", 9.81)
        }
        val engine = PhysicsEngine(ExperimentTopic.PENDULUM)
        engine.reset(ExperimentTopic.PENDULUM, params)
        val initialSnap = engine.captureTelemetry(params)
        val e0 = initialSnap.energyKinetic + initialSnap.energyPotential

        repeat(150) { engine.step(0.02, params) }
        val afterSnap = engine.captureTelemetry(params)
        val e1 = afterSnap.energyKinetic + afterSnap.energyPotential
        assertEquals("Pendulum energy should stay conserved", e0, e1, e0 * 0.015)
    }

    @Test
    fun collisionsConserveMomentumAndElasticEnergy() {
        val params = ExperimentTopic.COLLISIONS.defaultParams().apply {
            put("m1", 3.0)
            put("v1", 5.0)
            put("m2", 2.0)
            put("v2", -2.0)
            put("restitution", 1.0)
            put("friction", 0.0)
        }
        val engine = PhysicsEngine(ExperimentTopic.COLLISIONS)
        engine.reset(ExperimentTopic.COLLISIONS, params)
        val p0 = 3.0 * 5.0 + 2.0 * (-2.0)
        val ek0 = 0.5 * 3.0 * 25.0 + 0.5 * 2.0 * 4.0

        repeat(80) { engine.step(0.02, params) }
        val p1 = 3.0 * engine.colV1 + 2.0 * engine.colV2
        val ek1 = 0.5 * 3.0 * engine.colV1 * engine.colV1 + 0.5 * 2.0 * engine.colV2 * engine.colV2

        assertEquals("Total momentum conserved", p0, p1, 1e-6)
        assertEquals("Elastic kinetic energy conserved", ek0, ek1, 1e-4)
        assertTrue("Collision should trigger at least 1 event", engine.pendingEvents.isNotEmpty())
    }

    @Test
    fun circuitsOhmLawSeriesAndParallel() {
        val series = ExperimentTopic.CIRCUITS.defaultParams().apply {
            put("topology", 0.0)
            put("emf", 12.0)
            put("rInt", 0.0)
            put("r1", 10.0)
            put("r2", 20.0)
            put("switchClosed", 1.0)
        }
        val engine = PhysicsEngine(ExperimentTopic.CIRCUITS)
        engine.reset(ExperimentTopic.CIRCUITS, series)
        engine.step(0.02, series)
        assertEquals(0.4, engine.circuitCurrent, 1e-4)

        val parallel = series.toMutableMap().apply { put("topology", 1.0) }
        engine.step(0.02, parallel)
        assertEquals(1.8, engine.circuitCurrent, 1e-4)
    }

    @Test
    fun idealGasEquationOfStateAndAdiabaticHeating() {
        val params = ExperimentTopic.IDEAL_GAS.defaultParams().apply {
            put("processMode", 0.0)
            put("particles", 75.0)
            put("temperature", 300.0)
            put("volume", 5.0)
        }
        val engine = PhysicsEngine(ExperimentTopic.IDEAL_GAS)
        engine.reset(ExperimentTopic.IDEAL_GAS, params)
        assertEquals(101.325, engine.gasMeasuredPressureKpa, 0.2)

        // Adiabatic compression from 5L -> 2.5L should raise temperature noticeably
        val adia = params.toMutableMap().apply { put("processMode", 3.0) }
        engine.syncParamsLive(adia, "volume", 5.0, 2.5)
        assertTrue("Adiabatic compression must raise T", adia["temperature"]!! > 390.0)
    }

    @Test
    fun opticsThinLensAndTotalInternalReflection() {
        val lens = ExperimentTopic.OPTICS.defaultParams().apply {
            put("optMode", 0.0)
            put("focalLen", 15.0)
            put("objDist", 30.0)
            put("objHeight", 6.0)
        }
        val engine = PhysicsEngine(ExperimentTopic.OPTICS)
        val snap = engine.captureTelemetry(lens)
        assertEquals("30.0", snap.metrics[0].value) // f = 30.0 cm
        assertEquals("1.00", snap.metrics[1].value) // |Gamma| = 1.00

        val tir = ExperimentTopic.OPTICS.defaultParams().apply {
            put("optMode", 1.0)
            put("n1", 1.50)
            put("n2", 1.00)
            put("incidentAngle", 60.0)
            put("dispersion", 0.0)
        }
        val tirSnap = engine.captureTelemetry(tir)
        assertTrue(tirSnap.phaseTitle.contains("Полное внутреннее отражение"))
    }

    @Test
    fun orbitsCircularEarthStability() {
        val params = ExperimentTopic.ORBITS.defaultParams().apply {
            put("starMass", 1.0)
            put("orbitR", 1.0)
            put("tangVel", 29.785)
            put("launchAngle", 0.0)
        }
        val engine = PhysicsEngine(ExperimentTopic.ORBITS)
        engine.reset(ExperimentTopic.ORBITS, params)
        repeat(200) { engine.step(0.02, params) }
        val r = hypot(engine.orbitPos.x, engine.orbitPos.y)
        assertEquals("Circular Earth orbit should stay near 1 AU", 1.0, r, 0.03)
    }

    @Test
    fun buoyancyArchimedesFloatAndSink() {
        val wood = ExperimentTopic.BUOYANCY.defaultParams().apply {
            put("liquidDensity", 1000.0)
            put("bodyDensity", 500.0)
            put("holdSensor", 0.0)
        }
        val eWood = PhysicsEngine(ExperimentTopic.BUOYANCY).apply { reset(ExperimentTopic.BUOYANCY, wood) }
        repeat(200) { eWood.step(0.02, wood) }
        assertEquals("500 kg/m3 body in 1000 kg/m3 water should settle near 50% submerged", 0.5, eWood.buoySubmergedFrac, 0.08)

        val iron = ExperimentTopic.BUOYANCY.defaultParams().apply {
            put("liquidDensity", 1000.0)
            put("bodyDensity", 7800.0)
            put("holdSensor", 0.0)
        }
        val eIron = PhysicsEngine(ExperimentTopic.BUOYANCY).apply { reset(ExperimentTopic.BUOYANCY, iron) }
        repeat(200) { eIron.step(0.02, iron) }
        assertEquals("Iron should sink to 100% submerged in water", 1.0, eIron.buoySubmergedFrac, 0.01)
    }

    @Test
    fun inclinedPlaneStaticVsSlidingFriction() {
        val gentle = ExperimentTopic.INCLINED_PLANE.defaultParams().apply {
            put("slopeAngle", 10.0)
            put("frictionMu", 0.35)
            put("pullForce", 0.0)
        }
        val eGentle = PhysicsEngine(ExperimentTopic.INCLINED_PLANE).apply { reset(ExperimentTopic.INCLINED_PLANE, gentle) }
        repeat(100) { eGentle.step(0.02, gentle) }
        assertFalse("Block should stay at rest when tan(10)<0.35", eGentle.slopeIsSliding)

        val steep = gentle.toMutableMap().apply { put("slopeAngle", 40.0) }
        val eSteep = PhysicsEngine(ExperimentTopic.INCLINED_PLANE).apply { reset(ExperimentTopic.INCLINED_PLANE, steep) }
        repeat(50) { eSteep.step(0.02, steep) }
        assertTrue("Block should slide down when tan(40)>0.35", eSteep.slopeVel < -0.5)
    }

    @Test
    fun electrostaticsCyclotronPreservesSpeed() {
        val cyc = ExperimentTopic.ELECTROSTATICS.defaultParams().apply {
            put("fieldMode", 1.0)
            put("charge", 1.0)
            put("v0", 9.0)
            put("eField", 0.0)
            put("bField", 8.0)
        }
        val eng = PhysicsEngine(ExperimentTopic.ELECTROSTATICS).apply { reset(ExperimentTopic.ELECTROSTATICS, cyc) }
        repeat(120) { eng.step(0.02, cyc) }
        val speed = hypot(eng.chargeVel.x, eng.chargeVel.y)
        assertEquals("Magnetic Lorentz force must preserve speed", 9.0, speed, 0.05)
    }

    @Test
    fun electromagneticInductionZeroWhenStaticNonZeroWhenMoving() {
        val staticParams = ExperimentTopic.ELECTROMAGNETIC.defaultParams().apply {
            put("autoOscillate", 0.0)
        }
        val eng = PhysicsEngine(ExperimentTopic.ELECTROMAGNETIC).apply { reset(ExperimentTopic.ELECTROMAGNETIC, staticParams) }
        repeat(40) { eng.step(0.02, staticParams) }
        assertEquals("No induced EMF when magnet is stationary", 0.0, eng.inducedEmf, 0.02)

        val movingParams = staticParams.toMutableMap().apply { put("autoOscillate", 1.0); put("freq", 1.0) }
        eng.reset(ExperimentTopic.ELECTROMAGNETIC, movingParams)
        var maxEmf = 0.0
        repeat(80) {
            eng.step(0.02, movingParams)
            maxEmf = kotlin.math.max(maxEmf, abs(eng.inducedEmf))
        }
        assertTrue("Moving magnet must induce significant EMF", maxEmf > 1.0)
    }

    @Test
    fun photoelectricRedThresholdStopsCurrent() {
        val uv = ExperimentTopic.PHOTOELECTRIC.defaultParams().apply {
            put("cathodeMetal", 0.0) // Cesium 2.14 eV -> lambda_red ~ 579 nm
            put("wavelengthNm", 360.0)
            put("voltage", 1.5)
        }
        val eUv = PhysicsEngine(ExperimentTopic.PHOTOELECTRIC).apply { reset(ExperimentTopic.PHOTOELECTRIC, uv) }
        repeat(60) { eUv.step(0.02, uv) }
        assertTrue("UV light on Cesium must produce photocurrent", eUv.photoCurrentMa > 1.0)

        val red = uv.toMutableMap().apply { put("wavelengthNm", 700.0) }
        val eRed = PhysicsEngine(ExperimentTopic.PHOTOELECTRIC).apply { reset(ExperimentTopic.PHOTOELECTRIC, red) }
        repeat(60) { eRed.step(0.02, red) }
        assertEquals("Red light above threshold must produce zero current", 0.0, eRed.photoCurrentMa, 0.01)
    }

    @Test
    fun radioactiveDecayFollowsHalfLifeApproximately() {
        val params = ExperimentTopic.RADIOACTIVE.defaultParams().apply {
            put("halfLife", 2.0)
            put("nucleiCount", 400.0)
        }
        val eng = PhysicsEngine(ExperimentTopic.RADIOACTIVE).apply { reset(ExperimentTopic.RADIOACTIVE, params) }
        // Step for exactly 1 half-life (2.0s)
        repeat(100) { eng.step(0.02, params) }
        assertTrue("After 1 half-life ~200 of 400 nuclei remain (got ${eng.aliveNuclei})", eng.aliveNuclei in 150..250)
    }

    @Test
    fun readyLabWorksHaveValidTopicsAndParams() {
        val labs = ExperimentTopic.readyLabWorks()
        assertTrue("Should have at least 12 ready lab works", labs.size >= 12)
        for (lw in labs) {
            assertTrue(lw.title.isNotBlank())
            assertTrue(lw.goal.isNotBlank())
            val defaults = lw.topic.defaultParams()
            for (k in lw.initialParams.keys) {
                assertTrue("ReadyLab ${lw.id} uses unknown param $k", defaults.containsKey(k))
            }
        }
    }

    @Test
    fun everyTopicHasDescribedParametersAndExplanations() {
        val engine = PhysicsEngine()
        for (topic in ExperimentTopic.entries) {
            val params = topic.defaultParams()
            val descs = topic.descriptors()
            assertTrue("Topic ${topic.id} must have descriptors", descs.isNotEmpty())
            assertTrue("Topic ${topic.id} must have presets", topic.presets().isNotEmpty())
            assertTrue("Topic ${topic.id} must have labTasks", topic.labTasks().isNotEmpty())

            engine.reset(topic, params)
            engine.step(0.02, params)
            val snap = engine.captureTelemetry(params)
            assertTrue(snap.metrics.isNotEmpty())
            assertTrue(snap.phaseTitle.isNotBlank())
            assertTrue(snap.phaseDetail.isNotBlank())

            for (d in descs) {
                val (title, detail) = engine.explainParamChange(topic, d.key, d.defaultValue, d.max, params)
                assertTrue("Explanation title blank for ${topic.id}:${d.key}", title.isNotBlank())
                assertTrue("Explanation detail blank for ${topic.id}:${d.key}", detail.isNotBlank())
            }
        }
    }

    @Test
    fun roomRepositorySerializesAndBuildsReport() {
        val repo = RoomRepository(null)
        val room = repo.createRoom("Тест Маятник", "Иван", "Проверить период", ExperimentTopic.PENDULUM)
        room.measurements.add(
            MeasurementRow(1, 2.01, "Период", linkedMapOf("T" to "2.01 с", "θ" to "15°"))
        )
        val json = RoomRepository.serializeRooms(listOf(room))
        val restored = RoomRepository.deserializeRooms(json)
        assertEquals(1, restored.size)
        assertEquals("Тест Маятник", restored[0].name)
        assertEquals(ExperimentTopic.PENDULUM, restored[0].topic)
        assertEquals(1, restored[0].measurements.size)

        val engine = PhysicsEngine(ExperimentTopic.PENDULUM).apply { reset(ExperimentTopic.PENDULUM, room.params) }
        val report = repo.buildLabReportText(room, engine.captureTelemetry(room.params))
        assertTrue(report.contains("Тест Маятник"))
        assertTrue(report.contains("Иван"))
        assertTrue(report.contains("T=2.01 с"))
    }
}
