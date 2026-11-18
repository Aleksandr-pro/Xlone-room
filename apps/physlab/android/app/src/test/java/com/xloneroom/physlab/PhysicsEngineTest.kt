package com.xloneroom.physlab

import com.xloneroom.physlab.engine.PhysicsEngine
import com.xloneroom.physlab.model.*
import com.xloneroom.physlab.storage.RoomRepository
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sqrt

class PhysicsEngineTest {

    @Test
    fun ballisticsVacuumMatchesAnalyticalRangeAndHeight() {
        val params = ExperimentTopic.BALLISTICS.defaultParams().apply {
            put("v0", 20.0)
            put("angle", 45.0)
            put("height", 0.0)
            put("gravity", 9.81)
            put("drag", 0.0)
            put("wind", 0.0)
            put("restitution", 0.0)
        }
        val engine = PhysicsEngine(ExperimentTopic.BALLISTICS)
        engine.reset(ExperimentTopic.BALLISTICS, params)

        for (i in 0 until 200) {
            engine.step(0.02, params)
            if (engine.ballLanded) break
        }
        assertTrue("Ball should land within 4s", engine.ballLanded)
        val expectedRange = (20.0 * 20.0) / 9.81
        val expectedMaxH = (20.0 * 20.0 * 0.5) / (2.0 * 9.81)
        assertEquals(expectedRange, engine.ballRange, 0.5)
        assertEquals(expectedMaxH, engine.ballMaxH, 0.15)
    }

    @Test
    fun ballisticsAirDragReducesRange() {
        val vacuum = ExperimentTopic.BALLISTICS.defaultParams().apply { put("drag", 0.0); put("restitution", 0.0) }
        val air = ExperimentTopic.BALLISTICS.defaultParams().apply { put("drag", 0.08); put("restitution", 0.0) }

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

        repeat(180) { engine.step(0.02, params) }
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
            put("rInternal", 0.0)
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
            put("gasProcess", 0.0)
            put("moles", 1.0)
            put("temperature", 300.0)
            put("volume", 5.0)
        }
        val engine = PhysicsEngine(ExperimentTopic.IDEAL_GAS)
        engine.reset(ExperimentTopic.IDEAL_GAS, params)
        val expectedP = (1.0 * 8.314 * 300.0) / 5.0 // kPa
        assertEquals(expectedP, engine.gasIdealPressureKpa, 0.2)

        // Adiabatic compression from 5L -> 2.5L should raise temperature by 2^(2/3)
        val adia = params.toMutableMap().apply { put("gasProcess", 2.0) }
        engine.syncParamsLive(adia, "volume", 5.0, 2.5)
        assertTrue("Adiabatic compression must raise T", adia["temperature"]!! > 450.0)
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
        assertEquals("30.0", snap.metrics[0].value) // f = 30 cm
        assertEquals("-1.00×", snap.metrics[1].value) // Gamma = -1

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
            put("r0", 1.0)
            put("tangVel", 29.78)
        }
        val engine = PhysicsEngine(ExperimentTopic.ORBITS)
        engine.reset(ExperimentTopic.ORBITS, params)
        repeat(200) { engine.step(0.02, params) }
        val r = kotlin.math.hypot(engine.orbitPos.x, engine.orbitPos.y)
        assertEquals("Circular Earth orbit should stay near 1 AU", 1.0, r, 0.03)
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
