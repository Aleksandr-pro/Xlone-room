package com.xloneroom.physlab.engine

import com.xloneroom.physlab.model.*
import java.util.Locale
import kotlin.math.*

class PhysicsEngine(var topic: ExperimentTopic = ExperimentTopic.BALLISTICS) {

    var simTime: Double = 0.0
        private set

    // Ballistics state (SI: meters, m/s)
    var ballPos = Vec2(0.0, 2.0)
    var ballVel = Vec2(16.97, 16.97)
    var ballMaxH = 2.0
    var ballRange = 0.0
    var ballBounces = 0
    val ballTrail = mutableListOf<TracePoint>()
    val vacuumTrail = mutableListOf<TracePoint>()

    // Pendulum state
    var pendAngle = 0.61 // rad
    var pendOmega = 0.0  // rad/s
    var springPos = 0.45 // m
    var springVel = 0.0  // m/s
    var measuredPeriod = 0.0
    private var lastZeroCrossTime = -1.0
    private var prevSignVal = 0.0
    val pendTrail = mutableListOf<TracePoint>()

    // Collisions state (track from -10 to +10 m)
    var colX1 = -4.5
    var colX2 = 3.5
    var colV1 = 5.0
    var colV2 = -2.0
    var colImpactFlash = 0.0
    var colLastDeltaE = 0.0
    var colCount = 0

    // Circuits state
    var capVoltage = 0.0
    var electronPhase = 0.0
    var circuitCurrent = 0.0
    var circuitVExt = 0.0
    var circuitPower = 0.0

    // Ideal Gas state (box x in [0..10], y in [0..10] where y=0 is bottom, y=boxH is piston)
    val gasMolecules = mutableListOf<GasMolecule>()
    var gasMeasuredPressureKpa = 101.3
    private var wallImpulseAccum = 0.0
    private var pressureWindowTime = 0.0
    var gasCollisionFlash = 0.0
    private var refIsobarT = 300.0
    private var refIsobarV = 5.0

    // Waves state
    var wavePhase = 0.0

    // Buoyancy state (y in [-1.0 .. +1.0], 0.0 is water surface)
    var buoyY = 0.55
    var buoyVy = 0.0
    var buoySubmergedFrac = 0.0

    // Inclined plane state (position along 0..10 m ramp)
    var slopePos = 7.5
    var slopeVel = 0.0
    var slopeAccel = 0.0
    var slopeIsSliding = false

    // Electrostatics & Lorentz force state (chamber x in [0..10], y in [-4..4])
    var chargePos = Vec2(0.5, 0.0)
    var chargeVel = Vec2(9.0, 0.0)
    val chargeTrail = mutableListOf<TracePoint>()

    // Electromagnetic induction state (magnet x in [-1.0..1.0], 0 is coil center)
    var magPosX = -0.75
    var magVelX = 0.0
    var magFlux = 0.0
    var inducedEmf = 0.0
    var inducedCurrent = 0.0
    var manualMagTargetX: Double? = null

    // Photoelectric effect state
    val photoElectrons = mutableListOf<PhotoElectron>()
    var photoCurrentMa = 0.0
    private var photoEmitAccum = 0.0

    // Radioactive decay state
    val decayAtoms = mutableListOf<DecayAtom>()
    var aliveNuclei = 225
    var decayedNuclei = 0

    // Orbits state (AU, AU/yr; 1 AU/yr * 4.7405 = km/s)
    var orbitPos = Vec2(1.2, 0.0)
    var orbitVel = Vec2(0.0, 5.74)
    var orbitRMin = 1.2
    var orbitRMax = 1.2
    val orbitTrail = mutableListOf<TracePoint>()
    val keplerSectors = mutableListOf<List<Vec2>>()
    private var sectorTimer = 0.0
    private var currentSector = mutableListOf<Vec2>()

    // Live graph history: list of (time, channelValues)
    val history = mutableListOf<Pair<Double, DoubleArray>>()
    val pvHistory = mutableListOf<Pair<Double, Double>>()

    // Events emitted during simulation for the student journal
    val pendingEvents = mutableListOf<Pair<String, String>>()

    private var rngSeed = 1337L

    private fun nextRand(): Double {
        rngSeed = (rngSeed * 6364136223846793005L + 1442695040888963407L)
        val bits = ((rngSeed ushr 11) and 0x1fffffffffffffL).toDouble()
        return bits / 9007199254740992.0
    }

    fun reset(newTopic: ExperimentTopic, params: Map<String, Double>) {
        topic = newTopic
        simTime = 0.0
        history.clear()
        pvHistory.clear()
        pendingEvents.clear()

        when (topic) {
            ExperimentTopic.BALLISTICS -> {
                val v0 = p(params, "v0", 24.0)
                val deg = p(params, "angle", 45.0)
                val h0 = p(params, "height", 2.0)
                val rad = Math.toRadians(deg)
                ballPos = Vec2(0.0, h0)
                ballVel = Vec2(v0 * cos(rad), v0 * sin(rad))
                ballMaxH = h0
                ballRange = 0.0
                ballBounces = 0
                ballTrail.clear()
                ballTrail.add(TracePoint(ballPos.x, ballPos.y, 0.0))
                recomputeVacuumRef(params)
            }
            ExperimentTopic.PENDULUM -> {
                val a0 = p(params, "angle0", 35.0)
                pendAngle = Math.toRadians(a0)
                pendOmega = 0.0
                springPos = a0 * 0.025 // dm-scaled meters
                springVel = 0.0
                measuredPeriod = 0.0
                lastZeroCrossTime = -1.0
                prevSignVal = if (p(params, "mode", 0.0) < 0.5) pendAngle else springPos
                pendTrail.clear()
            }
            ExperimentTopic.COLLISIONS -> {
                colX1 = -4.5
                colX2 = 3.5
                colV1 = p(params, "v1", 5.0)
                colV2 = p(params, "v2", -2.0)
                colImpactFlash = 0.0
                colLastDeltaE = 0.0
                colCount = 0
            }
            ExperimentTopic.CIRCUITS -> {
                capVoltage = 0.0
                electronPhase = 0.0
                updateCircuitInstant(params)
            }
            ExperimentTopic.IDEAL_GAS -> {
                refIsobarT = p(params, "temperature", 300.0)
                refIsobarV = p(params, "volume", 5.0)
                initGasMolecules(params)
                gasMeasuredPressureKpa = computeTheoreticalGasPressure(params)
                wallImpulseAccum = 0.0
                pressureWindowTime = 0.0
                pvHistory.add(p(params, "volume", 5.0) to gasMeasuredPressureKpa)
            }
            ExperimentTopic.OPTICS -> {
                // Static/instantaneous optical ray tracer
            }
            ExperimentTopic.WAVES -> {
                wavePhase = 0.0
            }
            ExperimentTopic.BUOYANCY -> {
                buoyY = 0.45
                buoyVy = 0.0
                updateBuoyancySubmersion(params)
            }
            ExperimentTopic.INCLINED_PLANE -> {
                slopePos = if (p(params, "pullForce", 0.0) > 5.0) 1.5 else 7.8
                slopeVel = 0.0
                slopeAccel = 0.0
                slopeIsSliding = false
            }
            ExperimentTopic.ELECTROSTATICS -> {
                resetChargeParticle(params)
            }
            ExperimentTopic.ELECTROMAGNETIC -> {
                magPosX = -0.8
                magVelX = 0.0
                manualMagTargetX = null
                updateInductionInstant(params)
            }
            ExperimentTopic.PHOTOELECTRIC -> {
                photoElectrons.clear()
                photoCurrentMa = 0.0
                photoEmitAccum = 0.0
            }
            ExperimentTopic.RADIOACTIVE -> {
                initRadioactiveNuclei(params)
            }
            ExperimentTopic.ORBITS -> {
                val r0 = p(params, "orbitR", 1.2)
                val vKmS = p(params, "tangVel", 27.2)
                val angDeg = p(params, "launchAngle", 0.0)
                val vAuYr = vKmS / 4.74047
                val rad = Math.toRadians(angDeg)
                orbitPos = Vec2(r0, 0.0)
                // Launch at (r0, 0) predominantly +Y tangential, tilted by launchAngle
                orbitVel = Vec2(vAuYr * sin(rad), vAuYr * cos(rad))
                orbitRMin = r0
                orbitRMax = r0
                orbitTrail.clear()
                orbitTrail.add(TracePoint(orbitPos.x, orbitPos.y, 0.0))
                keplerSectors.clear()
                currentSector = mutableListOf(Vec2(orbitPos.x, orbitPos.y))
                sectorTimer = 0.0
            }
        }
        recordHistorySample(params)
    }

    private fun p(params: Map<String, Double>, key: String, fallback: Double): Double =
        params[key] ?: fallback

    fun recomputeVacuumRef(params: Map<String, Double>) {
        vacuumTrail.clear()
        val v0 = p(params, "v0", 24.0)
        val rad = Math.toRadians(p(params, "angle", 45.0))
        val h0 = p(params, "height", 2.0)
        val g = p(params, "gravity", 9.81)
        val vx = v0 * cos(rad)
        val vy = v0 * sin(rad)
        val disc = vy * vy + 2.0 * g * h0
        val tFlight = (vy + sqrt(max(0.0, disc))) / max(0.1, g)
        val steps = 48
        for (i in 0..steps) {
            val t = tFlight * i / steps
            val x = vx * t
            val y = max(0.0, h0 + vy * t - 0.5 * g * t * t)
            vacuumTrail.add(TracePoint(x, y, t))
        }
    }

    private fun initGasMolecules(params: Map<String, Double>) {
        gasMolecules.clear()
        val count = p(params, "particles", 75.0).toInt().coerceIn(10, 180)
        val vol = p(params, "volume", 5.0)
        val boxH = (vol / 10.0) * 10.0 // V in [1.5..10] -> height in [1.5..10]
        val temp = p(params, "temperature", 300.0)
        val molar = p(params, "molarMass", 28.0)
        val targetSpeed = gasMeanSpeedScale(temp, molar)
        for (i in 0 until count) {
            val x = 0.4 + nextRand() * 9.2
            val y = 0.3 + nextRand() * max(0.5, boxH - 0.6)
            val ang = nextRand() * 2.0 * PI
            val spd = targetSpeed * (0.55 + 0.9 * nextRand())
            gasMolecules.add(GasMolecule(x, y, spd * cos(ang), spd * sin(ang)))
        }
    }

    private fun gasMeanSpeedScale(tempK: Double, molarG: Double): Double {
        // Scaled visual speed (units/s) proportional to sqrt(T / M)
        return 2.6 * sqrt((tempK / 300.0) * (28.0 / max(2.0, molarG)))
    }

    fun computeTheoreticalGasPressure(params: Map<String, Double>): Double {
        // P = (N * k_scale * T) / V calibrated so N=75, T=300K, V=5.0L -> ~101.3 kPa
        val n = p(params, "particles", 75.0)
        val t = p(params, "temperature", 300.0)
        val v = max(0.5, p(params, "volume", 5.0))
        return (n / 75.0) * (t / 300.0) * (5.0 / v) * 101.325
    }

    fun syncParamsLive(
        params: MutableMap<String, Double>,
        changedKey: String,
        oldVal: Double,
        newVal: Double
    ) {
        when (topic) {
            ExperimentTopic.BALLISTICS -> {
                if (simTime < 0.02 || changedKey in setOf("v0", "angle", "height")) {
                    if (simTime < 0.02) {
                        val v0 = p(params, "v0", 24.0)
                        val rad = Math.toRadians(p(params, "angle", 45.0))
                        val h0 = p(params, "height", 2.0)
                        ballPos = Vec2(0.0, h0)
                        ballVel = Vec2(v0 * cos(rad), v0 * sin(rad))
                        ballMaxH = max(h0, ballMaxH)
                    }
                }
                recomputeVacuumRef(params)
            }
            ExperimentTopic.PENDULUM -> {
                if (changedKey == "angle0") {
                    if (p(params, "mode", 0.0) < 0.5) {
                        pendAngle = Math.toRadians(newVal)
                        pendOmega = 0.0
                    } else {
                        springPos = newVal * 0.025
                        springVel = 0.0
                    }
                } else if (changedKey == "mode") {
                    pendTrail.clear()
                    measuredPeriod = 0.0
                    lastZeroCrossTime = -1.0
                }
            }
            ExperimentTopic.COLLISIONS -> {
                if (simTime < 0.05) {
                    if (changedKey == "v1") colV1 = newVal
                    if (changedKey == "v2") colV2 = newVal
                }
            }
            ExperimentTopic.CIRCUITS -> {
                updateCircuitInstant(params)
            }
            ExperimentTopic.IDEAL_GAS -> {
                val mode = p(params, "processMode", 0.0).toInt()
                if (changedKey == "particles") {
                    val targetCount = newVal.toInt().coerceIn(10, 180)
                    val boxH = p(params, "volume", 5.0).coerceIn(1.5, 10.0)
                    val spd = gasMeanSpeedScale(p(params, "temperature", 300.0), p(params, "molarMass", 28.0))
                    while (gasMolecules.size < targetCount) {
                        val ang = nextRand() * 2.0 * PI
                        gasMolecules.add(
                            GasMolecule(
                                0.4 + nextRand() * 9.2,
                                0.3 + nextRand() * max(0.5, boxH - 0.6),
                                spd * cos(ang),
                                spd * sin(ang)
                            )
                        )
                    }
                    while (gasMolecules.size > targetCount) {
                        gasMolecules.removeAt(gasMolecules.lastIndex)
                    }
                } else if (changedKey == "volume") {
                    val vOld = max(1.0, oldVal)
                    val vNew = max(1.0, newVal)
                    if (mode == 3) {
                        // Adiabatic: T2 = T1 * (V1 / V2)^(gamma - 1)
                        val molar = p(params, "molarMass", 28.0)
                        val gamma = if (molar <= 4.5 || molar >= 39.0) 1.667 else 1.4
                        val tOld = p(params, "temperature", 300.0)
                        val tNew = (tOld * (vOld / vNew).pow(gamma - 1.0)).coerceIn(120.0, 900.0)
                        params["temperature"] = tNew
                    } else if (mode == 2) {
                        // Isobaric: T ~ V
                        val tNew = (refIsobarT * (vNew / max(1.0, refIsobarV))).coerceIn(120.0, 900.0)
                        params["temperature"] = tNew
                    }
                    // Clamp existing molecules into new box height
                    for (m in gasMolecules) {
                        if (m.y > vNew - 0.2) m.y = max(0.25, vNew - 0.25)
                    }
                    rescaleGasSpeeds(params)
                } else if (changedKey == "temperature") {
                    if (mode == 2) {
                        // Isobaric: V ~ T
                        val vNew = (refIsobarV * (newVal / max(80.0, refIsobarT))).coerceIn(1.5, 10.0)
                        params["volume"] = vNew
                        for (m in gasMolecules) {
                            if (m.y > vNew - 0.2) m.y = max(0.25, vNew - 0.25)
                        }
                    }
                    rescaleGasSpeeds(params)
                } else if (changedKey == "molarMass") {
                    rescaleGasSpeeds(params)
                } else if (changedKey == "processMode") {
                    refIsobarT = p(params, "temperature", 300.0)
                    refIsobarV = p(params, "volume", 5.0)
                }
                gasMeasuredPressureKpa = computeTheoreticalGasPressure(params)
                pvHistory.add(p(params, "volume", 5.0) to gasMeasuredPressureKpa)
                if (pvHistory.size > 120) pvHistory.removeAt(0)
            }
            ExperimentTopic.OPTICS -> Unit
            ExperimentTopic.WAVES -> Unit
            ExperimentTopic.BUOYANCY -> {
                if (changedKey == "liquidType") {
                    val rho = when (newVal.toInt()) {
                        0 -> 1000.0
                        1 -> 800.0
                        2 -> 1260.0
                        else -> 13600.0
                    }
                    params["liquidDensity"] = rho
                }
                updateBuoyancySubmersion(params)
            }
            ExperimentTopic.INCLINED_PLANE -> {
                if (changedKey == "pullForce" && newVal > 5.0 && slopePos > 8.5) {
                    slopePos = 1.5
                    slopeVel = 0.0
                }
            }
            ExperimentTopic.ELECTROSTATICS -> {
                if (changedKey in setOf("fieldMode", "v0", "charge")) {
                    if (changedKey == "fieldMode") {
                        when (newVal.toInt()) {
                            0 -> { params["eField"] = 7.0; params["bField"] = 0.0 }
                            1 -> { params["eField"] = 0.0; params["bField"] = 8.0 }
                            else -> { params["eField"] = 8.0; params["bField"] = 8.0 }
                        }
                    }
                    resetChargeParticle(params)
                }
            }
            ExperimentTopic.ELECTROMAGNETIC -> {
                updateInductionInstant(params)
            }
            ExperimentTopic.PHOTOELECTRIC -> Unit
            ExperimentTopic.RADIOACTIVE -> {
                if (changedKey == "isotope") {
                    when (newVal.toInt()) {
                        0 -> params["halfLife"] = 3.0
                        1 -> params["halfLife"] = 7.0
                        2 -> params["halfLife"] = 15.0
                    }
                    initRadioactiveNuclei(params)
                } else if (changedKey == "nucleiCount") {
                    initRadioactiveNuclei(params)
                }
            }
            ExperimentTopic.ORBITS -> {
                if (simTime < 0.05 || changedKey in setOf("orbitR", "tangVel", "launchAngle")) {
                    if (simTime < 0.05) {
                        val r0 = p(params, "orbitR", 1.2)
                        val vKmS = p(params, "tangVel", 27.2)
                        val rad = Math.toRadians(p(params, "launchAngle", 0.0))
                        val vAuYr = vKmS / 4.74047
                        orbitPos = Vec2(r0, 0.0)
                        orbitVel = Vec2(vAuYr * sin(rad), vAuYr * cos(rad))
                        orbitRMin = r0
                        orbitRMax = r0
                        orbitTrail.clear()
                        orbitTrail.add(TracePoint(orbitPos.x, orbitPos.y, 0.0))
                    }
                }
            }
        }
    }

    private fun rescaleGasSpeeds(params: Map<String, Double>) {
        if (gasMolecules.isEmpty()) return
        val targetMean = gasMeanSpeedScale(p(params, "temperature", 300.0), p(params, "molarMass", 28.0))
        val curMean = gasMolecules.sumOf { hypot(it.vx, it.vy) } / gasMolecules.size
        if (curMean > 1e-6) {
            val ratio = targetMean / curMean
            for (m in gasMolecules) {
                m.vx *= ratio
                m.vy *= ratio
            }
        }
    }

    fun step(dtRaw: Double, params: Map<String, Double>) {
        val dt = dtRaw.coerceIn(0.0005, 0.04)
        val subSteps = 4
        val h = dt / subSteps

        for (s in 0 until subSteps) {
            simTime += h
            when (topic) {
                ExperimentTopic.BALLISTICS -> stepBallistics(h, params)
                ExperimentTopic.PENDULUM -> stepPendulum(h, params)
                ExperimentTopic.COLLISIONS -> stepCollisions(h, params)
                ExperimentTopic.CIRCUITS -> stepCircuits(h, params)
                ExperimentTopic.IDEAL_GAS -> stepIdealGas(h, params)
                ExperimentTopic.OPTICS -> Unit
                ExperimentTopic.WAVES -> stepWaves(h, params)
                ExperimentTopic.BUOYANCY -> stepBuoyancy(h, params)
                ExperimentTopic.INCLINED_PLANE -> stepInclinedPlane(h, params)
                ExperimentTopic.ELECTROSTATICS -> stepElectrostatics(h, params)
                ExperimentTopic.ELECTROMAGNETIC -> stepElectromagnetic(h, params)
                ExperimentTopic.PHOTOELECTRIC -> stepPhotoelectric(h, params)
                ExperimentTopic.RADIOACTIVE -> stepRadioactive(h, params)
                ExperimentTopic.ORBITS -> stepOrbits(h, params)
            }
        }
        recordHistorySample(params)
    }

    private fun stepBallistics(h: Double, params: Map<String, Double>) {
        val g = p(params, "gravity", 9.81)
        val m = max(0.1, p(params, "mass", 2.0))
        val cd = p(params, "airDrag", 0.18)
        val wind = p(params, "wind", 0.0)
        val rest = p(params, "restitution", 0.65)
        // Effective k_drag = 0.5 * rho * Cd * A (A ~ 0.03 * m^(2/3))
        val kDrag = 0.5 * 1.225 * cd * 0.035 * m.pow(2.0 / 3.0)

        fun accel(vx: Double, vy: Double): Pair<Double, Double> {
            val rvx = vx - wind
            val rvy = vy
            val spd = hypot(rvx, rvy)
            val ax = -(kDrag / m) * spd * rvx
            val ay = -g - (kDrag / m) * spd * rvy
            return ax to ay
        }

        // RK4 integration
        val vx0 = ballVel.x
        val vy0 = ballVel.y
        val (ax1, ay1) = accel(vx0, vy0)

        val vx2 = vx0 + 0.5 * h * ax1
        val vy2 = vy0 + 0.5 * h * ay1
        val (ax2, ay2) = accel(vx2, vy2)

        val vx3 = vx0 + 0.5 * h * ax2
        val vy3 = vy0 + 0.5 * h * ay2
        val (ax3, ay3) = accel(vx3, vy3)

        val vx4 = vx0 + h * ax3
        val vy4 = vy0 + h * ay3
        val (ax4, ay4) = accel(vx4, vy4)

        ballPos.x += h * (vx0 + 2.0 * vx2 + 2.0 * vx3 + vx4) / 6.0
        ballPos.y += h * (vy0 + 2.0 * vy2 + 2.0 * vy3 + vy4) / 6.0
        ballVel.x += h * (ax1 + 2.0 * ax2 + 2.0 * ax3 + ax4) / 6.0
        ballVel.y += h * (ay1 + 2.0 * ay2 + 2.0 * ay3 + ay4) / 6.0

        if (ballPos.y > ballMaxH) ballMaxH = ballPos.y
        if (ballPos.x > ballRange) ballRange = ballPos.x

        // Ground collision
        if (ballPos.y <= 0.0 && ballVel.y < 0.0) {
            ballPos.y = 0.0
            if (abs(ballVel.y) > 0.45 && rest > 0.03) {
                val eBefore = 0.5 * m * (ballVel.x * ballVel.x + ballVel.y * ballVel.y)
                ballVel.y = -ballVel.y * rest
                ballVel.x *= (0.85 + 0.14 * rest)
                ballBounces++
                val eAfter = 0.5 * m * (ballVel.x * ballVel.x + ballVel.y * ballVel.y)
                if (ballBounces <= 3) {
                    pendingEvents.add(
                        "Отскок №$ballBounces (x = ${fmt(ballPos.x, 1)} м)" to
                            "При ударе о землю вертикальная скорость инвертировалась и уменьшилась в e = ${fmt(rest, 2)} раз. Потеря энергии ΔE = ${fmt(eBefore - eAfter, 1)} Дж ушла в нагрев и деформацию."
                    )
                }
            } else {
                ballVel.y = 0.0
                ballVel.x *= 0.92
            }
        }

        if (ballTrail.isEmpty() || hypot(ballPos.x - ballTrail.last().x, ballPos.y - ballTrail.last().y) > 0.35) {
            ballTrail.add(TracePoint(ballPos.x, ballPos.y, simTime))
            if (ballTrail.size > 400) ballTrail.removeAt(0)
        }
    }

    private fun stepPendulum(h: Double, params: Map<String, Double>) {
        val mode = p(params, "mode", 0.0).toInt()
        val g = p(params, "gravity", 9.81)
        val L = max(0.2, p(params, "length", 1.4))
        val m = max(0.1, p(params, "mass", 1.5))
        val k = max(1.0, p(params, "stiffness", 24.0))
        val b = p(params, "damping", 0.03)
        val f0 = p(params, "driveAmp", 0.0)
        val wDrive = p(params, "driveFreq", 2.6)

        if (mode == 0) {
            fun alpha(th: Double, om: Double, t: Double): Double =
                -(g / L) * sin(th) - (b / m) * om + (f0 / (m * L)) * cos(wDrive * t)

            val th1 = pendAngle
            val om1 = pendOmega
            val a1 = alpha(th1, om1, simTime)

            val th2 = th1 + 0.5 * h * om1
            val om2 = om1 + 0.5 * h * a1
            val a2 = alpha(th2, om2, simTime + 0.5 * h)

            val th3 = th1 + 0.5 * h * om2
            val om3 = om1 + 0.5 * h * a2
            val a3 = alpha(th3, om3, simTime + 0.5 * h)

            val th4 = th1 + h * om3
            val om4 = om1 + h * a3
            val a4 = alpha(th4, om4, simTime + h)

            pendAngle += h * (om1 + 2.0 * om2 + 2.0 * om3 + om4) / 6.0
            pendOmega += h * (a1 + 2.0 * a2 + 2.0 * a3 + a4) / 6.0

            detectPeriodZeroCrossing(pendAngle)
            val bx = L * sin(pendAngle)
            val by = -L * cos(pendAngle)
            if (pendTrail.isEmpty() || hypot(bx - pendTrail.last().x, by - pendTrail.last().y) > 0.04) {
                pendTrail.add(TracePoint(bx, by, simTime))
                if (pendTrail.size > 160) pendTrail.removeAt(0)
            }
        } else {
            fun acc(x: Double, v: Double, t: Double): Double =
                -(k / m) * x - (b / m) * v + (f0 / m) * cos(wDrive * t)

            val x1 = springPos
            val v1 = springVel
            val a1 = acc(x1, v1, simTime)

            val x2 = x1 + 0.5 * h * v1
            val v2 = v1 + 0.5 * h * a1
            val a2 = acc(x2, v2, simTime + 0.5 * h)

            val x3 = x1 + 0.5 * h * v2
            val v3 = v1 + 0.5 * h * a2
            val a3 = acc(x3, v3, simTime + 0.5 * h)

            val x4 = x1 + h * v3
            val v4 = v1 + h * a3
            val a4 = acc(x4, v4, simTime + h)

            springPos += h * (v1 + 2.0 * v2 + 2.0 * v3 + v4) / 6.0
            springVel += h * (a1 + 2.0 * a2 + 2.0 * a3 + a4) / 6.0

            detectPeriodZeroCrossing(springPos)
        }
    }

    private fun detectPeriodZeroCrossing(curVal: Double) {
        if (prevSignVal < 0.0 && curVal >= 0.0) {
            if (lastZeroCrossTime > 0.0) {
                val p = simTime - lastZeroCrossTime
                if (p > 0.15) measuredPeriod = p
            }
            lastZeroCrossTime = simTime
        }
        prevSignVal = curVal
    }

    private fun stepCollisions(h: Double, params: Map<String, Double>) {
        val m1 = max(0.2, p(params, "m1", 3.0))
        val m2 = max(0.2, p(params, "m2", 1.5))
        val e = p(params, "restitution", 1.0).coerceIn(0.0, 1.0)
        val mu = p(params, "friction", 0.0)
        val g = 9.81

        // Friction deceleration
        if (mu > 0.0) {
            val dv = mu * g * h
            colV1 = if (abs(colV1) <= dv) 0.0 else colV1 - sign(colV1) * dv
            colV2 = if (abs(colV2) <= dv) 0.0 else colV2 - sign(colV2) * dv
        }

        colX1 += colV1 * h
        colX2 += colV2 * h

        val r1 = 0.45 + 0.12 * cbrt(m1)
        val r2 = 0.45 + 0.12 * cbrt(m2)
        val minDist = r1 + r2

        // Ball-to-ball collision
        if (colX2 - colX1 <= minDist && colV1 > colV2) {
            val overlap = minDist - (colX2 - colX1)
            colX1 -= overlap * (m2 / (m1 + m2))
            colX2 += overlap * (m1 / (m1 + m2))

            val eBefore = 0.5 * m1 * colV1 * colV1 + 0.5 * m2 * colV2 * colV2
            val newV1 = (m1 * colV1 + m2 * colV2 - m2 * e * (colV1 - colV2)) / (m1 + m2)
            val newV2 = (m1 * colV1 + m2 * colV2 + m1 * e * (colV1 - colV2)) / (m1 + m2)
            colV1 = newV1
            colV2 = newV2
            val eAfter = 0.5 * m1 * colV1 * colV1 + 0.5 * m2 * colV2 * colV2
            colLastDeltaE = max(0.0, eBefore - eAfter)
            colImpactFlash = 1.0
            colCount++

            val kindLabel = when {
                e >= 0.98 -> "Абсолютно упругий удар"
                e <= 0.02 -> "Абсолютно неупругий удар (слипание)"
                else -> "Неупругий удар (e = ${fmt(e, 2)})"
            }
            pendingEvents.add(
                "$kindLabel #$colCount" to
                    "Шар 1 (${fmt(m1, 1)} кг) → v₁'=${fmt(colV1, 2)} м/с, Шар 2 (${fmt(m2, 1)} кг) → v₂'=${fmt(colV2, 2)} м/с. Суммарный импульс p=${fmt(m1 * colV1 + m2 * colV2, 2)} кг·м/с сохранён! Потеря энергии ΔE=${fmt(colLastDeltaE, 2)} Дж."
            )
        }

        // Track walls [-10.5 .. +10.5]
        val wallLimit = 10.5
        if (colX1 - r1 < -wallLimit) {
            colX1 = -wallLimit + r1
            if (colV1 < 0) colV1 = -colV1 * max(0.5, e)
        }
        if (colX2 + r2 > wallLimit) {
            colX2 = wallLimit - r2
            if (colV2 > 0) colV2 = -colV2 * max(0.5, e)
        }

        if (colImpactFlash > 0.0) colImpactFlash = max(0.0, colImpactFlash - h * 2.5)
    }

    private fun updateCircuitInstant(params: Map<String, Double>) {
        val topo = p(params, "topology", 0.0).toInt()
        val closed = p(params, "switchClosed", 1.0) >= 0.5
        val emf = p(params, "emf", 12.0)
        val rInt = max(0.0, p(params, "rInt", 0.5))
        val r1 = max(0.5, p(params, "r1", 10.0))
        val r2 = max(0.5, p(params, "r2", 14.0))

        if (topo == 2) {
            // RC circuit
            if (closed) {
                val rTotal = r1 + rInt
                circuitCurrent = (emf - capVoltage) / max(0.1, rTotal)
                circuitVExt = capVoltage
                circuitPower = circuitCurrent * circuitCurrent * r1
            } else {
                // Discharging through R2 when switch toggles to load branch
                circuitCurrent = -capVoltage / max(0.1, r2)
                circuitVExt = capVoltage
                circuitPower = circuitCurrent * circuitCurrent * r2
            }
            return
        }

        if (!closed) {
            circuitCurrent = 0.0
            circuitVExt = emf
            circuitPower = 0.0
            return
        }

        val rExt = if (topo == 0) r1 + r2 else (r1 * r2) / (r1 + r2)
        circuitCurrent = emf / max(0.05, rExt + rInt)
        circuitVExt = circuitCurrent * rExt
        circuitPower = circuitCurrent * circuitVExt
    }

    private fun stepCircuits(h: Double, params: Map<String, Double>) {
        val topo = p(params, "topology", 0.0).toInt()
        val closed = p(params, "switchClosed", 1.0) >= 0.5
        val emf = p(params, "emf", 12.0)
        val rInt = max(0.0, p(params, "rInt", 0.5))
        val r1 = max(0.5, p(params, "r1", 10.0))
        val r2 = max(0.5, p(params, "r2", 14.0))
        val capF = max(0.001, p(params, "capacitance", 40.0) / 1000.0) // mF -> F

        if (topo == 2) {
            if (closed) {
                val tau = (r1 + rInt) * capF
                capVoltage += ((emf - capVoltage) / max(0.001, tau)) * h
            } else {
                val tauDis = r2 * capF
                capVoltage += (-capVoltage / max(0.001, tauDis)) * h
            }
        }
        updateCircuitInstant(params)
        electronPhase = (electronPhase + circuitCurrent * h * 0.45) % 1.0
        if (electronPhase < 0.0) electronPhase += 1.0
    }

    private fun stepIdealGas(h: Double, params: Map<String, Double>) {
        val vol = p(params, "volume", 5.0).coerceIn(1.5, 10.0)
        val boxW = 10.0
        val boxH = vol
        val rad = 0.14

        for (mol in gasMolecules) {
            mol.x += mol.vx * h
            mol.y += mol.vy * h

            if (mol.x < rad) {
                mol.x = rad
                mol.vx = abs(mol.vx)
                wallImpulseAccum += 2.0 * abs(mol.vx)
            } else if (mol.x > boxW - rad) {
                mol.x = boxW - rad
                mol.vx = -abs(mol.vx)
                wallImpulseAccum += 2.0 * abs(mol.vx)
            }

            if (mol.y < rad) {
                mol.y = rad
                mol.vy = abs(mol.vy)
                wallImpulseAccum += 2.0 * abs(mol.vy)
            } else if (mol.y > boxH - rad) {
                mol.y = boxH - rad
                mol.vy = -abs(mol.vy)
                wallImpulseAccum += 2.0 * abs(mol.vy)
                gasCollisionFlash = 1.0
            }
        }

        // Pairwise elastic collisions (O(N^2) with N <= 160 is tiny)
        val minD = 2.0 * rad
        val minD2 = minD * minD
        val n = gasMolecules.size
        for (i in 0 until n) {
            val a = gasMolecules[i]
            for (j in i + 1 until n) {
                val b = gasMolecules[j]
                val dx = b.x - a.x
                val dy = b.y - a.y
                val d2 = dx * dx + dy * dy
                if (d2 < minD2 && d2 > 1e-8) {
                    val d = sqrt(d2)
                    val nx = dx / d
                    val ny = dy / d
                    val overlap = 0.5 * (minD - d)
                    a.x -= nx * overlap
                    a.y -= ny * overlap
                    b.x += nx * overlap
                    b.y += ny * overlap

                    val dvx = a.vx - b.vx
                    val dvy = a.vy - b.vy
                    val vn = dvx * nx + dvy * ny
                    if (vn > 0.0) {
                        a.vx -= vn * nx
                        a.vy -= vn * ny
                        b.vx += vn * nx
                        b.vy += vn * ny
                    }
                }
            }
        }

        pressureWindowTime += h
        if (pressureWindowTime >= 0.25) {
            val theo = computeTheoreticalGasPressure(params)
            // Blend theoretical P with micro-fluctuation from wall hits for realism
            val noise = 1.0 + (wallImpulseAccum % 7.0 - 3.5) * 0.004
            gasMeasuredPressureKpa = theo * noise
            wallImpulseAccum = 0.0
            pressureWindowTime = 0.0
        }
        if (gasCollisionFlash > 0.0) gasCollisionFlash = max(0.0, gasCollisionFlash - h * 4.0)
    }

    private fun stepWaves(h: Double, params: Map<String, Double>) {
        val f = p(params, "frequency", 2.5)
        wavePhase += 2.0 * PI * f * h
    }

    private fun updateBuoyancySubmersion(params: Map<String, Double>) {
        // Cube half-height in world [-1..1] units scaled lightly by volume
        val volL = p(params, "bodyVolume", 2.0)
        val halfH = 0.14 + 0.045 * cbrt(volL)
        val bottomY = buoyY - halfH
        val topY = buoyY + halfH
        buoySubmergedFrac = when {
            topY <= 0.0 -> 1.0
            bottomY >= 0.0 -> 0.0
            else -> (-bottomY / (2.0 * halfH)).coerceIn(0.0, 1.0)
        }
    }

    private fun stepBuoyancy(h: Double, params: Map<String, Double>) {
        val hold = p(params, "holdSensor", 0.0) >= 0.5
        updateBuoyancySubmersion(params)
        if (hold) {
            buoyVy = 0.0
            return
        }
        val rhoBody = max(100.0, p(params, "bodyDensity", 750.0))
        val rhoLiq = max(100.0, p(params, "liquidDensity", 1000.0))
        val g = p(params, "gravity", 9.81)
        val aNet = g * ((rhoLiq * buoySubmergedFrac) / rhoBody - 1.0)
        val drag = (0.35 + 4.8 * buoySubmergedFrac) * buoyVy
        buoyVy += (aNet * 0.18 - drag) * h
        buoyY += buoyVy * h

        val volL = p(params, "bodyVolume", 2.0)
        val halfH = 0.14 + 0.045 * cbrt(volL)
        val floorY = -0.92 + halfH
        val ceilY = 0.85 - halfH
        if (buoyY < floorY) {
            buoyY = floorY
            if (buoyVy < 0) buoyVy = -buoyVy * 0.2
        } else if (buoyY > ceilY) {
            buoyY = ceilY
            if (buoyVy > 0) buoyVy = 0.0
        }
        updateBuoyancySubmersion(params)
    }

    private fun stepInclinedPlane(h: Double, params: Map<String, Double>) {
        val alphaRad = Math.toRadians(p(params, "slopeAngle", 28.0))
        val m = max(0.2, p(params, "mass", 4.0))
        val mu = p(params, "frictionMu", 0.25)
        val fPull = p(params, "pullForce", 0.0)
        val g = p(params, "gravity", 9.81)

        val fDown = m * g * sin(alphaRad)
        val nForce = m * g * cos(alphaRad)
        val fFricMax = mu * nForce
        val fDrive = fPull - fDown // + means up-slope

        if (abs(slopeVel) < 0.03 && abs(fDrive) <= fFricMax) {
            slopeVel = 0.0
            slopeAccel = 0.0
            slopeIsSliding = false
        } else {
            val fFric = if (abs(slopeVel) >= 0.03) -sign(slopeVel) * fFricMax else -sign(fDrive) * fFricMax
            slopeAccel = (fDrive + fFric) / m
            slopeVel += slopeAccel * h
            slopePos += slopeVel * h
            slopeIsSliding = abs(slopeVel) > 0.01
        }

        if (slopePos <= 0.4) {
            slopePos = 0.4
            if (slopeVel < 0) {
                slopeVel = 0.0
                slopeAccel = 0.0
                slopeIsSliding = false
            }
        } else if (slopePos >= 9.6) {
            slopePos = 9.6
            if (slopeVel > 0) {
                slopeVel = 0.0
                slopeAccel = 0.0
                slopeIsSliding = false
            }
        }
    }

    private fun resetChargeParticle(params: Map<String, Double>) {
        val mode = p(params, "fieldMode", 0.0).toInt()
        val v0 = p(params, "v0", 9.0)
        chargeTrail.clear()
        if (mode == 1) {
            // Cyclotron starts near center moving +X so full orbit stays centered
            chargePos = Vec2(5.0, -1.5)
            chargeVel = Vec2(v0, 0.0)
        } else {
            chargePos = Vec2(0.5, 0.0)
            chargeVel = Vec2(v0, 0.0)
        }
        chargeTrail.add(TracePoint(chargePos.x, chargePos.y, simTime))
    }

    private fun stepElectrostatics(h: Double, params: Map<String, Double>) {
        val mode = p(params, "fieldMode", 0.0).toInt()
        val q = p(params, "charge", 1.0)
        val m = max(0.3, p(params, "massNum", 1.5))
        val eField = p(params, "eField", 6.0)
        val bField = p(params, "bField", 0.0)

        val eUsed = if (mode == 1) 0.0 else eField
        val bUsed = if (mode == 0) 0.0 else bField

        fun acc(vx: Double, vy: Double): Pair<Double, Double> {
            // F = q*(E_y + v x B_z): ax = (q/m)*(vy * B), ay = (q/m)*(E - vx * B)
            val k = 0.45 * (q / m)
            val ax = k * (vy * bUsed)
            val ay = k * (eUsed * 1.6 - vx * bUsed)
            return ax to ay
        }

        val (ax1, ay1) = acc(chargeVel.x, chargeVel.y)
        val (ax2, ay2) = acc(chargeVel.x + 0.5 * h * ax1, chargeVel.y + 0.5 * h * ay1)
        val (ax3, ay3) = acc(chargeVel.x + 0.5 * h * ax2, chargeVel.y + 0.5 * h * ay2)
        val (ax4, ay4) = acc(chargeVel.x + h * ax3, chargeVel.y + h * ay3)

        chargeVel.x += h * (ax1 + 2.0 * ax2 + 2.0 * ax3 + ax4) / 6.0
        chargeVel.y += h * (ay1 + 2.0 * ay2 + 2.0 * ay3 + ay4) / 6.0
        chargePos.x += chargeVel.x * h * 0.45
        chargePos.y += chargeVel.y * h * 0.45

        if (chargeTrail.isEmpty() || hypot(chargePos.x - chargeTrail.last().x, chargePos.y - chargeTrail.last().y) > 0.12) {
            chargeTrail.add(TracePoint(chargePos.x, chargePos.y, simTime))
            if (chargeTrail.size > 260) chargeTrail.removeAt(0)
        }

        if (chargePos.x < -0.5 || chargePos.x > 10.5 || abs(chargePos.y) > 4.2) {
            resetChargeParticle(params)
        }
    }

    private fun updateInductionInstant(params: Map<String, Double>) {
        val turns = p(params, "turns", 80.0)
        val b = p(params, "magStrength", 1.2)
        val r = max(0.5, p(params, "coilRes", 10.0))
        val pol = if (p(params, "polarity", 0.0) < 0.5) 1.0 else -1.0

        val phiSingle = pol * b * exp(-6.0 * magPosX * magPosX) * 0.025 // Wb per turn
        val dPhiDx = -12.0 * magPosX * phiSingle
        magFlux = turns * phiSingle
        inducedEmf = -turns * dPhiDx * magVelX
        inducedCurrent = inducedEmf / r
    }

    private fun stepElectromagnetic(h: Double, params: Map<String, Double>) {
        val auto = p(params, "autoOscillate", 1.0) >= 0.5
        val f = p(params, "freq", 0.8)
        if (auto) {
            val w = 2.0 * PI * f
            magPosX = 0.85 * sin(w * simTime)
            magVelX = 0.85 * w * cos(w * simTime)
        } else {
            val tgt = manualMagTargetX
            if (tgt != null) {
                val prev = magPosX
                magPosX = (magPosX + (tgt - magPosX) * min(1.0, h * 18.0)).coerceIn(-0.95, 0.95)
                magVelX = (magPosX - prev) / max(1e-4, h)
                if (abs(tgt - magPosX) < 0.002) {
                    manualMagTargetX = null
                    magVelX *= 0.5
                }
            } else {
                magVelX *= max(0.0, 1.0 - h * 12.0)
            }
        }
        updateInductionInstant(params)
    }

    fun getWorkFunctionEv(params: Map<String, Double>): Double = when (p(params, "cathodeMetal", 0.0).toInt()) {
        0 -> 2.14 // Cesium
        1 -> 2.30 // Potassium
        2 -> 4.30 // Zinc
        else -> 5.65 // Platinum
    }

    private fun stepPhotoelectric(h: Double, params: Map<String, Double>) {
        val lambdaNm = max(100.0, p(params, "wavelengthNm", 400.0))
        val intensity = p(params, "intensity", 65.0)
        val uVolt = p(params, "voltage", 1.0)
        val ePhotonEv = 1239.84 / lambdaNm
        val aWorkEv = getWorkFunctionEv(params)
        val ekMaxEv = max(0.0, ePhotonEv - aWorkEv)

        if (ekMaxEv > 0.02) {
            val emitRate = (intensity / 100.0) * 22.0
            photoEmitAccum += emitRate * h
            while (photoEmitAccum >= 1.0 && photoElectrons.size < 45) {
                photoEmitAccum -= 1.0
                val spd = 1.6 + 2.2 * sqrt(ekMaxEv) * (0.4 + 0.6 * nextRand())
                val vy = (nextRand() - 0.5) * 0.6
                val y = 0.15 + nextRand() * 0.70
                photoElectrons.add(PhotoElectron(0.08, y, spd, vy, true))
            }
        }

        var hits = 0
        val accX = uVolt * 2.4
        val it = photoElectrons.iterator()
        while (it.hasNext()) {
            val e = it.next()
            e.vx += accX * h
            e.x += e.vx * h * 0.38
            e.y += e.vy * h * 0.25
            if (e.x >= 0.92) {
                hits++
                it.remove()
            } else if (e.x <= 0.04 || e.y <= 0.05 || e.y >= 0.95) {
                it.remove()
            }
        }

        // Smooth steady-state photocurrent calculation in mA
        val targetI = if (ekMaxEv <= 0.0) {
            0.0
        } else {
            val stoppingU = -ekMaxEv
            if (uVolt <= stoppingU) 0.0
            else {
                val sat = (intensity / 100.0) * 12.0 * (ekMaxEv / (ekMaxEv + 1.2))
                val frac = ((uVolt - stoppingU) / (ekMaxEv + 0.6)).coerceIn(0.0, 1.0)
                sat * frac
            }
        }
        photoCurrentMa += (targetI - photoCurrentMa) * min(1.0, h * 8.0) + hits * 0.0
    }

    private fun initRadioactiveNuclei(params: Map<String, Double>) {
        val count = p(params, "nucleiCount", 225.0).toInt().coerceIn(36, 400)
        decayAtoms.clear()
        repeat(count) { decayAtoms.add(DecayAtom(decayed = false, flash = 0.0)) }
        aliveNuclei = count
        decayedNuclei = 0
    }

    private fun stepRadioactive(h: Double, params: Map<String, Double>) {
        val halfLife = max(0.5, p(params, "halfLife", 4.0))
        val lambda = ln(2.0) / halfLife
        val prob = 1.0 - exp(-lambda * h)
        var alive = 0
        var decayed = 0
        for (atom in decayAtoms) {
            if (!atom.decayed) {
                if (nextRand() < prob) {
                    atom.decayed = true
                    atom.flash = 1.0
                    decayed++
                } else {
                    alive++
                }
            } else {
                if (atom.flash > 0.0) atom.flash = max(0.0, atom.flash - h * 2.8)
                decayed++
            }
        }
        aliveNuclei = alive
        decayedNuclei = decayed
    }

    private fun stepOrbits(h: Double, params: Map<String, Double>) {
        // Scaled time: 1 sim second = 0.12 orbital years so orbits move pleasantly on screen
        val dtYr = h * 0.12
        val gm = 4.0 * PI * PI * p(params, "starMass", 1.0)

        fun acc(px: Double, py: Double): Pair<Double, Double> {
            val r2 = max(0.04, px * px + py * py)
            val r = sqrt(r2)
            val invR3 = -gm / (r2 * r)
            return (px * invR3) to (py * invR3)
        }

        val x1 = orbitPos.x; val y1 = orbitPos.y
        val vx1 = orbitVel.x; val vy1 = orbitVel.y
        val (ax1, ay1) = acc(x1, y1)

        val x2 = x1 + 0.5 * dtYr * vx1; val y2 = y1 + 0.5 * dtYr * vy1
        val vx2 = vx1 + 0.5 * dtYr * ax1; val vy2 = vy1 + 0.5 * dtYr * ay1
        val (ax2, ay2) = acc(x2, y2)

        val x3 = x1 + 0.5 * dtYr * vx2; val y3 = y1 + 0.5 * dtYr * vy2
        val vx3 = vx1 + 0.5 * dtYr * ax2; val vy3 = vy1 + 0.5 * dtYr * ay2
        val (ax3, ay3) = acc(x3, y3)

        val x4 = x1 + dtYr * vx3; val y4 = y1 + dtYr * vy3
        val vx4 = vx1 + dtYr * ax3; val vy4 = vy1 + dtYr * ay3
        val (ax4, ay4) = acc(x4, y4)

        orbitPos.x += dtYr * (vx1 + 2.0 * vx2 + 2.0 * vx3 + vx4) / 6.0
        orbitPos.y += dtYr * (vy1 + 2.0 * vy2 + 2.0 * vy3 + vy4) / 6.0
        orbitVel.x += dtYr * (ax1 + 2.0 * ax2 + 2.0 * ax3 + ax4) / 6.0
        orbitVel.y += dtYr * (ay1 + 2.0 * ay2 + 2.0 * ay3 + ay4) / 6.0

        val r = hypot(orbitPos.x, orbitPos.y)
        orbitRMin = min(orbitRMin, r)
        orbitRMax = max(orbitRMax, r)

        if (orbitTrail.isEmpty() || hypot(orbitPos.x - orbitTrail.last().x, orbitPos.y - orbitTrail.last().y) > 0.04) {
            orbitTrail.add(TracePoint(orbitPos.x, orbitPos.y, simTime))
            if (orbitTrail.size > 480) orbitTrail.removeAt(0)
        }

        // Record Kepler equal-time area sectors every 0.8s
        sectorTimer += h
        currentSector.add(Vec2(orbitPos.x, orbitPos.y))
        if (sectorTimer >= 0.8) {
            if (currentSector.size >= 3) {
                keplerSectors.add(currentSector.toList())
                if (keplerSectors.size > 8) keplerSectors.removeAt(0)
            }
            currentSector = mutableListOf(Vec2(orbitPos.x, orbitPos.y))
            sectorTimer = 0.0
        }
    }

    private fun recordHistorySample(params: Map<String, Double>) {
        if (history.isNotEmpty() && simTime - history.last().first < 0.045) return
        val t = captureTelemetry(params)
        val vals = t.graphChannels.map { it.currentValue }.toDoubleArray()
        history.add(simTime to vals)
        if (history.size > 220) history.removeAt(0)
    }

    fun captureTelemetry(params: Map<String, Double>): TelemetrySnapshot = when (topic) {
        ExperimentTopic.BALLISTICS -> {
            val g = p(params, "gravity", 9.81)
            val m = p(params, "mass", 2.0)
            val cd = p(params, "airDrag", 0.18)
            val v = hypot(ballVel.x, ballVel.y)
            val ek = 0.5 * m * v * v
            val ep = m * g * max(0.0, ballPos.y)
            val e0 = 0.5 * m * p(params, "v0", 24.0).pow(2) + m * g * p(params, "height", 2.0)
            val eLost = max(0.0, e0 - (ek + ep))

            val (phaseT, phaseD) = when {
                ballPos.y <= 0.02 && abs(ballVel.y) < 0.2 -> "Остановка на поверхности" to
                    "Тело завершило движение на дальности ${fmt(ballRange, 2)} м после $ballBounces отскок(ов). Полная потеря механической энергии ΔE = ${fmt(eLost, 1)} Дж."
                ballVel.y > 0.3 -> "Фаза подъёма (торможение)" to
                    "Вертикальная скорость v_y = +${fmt(ballVel.y, 1)} м/с уменьшается под действием тяжести (${fmt(m * g, 1)} Н) и сопротивления воздуха. Кинетическая энергия переходит в потенциальную."
                abs(ballVel.y) <= 0.3 && ballPos.y > 0.2 -> "Вершина траектории (апогей)" to
                    "Вертикальная скорость v_y ≈ 0! Тело достигло максимальной высоты h_max = ${fmt(ballMaxH, 2)} м; осталась только горизонтальная скорость v_x = ${fmt(ballVel.x, 1)} м/с."
                else -> "Фаза свободного падения" to
                    "Тело ускоряется вниз (v_y = ${fmt(ballVel.y, 1)} м/с). ${if (cd > 0.01) "Сопротивление воздуха сглаживает траекторию и ограничивает скорость." else "В вакууме ускорение строго равно g = ${fmt(g, 2)} м/с²."}"
            }

            TelemetrySnapshot(
                simTime = simTime,
                phaseTitle = phaseT,
                phaseDetail = phaseD,
                liveFormula = "E = E_k(${fmt(ek, 1)}) + E_p(${fmt(ep, 1)}) = ${fmt(ek + ep, 1)} Дж | h_max = ${fmt(ballMaxH, 2)} м",
                metrics = listOf(
                    MetricItem("Высота y", fmt(ballPos.y, 2), "м", 0xFF38BDF8),
                    MetricItem("Дальность x", fmt(ballPos.x, 2), "м", 0xFF2DD4BF),
                    MetricItem("Скорость |v|", fmt(v, 2), "м/с", 0xFFF59E0B),
                    MetricItem("Макс. высота", fmt(ballMaxH, 2), "м", 0xFFA855F7)
                ),
                energyKinetic = ek,
                energyPotential = ep,
                energyLost = eLost,
                graphChannels = listOf(
                    GraphChannel("Высота y", "м", 0xFF38BDF8, ballPos.y),
                    GraphChannel("Скорость v", "м/с", 0xFFF59E0B, v),
                    GraphChannel("E_k", "Дж", 0xFFEF4444, ek),
                    GraphChannel("E_p", "Дж", 0xFF22C55E, ep)
                )
            )
        }
        ExperimentTopic.PENDULUM -> {
            val mode = p(params, "mode", 0.0).toInt()
            val g = p(params, "gravity", 9.81)
            val L = max(0.2, p(params, "length", 1.4))
            val m = max(0.1, p(params, "mass", 1.5))
            val k = max(1.0, p(params, "stiffness", 24.0))
            val b = p(params, "damping", 0.03)
            val f0 = p(params, "driveAmp", 0.0)
            val wDrive = p(params, "driveFreq", 2.6)

            if (mode == 0) {
                val tTheo = 2.0 * PI * sqrt(L / g)
                val w0 = sqrt(g / L)
                val v = L * pendOmega
                val h = L * (1.0 - cos(pendAngle))
                val ek = 0.5 * m * v * v
                val ep = m * g * h
                val a0 = Math.toRadians(p(params, "angle0", 35.0))
                val e0 = m * g * L * (1.0 - cos(a0))
                val eLost = max(0.0, e0 - (ek + ep))

                val deg = Math.toDegrees(pendAngle)
                val (pt, pd) = when {
                    f0 > 0.2 && abs(wDrive - w0) < 0.35 -> "Резонанс! (ω ≈ ω₀)" to
                        "Частота внешней силы ${fmt(wDrive, 2)} рад/с совпала с собственной ${fmt(w0, 2)} рад/с — энергия колебаний резко растёт!"
                    abs(deg) < 4.0 -> "Прохождение положения равновесия" to
                        "Угол θ ≈ 0°, вся потенциальная энергия перешла в кинетическую: скорость максимальна (${fmt(abs(v), 2)} м/с)."
                    abs(pendOmega) < 0.2 -> "Крайняя точка отклонения" to
                        "Мгновенная скорость равна нулю (v ≈ 0). Возвращающая сила m·g·sin(θ) = ${fmt(abs(m * g * sin(pendAngle)), 2)} Н максимальна."
                    else -> "Гармоническое качание" to
                        "Угол θ = ${fmt(deg, 1)}°, угловая скорость ω = ${fmt(pendOmega, 2)} рад/с. ${if (b > 0.005) "Трение постепенно рассеивает энергию." else "Колебания незатухающие."}"
                }

                TelemetrySnapshot(
                    simTime = simTime,
                    phaseTitle = pt,
                    phaseDetail = pd,
                    liveFormula = "T_теор = 2π√(${fmt(L, 2)}/${fmt(g, 2)}) = ${fmt(tTheo, 2)} с | ω₀ = ${fmt(w0, 2)} рад/с",
                    metrics = listOf(
                        MetricItem("Угол θ", fmt(deg, 1), "°", 0xFF38BDF8),
                        MetricItem("Скорость v", fmt(v, 2), "м/с", 0xFFF59E0B),
                        MetricItem("T_теор", fmt(tTheo, 2), "с", 0xFF2DD4BF),
                        MetricItem("T_измер", if (measuredPeriod > 0) fmt(measuredPeriod, 2) else "—", "с", 0xFFA855F7)
                    ),
                    energyKinetic = ek,
                    energyPotential = ep,
                    energyLost = eLost,
                    graphChannels = listOf(
                        GraphChannel("Угол θ", "°", 0xFF38BDF8, deg),
                        GraphChannel("Скорость v", "м/с", 0xFFF59E0B, v),
                        GraphChannel("E_k", "Дж", 0xFFEF4444, ek),
                        GraphChannel("E_p", "Дж", 0xFF22C55E, ep)
                    )
                )
            } else {
                val tTheo = 2.0 * PI * sqrt(m / k)
                val w0 = sqrt(k / m)
                val ek = 0.5 * m * springVel * springVel
                val ep = 0.5 * k * springPos * springPos
                val x0 = p(params, "angle0", 45.0) * 0.025
                val e0 = 0.5 * k * x0 * x0
                val eLost = max(0.0, e0 - (ek + ep))

                TelemetrySnapshot(
                    simTime = simTime,
                    phaseTitle = if (abs(springPos) < 0.05) "Равновесие пружины (v = max)" else "Растяжение/сжатие пружины",
                    phaseDetail = "Сила упругости F_упр = -k·x = ${fmt(-k * springPos, 2)} Н возвращает груз ${fmt(m, 1)} кг к нулю. Собственная частота ω₀ = ${fmt(w0, 2)} рад/с.",
                    liveFormula = "T = 2π√(m/k) = 2π√(${fmt(m, 1)}/${fmt(k, 0)}) = ${fmt(tTheo, 2)} с | F = ${fmt(-k * springPos, 1)} Н",
                    metrics = listOf(
                        MetricItem("Смещение x", fmt(springPos * 100.0, 1), "см", 0xFF38BDF8),
                        MetricItem("Скорость v", fmt(springVel, 2), "м/с", 0xFFF59E0B),
                        MetricItem("T_теор", fmt(tTheo, 2), "с", 0xFF2DD4BF),
                        MetricItem("T_измер", if (measuredPeriod > 0) fmt(measuredPeriod, 2) else "—", "с", 0xFFA855F7)
                    ),
                    energyKinetic = ek,
                    energyPotential = ep,
                    energyLost = eLost,
                    graphChannels = listOf(
                        GraphChannel("Смещение x", "м", 0xFF38BDF8, springPos),
                        GraphChannel("Скорость v", "м/с", 0xFFF59E0B, springVel),
                        GraphChannel("E_k", "Дж", 0xFFEF4444, ek),
                        GraphChannel("E_p", "Дж", 0xFF22C55E, ep)
                    )
                )
            }
        }
        ExperimentTopic.COLLISIONS -> {
            val m1 = p(params, "m1", 3.0)
            val m2 = p(params, "m2", 1.5)
            val p1 = m1 * colV1
            val p2 = m2 * colV2
            val pTot = p1 + p2
            val vCm = pTot / (m1 + m2)
            val ek1 = 0.5 * m1 * colV1 * colV1
            val ek2 = 0.5 * m2 * colV2 * colV2
            val ekTot = ek1 + ek2

            TelemetrySnapshot(
                simTime = simTime,
                phaseTitle = if (colCount == 0) "Сближение тел до удара" else "Движение после столкновения (#$colCount)",
                phaseDetail = "Суммарный импульс системы P = ${fmt(pTot, 2)} кг·м/с, скорость центра масс v_ЦМ = ${fmt(vCm, 2)} м/с. ${if (colLastDeltaE > 0.01) "При ударе потеряно ΔE = ${fmt(colLastDeltaE, 2)} Дж." else "Кинетическая энергия сохраняется."}",
                liveFormula = "P = ${fmt(p1, 1)} + (${fmt(p2, 1)}) = ${fmt(pTot, 2)} кг·м/с | v_ЦМ = ${fmt(vCm, 2)} м/с",
                metrics = listOf(
                    MetricItem("Скорость v₁", fmt(colV1, 2), "м/с", 0xFF38BDF8),
                    MetricItem("Скорость v₂", fmt(colV2, 2), "м/с", 0xFFF97316),
                    MetricItem("Импульс P", fmt(pTot, 2), "кг·м/с", 0xFF2DD4BF),
                    MetricItem("Энергия E_k", fmt(ekTot, 1), "Дж", 0xFFFACC15)
                ),
                energyKinetic = ekTot,
                energyPotential = 0.0,
                energyLost = colLastDeltaE,
                graphChannels = listOf(
                    GraphChannel("v₁", "м/с", 0xFF38BDF8, colV1),
                    GraphChannel("v₂", "м/с", 0xFFF97316, colV2),
                    GraphChannel("P_общ", "кг·м/с", 0xFF2DD4BF, pTot),
                    GraphChannel("E_k", "Дж", 0xFFFACC15, ekTot)
                )
            )
        }
        ExperimentTopic.CIRCUITS -> {
            val topo = p(params, "topology", 0.0).toInt()
            val closed = p(params, "switchClosed", 1.0) >= 0.5
            val emf = p(params, "emf", 12.0)
            val rInt = p(params, "rInt", 0.5)
            val r1 = p(params, "r1", 10.0)
            val r2 = p(params, "r2", 14.0)
            val capMf = p(params, "capacitance", 40.0)
            val rExt = when (topo) {
                0 -> r1 + r2
                1 -> (r1 * r2) / (r1 + r2)
                else -> r1
            }

            val (pt, pd) = when {
                topo == 2 && closed -> "Заряд конденсатора через R₁" to
                    "Ток заряда I = ${fmt(circuitCurrent, 2)} А экспоненциально падает по мере роста U_C = ${fmt(capVoltage, 2)} В (τ = ${fmt((r1 + rInt) * capMf / 1000.0, 2)} с)."
                topo == 2 && !closed -> "Разряд конденсатора через R₂" to
                    "Источник отключён — накопленный заряд стекает через R₂ (${fmt(r2, 0)} Ом), напряжение U_C = ${fmt(capVoltage, 2)} В."
                !closed -> "Цепь разомкнута" to
                    "Ток I = 0 А. Вольтметр на клеммах показывает полную ЭДС ε = ${fmt(emf, 1)} В."
                topo == 0 -> "Последовательная цепь" to
                    "Через R₁ и R₂ течёт одинаковый ток I = ${fmt(circuitCurrent, 2)} А. Падение напряжения: U₁=${fmt(circuitCurrent * r1, 1)} В, U₂=${fmt(circuitCurrent * r2, 1)} В."
                else -> "Параллельная цепь" to
                    "Напряжение U = ${fmt(circuitVExt, 2)} В одинаково на ветвях. Ток ветвей: I₁=${fmt(circuitVExt / r1, 2)} А, I₂=${fmt(circuitVExt / r2, 2)} А."
            }

            TelemetrySnapshot(
                simTime = simTime,
                phaseTitle = pt,
                phaseDetail = pd,
                liveFormula = if (topo == 2)
                    "τ = RC = ${fmt((r1 + rInt) * capMf / 1000.0, 2)} с | U_C = ${fmt(capVoltage, 2)} В"
                else
                    "I = ${fmt(emf, 1)} / (${fmt(rExt, 1)} + ${fmt(rInt, 1)}) = ${fmt(circuitCurrent, 2)} А | P = ${fmt(circuitPower, 1)} Вт",
                metrics = listOf(
                    MetricItem("Ток I", fmt(circuitCurrent, 2), "А", 0xFF38BDF8),
                    MetricItem("Напр. U_внеш", fmt(circuitVExt, 2), "В", 0xFFFACC15),
                    MetricItem("Мощность P", fmt(circuitPower, 1), "Вт", 0xFFF97316),
                    MetricItem(if (topo == 2) "U_C конд." else "R_экв", fmt(if (topo == 2) capVoltage else rExt, 2), if (topo == 2) "В" else "Ом", 0xFF2DD4BF)
                ),
                energyKinetic = circuitPower,
                energyPotential = abs(circuitCurrent * circuitCurrent * rInt),
                energyLost = 0.0,
                graphChannels = listOf(
                    GraphChannel("Ток I", "А", 0xFF38BDF8, circuitCurrent),
                    GraphChannel("Напряж. U", "В", 0xFFFACC15, circuitVExt),
                    GraphChannel("U_C", "В", 0xFF2DD4BF, capVoltage),
                    GraphChannel("Мощность P", "Вт", 0xFFF97316, circuitPower)
                )
            )
        }
        ExperimentTopic.IDEAL_GAS -> {
            val t = p(params, "temperature", 300.0)
            val v = p(params, "volume", 5.0)
            val nCount = p(params, "particles", 75.0)
            val m = p(params, "molarMass", 28.0)
            val mode = p(params, "processMode", 0.0).toInt()
            val vRms = sqrt(3.0 * 8.314 * t / (m / 1000.0)) // м/с
            val eAvgJ = 1.5 * 1.38e-23 * t * 1e21 // in 10^-21 J for readability
            val pTheo = computeTheoreticalGasPressure(params)

            val modeName = when (mode) {
                0 -> "Изотермический процесс (T = const)"
                1 -> "Изохорный процесс (V = const)"
                2 -> "Изобарный процесс (P = const)"
                else -> "Адиабатный процесс (Q = 0)"
            }
            val modeDesc = when (mode) {
                0 -> "При сжатии объёма V концентрация молекул растёт — давление P = ${fmt(pTheo, 1)} кПа увеличивается обратно пропорционально объёму."
                1 -> "Стенки неподвижны (V = ${fmt(v, 1)} л). При нагреве растёт скорость молекул v_кв = ${fmt(vRms, 0)} м/с, и удары о поршень чаще и сильнее."
                2 -> "Поршень автоматически поддерживает постоянное давление P ≈ ${fmt(pTheo, 1)} кПа, расширяясь пропорционально T."
                else -> "Теплообмена нет! Сжимая газ поршнем, вы совершаете работу и разогреваете молекулы (сейчас T = ${fmt(t, 0)} К)."
            }

            TelemetrySnapshot(
                simTime = simTime,
                phaseTitle = modeName,
                phaseDetail = modeDesc,
                liveFormula = "PV = ${fmt(pTheo * v, 0)} кПа·л | v_кв = √(3RT/M) = ${fmt(vRms, 0)} м/с",
                metrics = listOf(
                    MetricItem("Давление P", fmt(gasMeasuredPressureKpa, 1), "кПа", 0xFFF97316),
                    MetricItem("Объём V", fmt(v, 1), "л", 0xFF38BDF8),
                    MetricItem("Темп. T", fmt(t, 0), "К", 0xFFEF4444),
                    MetricItem("v_кв молек.", fmt(vRms, 0), "м/с", 0xFF2DD4BF)
                ),
                energyKinetic = nCount * (t / 300.0),
                energyPotential = 0.0,
                energyLost = 0.0,
                graphChannels = listOf(
                    GraphChannel("Давление P", "кПа", 0xFFF97316, gasMeasuredPressureKpa),
                    GraphChannel("Темп. T", "К", 0xFFEF4444, t),
                    GraphChannel("Объём V", "л", 0xFF38BDF8, v),
                    GraphChannel("E_ср (10⁻²¹)", "Дж", 0xFF2DD4BF, eAvgJ)
                ),
                pvPoint = v to pTheo
            )
        }
        ExperimentTopic.OPTICS -> {
            val mode = p(params, "optMode", 0.0).toInt()
            if (mode == 0) {
                val fLen = p(params, "focalLen", 18.0).let { if (abs(it) < 1.0) 1.0 else it }
                val d = p(params, "objDist", 32.0)
                val h = p(params, "objHeight", 8.0)
                val denom = (1.0 / fLen) - (1.0 / d)
                val fImg = if (abs(denom) < 1e-6) 9999.0 else 1.0 / denom
                val gamma = abs(fImg / d)
                val hImg = h * (fImg / d)
                val kind = when {
                    abs(denom) < 1e-4 -> "Изображение на бесконечности (d = F)"
                    fImg > 0 -> "Действительное, перевёрнутое (${if (gamma > 1.02) "увеличенное" else if (gamma < 0.98) "уменьшенное" else "равное"})"
                    else -> "Мнимое, прямое (${if (gamma > 1.02) "увеличенное — лупа" else "уменьшенное"})"
                }

                TelemetrySnapshot(
                    simTime = simTime,
                    phaseTitle = if (fLen > 0) "Собирающая линза · $kind" else "Рассеивающая линза · $kind",
                    phaseDetail = "Формула тонкой линзы: 1/${fmt(fLen, 0)} = 1/${fmt(d, 0)} + 1/${fmt(fImg, 1)}. Линейное увеличение Γ = |f|/d = ${fmt(gamma, 2)}×, высота изображения h' = ${fmt(abs(hImg), 1)} см.",
                    liveFormula = "f = ${fmt(fImg, 1)} см | Γ = ${fmt(gamma, 2)}× | D = ${fmt(100.0 / fLen, 2)} дптр",
                    metrics = listOf(
                        MetricItem("Расст. f", if (abs(fImg) > 500) "∞" else fmt(fImg, 1), "см", 0xFFA855F7),
                        MetricItem("Увелич. Γ", if (abs(fImg) > 500) "∞" else fmt(gamma, 2), "×", 0xFF38BDF8),
                        MetricItem("Опт. сила D", fmt(100.0 / fLen, 2), "дптр", 0xFF2DD4BF),
                        MetricItem("Высота h'", if (abs(fImg) > 500) "∞" else fmt(abs(hImg), 1), "см", 0xFFF59E0B)
                    ),
                    energyKinetic = 1.0,
                    energyPotential = 0.0,
                    energyLost = 0.0,
                    graphChannels = listOf(
                        GraphChannel("d", "см", 0xFF38BDF8, d),
                        GraphChannel("f", "см", 0xFFA855F7, fImg.coerceIn(-100.0, 100.0)),
                        GraphChannel("Γ", "×", 0xFF2DD4BF, gamma.coerceAtMost(10.0)),
                        GraphChannel("D", "дптр", 0xFFF59E0B, 100.0 / fLen)
                    )
                )
            } else {
                val alphaDeg = p(params, "incidentAngle", 38.0)
                val n1 = p(params, "n1", 1.0)
                val n2 = p(params, "n2", 1.52)
                val sinBeta = (n1 / n2) * sin(Math.toRadians(alphaDeg))
                val tir = sinBeta > 1.0
                val betaDeg = if (tir) 90.0 else Math.toDegrees(asin(sinBeta.coerceIn(-1.0, 1.0)))
                val critDeg = if (n1 > n2) Math.toDegrees(asin(n2 / n1)) else 90.0

                TelemetrySnapshot(
                    simTime = simTime,
                    phaseTitle = if (tir) "Полное внутреннее отражение!" else "Преломление света на границе сред",
                    phaseDetail = if (tir)
                        "Угол падения α = ${fmt(alphaDeg, 0)}° превысил предельный α_кр = ${fmt(critDeg, 1)}°! Весь свет отражается обратно в среду n₁ = ${fmt(n1, 2)}."
                    else
                        "При переходе из n₁=${fmt(n1, 2)} в n₂=${fmt(n2, 2)} луч отклоняется: угол преломления β = ${fmt(betaDeg, 1)}° (α = ${fmt(alphaDeg, 0)}°).",
                    liveFormula = "${fmt(n1, 2)}·sin(${fmt(alphaDeg, 0)}°) = ${fmt(n2, 2)}·sin(${if (tir) "ПВО" else fmt(betaDeg, 1) + "°"})",
                    metrics = listOf(
                        MetricItem("Угол α", fmt(alphaDeg, 0), "°", 0xFFF59E0B),
                        MetricItem("Угол β", if (tir) "ПВО" else fmt(betaDeg, 1), if (tir) "" else "°", 0xFF38BDF8),
                        MetricItem("Угол α_кр", if (n1 > n2) fmt(critDeg, 1) else "нет", if (n1 > n2) "°" else "", 0xFFEF4444),
                        MetricItem("Отнош. n₂/n₁", fmt(n2 / n1, 2), "", 0xFFA855F7)
                    ),
                    energyKinetic = 1.0,
                    energyPotential = 0.0,
                    energyLost = 0.0,
                    graphChannels = listOf(
                        GraphChannel("α", "°", 0xFFF59E0B, alphaDeg),
                        GraphChannel("β", "°", 0xFF38BDF8, betaDeg),
                        GraphChannel("n₁", "", 0xFF2DD4BF, n1),
                        GraphChannel("n₂", "", 0xFFA855F7, n2)
                    )
                )
            }
        }
        ExperimentTopic.WAVES -> {
            val mode = p(params, "waveMode", 0.0).toInt()
            val f = p(params, "frequency", 2.5)
            val v = p(params, "waveSpeed", 10.0)
            val amp = p(params, "amplitude", 5.0)
            val d = p(params, "slitDist", 2.4)
            val lambda = v / max(0.1, f)
            val stringLen = 10.0
            val harmonic = (2.0 * stringLen) / lambda

            TelemetrySnapshot(
                simTime = simTime,
                phaseTitle = if (mode == 0) "Стоячая волна (гармоника ≈ ${fmt(harmonic, 1)})" else "Интерференция двух волн",
                phaseDetail = if (mode == 0)
                    "Длина волны λ = v/f = ${fmt(lambda, 2)} м. На длине струны L = 10 м укладывается ${fmt(harmonic, 2)} полуволн. Узлы неподвижны, пучности колеблются с амплитудой ${fmt(amp, 1)} см."
                else
                    "Два источника на расстоянии d = ${fmt(d, 1)} м излучают волны λ = ${fmt(lambda, 2)} м. Светлые полосы — усиление (Δ = kλ), тёмные — гашение.",
                liveFormula = "λ = v / f = ${fmt(v, 1)} / ${fmt(f, 1)} = ${fmt(lambda, 2)} м | T = ${fmt(1.0 / f, 2)} с",
                metrics = listOf(
                    MetricItem("Длина волны λ", fmt(lambda, 2), "м", 0xFF2DD4BF),
                    MetricItem("Частота f", fmt(f, 1), "Гц", 0xFF38BDF8),
                    MetricItem("Период T", fmt(1.0 / f, 2), "с", 0xFFF59E0B),
                    MetricItem("Гармоника n", fmt(harmonic, 2), "", 0xFFA855F7)
                ),
                energyKinetic = 0.5 * amp * amp * f,
                energyPotential = 0.5 * amp * amp * f,
                energyLost = 0.0,
                graphChannels = listOf(
                    GraphChannel("Смещ. y₀", "см", 0xFF2DD4BF, amp * sin(wavePhase)),
                    GraphChannel("Длина λ", "м", 0xFF38BDF8, lambda),
                    GraphChannel("Частота f", "Гц", 0xFFF59E0B, f),
                    GraphChannel("Ампл. A", "см", 0xFFA855F7, amp)
                )
            )
        }
        ExperimentTopic.BUOYANCY -> {
            val rhoB = p(params, "bodyDensity", 750.0)
            val rhoL = p(params, "liquidDensity", 1000.0)
            val volL = p(params, "bodyVolume", 2.0)
            val volM3 = volL / 1000.0
            val g = p(params, "gravity", 9.81)
            val fG = rhoB * volM3 * g
            val fA = rhoL * volM3 * buoySubmergedFrac * g
            val hold = p(params, "holdSensor", 0.0) >= 0.5
            val dynWeight = max(0.0, fG - fA)

            val (pt, pd) = when {
                hold -> "Замер динамометром" to
                    "Вес в воздухе P = ${fmt(fG, 1)} Н, выталкивающая сила F_A = ${fmt(fA, 1)} Н. Показание динамометра P − F_A = ${fmt(dynWeight, 1)} Н."
                rhoB > rhoL * 1.02 -> "Тело тонет (ρ_т > ρ_ж)" to
                    "Плотность тела (${fmt(rhoB, 0)} кг/м³) больше плотности жидкости (${fmt(rhoL, 0)}). Сила тяжести (${fmt(fG, 1)} Н) сильнее максимальной силы Архимеда."
                buoySubmergedFrac > 0.02 && buoySubmergedFrac < 0.99 -> "Равновесие на поверхности (F_A = mg)" to
                    "Тело погружено на ${fmt(buoySubmergedFrac * 100.0, 0)}%. Сила Архимеда (${fmt(fA, 1)} Н) в точности уравновесила силу тяжести (${fmt(fG, 1)} Н)."
                else -> "Всплытие / свободное движение" to
                    "При плотности ${fmt(rhoB, 0)} < ${fmt(rhoL, 0)} кг/м³ выталкивающая сила поднимает тело к поверхности."
            }

            TelemetrySnapshot(
                simTime = simTime,
                phaseTitle = pt,
                phaseDetail = pd,
                liveFormula = "F_A = ρ_ж·g·V_погр = ${fmt(fA, 2)} Н | F_тяж = ${fmt(fG, 2)} Н",
                metrics = listOf(
                    MetricItem("Сила Архимеда", fmt(fA, 2), "Н", 0xFF38BDF8),
                    MetricItem("Сила тяжести", fmt(fG, 2), "Н", 0xFFEF4444),
                    MetricItem("Погружено", fmt(buoySubmergedFrac * 100.0, 0), "%", 0xFF2DD4BF),
                    MetricItem(if (hold) "Динамометр" else "Вес в жидк.", fmt(dynWeight, 2), "Н", 0xFFF59E0B)
                ),
                energyKinetic = 0.5 * (rhoB * volM3) * buoyVy * buoyVy,
                energyPotential = (rhoB * volM3) * g * (buoyY + 1.0),
                energyLost = 0.0,
                graphChannels = listOf(
                    GraphChannel("F_Арх", "Н", 0xFF38BDF8, fA),
                    GraphChannel("F_тяж", "Н", 0xFFEF4444, fG),
                    GraphChannel("Погр.%", "%", 0xFF2DD4BF, buoySubmergedFrac * 100.0),
                    GraphChannel("Высота", "у.е.", 0xFFF59E0B, buoyY)
                )
            )
        }
        ExperimentTopic.INCLINED_PLANE -> {
            val alpha = p(params, "slopeAngle", 28.0)
            val rad = Math.toRadians(alpha)
            val m = p(params, "mass", 4.0)
            val mu = p(params, "frictionMu", 0.25)
            val fPull = p(params, "pullForce", 0.0)
            val g = p(params, "gravity", 9.81)
            val fDown = m * g * sin(rad)
            val nForce = m * g * cos(rad)
            val fFricMax = mu * nForce
            val eff = if (fPull > fDown * 0.5) ((fDown / max(1.0, fPull)) * 100.0).coerceIn(0.0, 100.0) else 0.0

            val (pt, pd) = when {
                !slopeIsSliding && abs(slopeVel) < 0.02 -> "Покой (удерживает трение)" to
                    "Скатывающая сила ${fmt(fDown, 1)} Н (и тяга ${fmt(fPull, 0)} Н) не превысили макс. трение покоя ${fmt(fFricMax, 1)} Н."
                slopeVel > 0.02 -> "Подъём вверх по склону" to
                    "Тяга F = ${fmt(fPull, 0)} Н преодолела сумму скатывающей силы и трения. Ускорение a = +${fmt(slopeAccel, 2)} м/с², КПД η = ${fmt(eff, 0)}%."
                else -> "Скольжение вниз по склону" to
                    "tg(${fmt(alpha, 0)}°) = ${fmt(tan(rad), 2)} > μ = ${fmt(mu, 2)}! Брусок разгоняется вниз с ускорением ${fmt(abs(slopeAccel), 2)} м/с²."
            }

            TelemetrySnapshot(
                simTime = simTime,
                phaseTitle = pt,
                phaseDetail = pd,
                liveFormula = "mg·sin(α) = ${fmt(fDown, 1)} Н | F_тр,max = μ·mg·cos(α) = ${fmt(fFricMax, 1)} Н",
                metrics = listOf(
                    MetricItem("Скатыв. F_ск", fmt(fDown, 1), "Н", 0xFFF59E0B),
                    MetricItem("Трение max", fmt(fFricMax, 1), "Н", 0xFFEF4444),
                    MetricItem("Ускорение a", fmt(slopeAccel, 2), "м/с²", 0xFF38BDF8),
                    MetricItem("Скорость v", fmt(slopeVel, 2), "м/с", 0xFF2DD4BF)
                ),
                energyKinetic = 0.5 * m * slopeVel * slopeVel,
                energyPotential = m * g * slopePos * sin(rad),
                energyLost = 0.0,
                graphChannels = listOf(
                    GraphChannel("Скорость", "м/с", 0xFF2DD4BF, slopeVel),
                    GraphChannel("Ускор. a", "м/с²", 0xFF38BDF8, slopeAccel),
                    GraphChannel("F_ск", "Н", 0xFFF59E0B, fDown),
                    GraphChannel("F_тр,max", "Н", 0xFFEF4444, fFricMax)
                )
            )
        }
        ExperimentTopic.ELECTROSTATICS -> {
            val mode = p(params, "fieldMode", 0.0).toInt()
            val q = p(params, "charge", 1.0)
            val m = max(0.3, p(params, "massNum", 1.5))
            val eF = if (mode == 1) 0.0 else p(params, "eField", 6.0)
            val bF = if (mode == 0) 0.0 else p(params, "bField", 0.0)
            val v = hypot(chargeVel.x, chargeVel.y)
            val rCyc = if (abs(q * bF) > 0.1) (m * v) / abs(q * bF * 0.45) else 999.0

            val (pt, pd) = when (mode) {
                0 -> "Отклонение заряда в электрическом поле E" to
                    "На заряд q = ${q.toInt()}е действует постоянная вертикальная сила qE, изгибая траекторию в параболу (принцип электронно-лучевой трубки)."
                1 -> "Циклотрон: круговая орбита в магнитном поле B" to
                    "Сила Лоренца всегда перпендикулярна скорости: работа поля равна 0, модуль скорости v = ${fmt(v, 1)} постоянен, радиус орбиты R ≈ ${fmt(rCyc, 2)}."
                else -> "Фильтр скоростей (E ⊥ B)" to
                    if (abs(eF * 1.6 - chargeVel.x * bF) < 2.0) "Баланс сил qE ≈ qvB — частица летит почти прямо! Это принцип отбора частиц по скорости."
                    else "Силы qE и qvB не равны — луч отклоняется в сторону более сильного поля."
            }

            TelemetrySnapshot(
                simTime = simTime,
                phaseTitle = pt,
                phaseDetail = pd,
                liveFormula = "F_E = qE (${fmt(q * eF, 1)}) | F_L = qvB (${fmt(abs(q * v * bF), 1)})",
                metrics = listOf(
                    MetricItem("Скорость |v|", fmt(v, 2), "у.е.", 0xFF38BDF8),
                    MetricItem("Позиция y", fmt(chargePos.y, 2), "у.е.", 0xFFF59E0B),
                    MetricItem("Радиус R_ц", if (rCyc > 100) "∞" else fmt(rCyc, 2), "у.е.", 0xFFA855F7),
                    MetricItem("Заряд q", "${q.toInt()}", "е", 0xFF2DD4BF)
                ),
                energyKinetic = 0.5 * m * v * v,
                energyPotential = abs(q * eF * chargePos.y),
                energyLost = 0.0,
                graphChannels = listOf(
                    GraphChannel("y", "у.е.", 0xFFF59E0B, chargePos.y),
                    GraphChannel("v_x", "у.е.", 0xFF38BDF8, chargeVel.x),
                    GraphChannel("v_y", "у.е.", 0xFF2DD4BF, chargeVel.y),
                    GraphChannel("|v|", "у.е.", 0xFFA855F7, v)
                )
            )
        }
        ExperimentTopic.ELECTROMAGNETIC -> {
            val n = p(params, "turns", 80.0)
            val moving = abs(magVelX) > 0.05
            val (pt, pd) = if (moving) {
                "Индукция тока (правило Ленца)" to
                    "Магнит движется со скоростью v = ${fmt(magVelX, 2)}: поток через $n витков меняется, наводя ЭДС ε_i = ${fmt(inducedEmf, 2)} В и ток ${fmt(inducedCurrent * 1000.0, 0)} мА."
            } else {
                "Магнит неподвижен — тока нет (ΔΦ = 0)" to
                    "Даже сильный магнит внутри катушки НЕ создаёт ток, пока поток Φ не меняется во времени. Сдвинь магнит пальцем или включи колебания!"
            }

            TelemetrySnapshot(
                simTime = simTime,
                phaseTitle = pt,
                phaseDetail = pd,
                liveFormula = "ε_i = −N·(dΦ/dt) = ${fmt(inducedEmf, 2)} В | I = ${fmt(inducedCurrent * 1000.0, 0)} мА",
                metrics = listOf(
                    MetricItem("ЭДС индукц.", fmt(inducedEmf, 2), "В", 0xFFFACC15),
                    MetricItem("Ток катушки", fmt(inducedCurrent * 1000.0, 0), "мА", 0xFF38BDF8),
                    MetricItem("Поток N·Φ", fmt(magFlux, 2), "Вб", 0xFFA855F7),
                    MetricItem("Скорость v", fmt(magVelX, 2), "у.е./с", 0xFF2DD4BF)
                ),
                energyKinetic = abs(inducedEmf * inducedCurrent),
                energyPotential = abs(magFlux),
                energyLost = 0.0,
                graphChannels = listOf(
                    GraphChannel("ЭДС ε_i", "В", 0xFFFACC15, inducedEmf),
                    GraphChannel("Поток Φ", "Вб", 0xFFA855F7, magFlux),
                    GraphChannel("Ток (мА)", "мА", 0xFF38BDF8, inducedCurrent * 1000.0),
                    GraphChannel("Поз. x", "у.е.", 0xFF2DD4BF, magPosX)
                )
            )
        }
        ExperimentTopic.PHOTOELECTRIC -> {
            val lambdaNm = p(params, "wavelengthNm", 400.0)
            val ePhot = 1239.84 / lambdaNm
            val aWork = getWorkFunctionEv(params)
            val ekMax = max(0.0, ePhot - aWork)
            val lambdaRed = 1239.84 / aWork
            val uVolt = p(params, "voltage", 1.0)

            val (pt, pd) = when {
                ekMax <= 0.0 -> "Фотоэффект НЕ идёт (λ > λ_кр)" to
                    "Энергия фотона (${fmt(ePhot, 2)} эВ) меньше работы выхода (${fmt(aWork, 2)} эВ). Красная граница λ_кр = ${fmt(lambdaRed, 0)} нм — уменьши длину волны!"
                uVolt <= -ekMax -> "Электроны остановлены полем (U ≤ −U_з)" to
                    "Задерживающее напряжение ${fmt(uVolt, 1)} В разворачивает даже самые быстрые фотоэлектроны (E_k,max = ${fmt(ekMax, 2)} эВ), фототок упал до 0."
                else -> "Фотоэлектроны летят к аноду!" to
                    "Каждый фотон выбивает электрон с макс. энергией ${fmt(ekMax, 2)} эВ. Чем ярче свет, тем больше фотоэлектронов вылетает в секунду."
            }

            TelemetrySnapshot(
                simTime = simTime,
                phaseTitle = pt,
                phaseDetail = pd,
                liveFormula = "hν(${fmt(ePhot, 2)} эВ) = A(${fmt(aWork, 2)}) + E_k(${fmt(ekMax, 2)} эВ) | λ_кр = ${fmt(lambdaRed, 0)} нм",
                metrics = listOf(
                    MetricItem("Фототок I", fmt(photoCurrentMa, 2), "мА", 0xFF38BDF8),
                    MetricItem("Фотон hν", fmt(ePhot, 2), "эВ", 0xFFA855F7),
                    MetricItem("Макс. E_k", fmt(ekMax, 2), "эВ", 0xFF22C55E),
                    MetricItem("Красн. гран.", fmt(lambdaRed, 0), "нм", 0xFFEF4444)
                ),
                energyKinetic = ekMax,
                energyPotential = aWork,
                energyLost = 0.0,
                graphChannels = listOf(
                    GraphChannel("Ток I", "мА", 0xFF38BDF8, photoCurrentMa),
                    GraphChannel("E_k,max", "эВ", 0xFF22C55E, ekMax),
                    GraphChannel("hν", "эВ", 0xFFA855F7, ePhot),
                    GraphChannel("Напр. U", "В", 0xFFF59E0B, uVolt)
                )
            )
        }
        ExperimentTopic.RADIOACTIVE -> {
            val n0 = decayAtoms.size.coerceAtLeast(1)
            val tHalf = max(0.5, p(params, "halfLife", 4.0))
            val lambda = ln(2.0) / tHalf
            val nTheo = n0 * 2.0.pow(-simTime / tHalf)
            val activity = lambda * aliveNuclei

            TelemetrySnapshot(
                simTime = simTime,
                phaseTitle = "Распад ядер (прошло ${fmt(simTime / tHalf, 2)} периодов T₁/₂)",
                phaseDetail = "Осталось $aliveNuclei из $n0 активных ядер (распад ${fmt(100.0 * decayedNuclei / n0, 0)}%). Теория даёт N_теор ≈ ${fmt(nTheo, 0)} ядер.",
                liveFormula = "N(t) = $n0·2^(−${fmt(simTime, 1)}/${fmt(tHalf, 1)}) ≈ ${fmt(nTheo, 0)} | A = ${fmt(activity, 1)} Бк",
                metrics = listOf(
                    MetricItem("Осталось N", "$aliveNuclei", "ядер", 0xFF22C55E),
                    MetricItem("Распад ΔN", "$decayedNuclei", "ядер", 0xFFA855F7),
                    MetricItem("Теория N(t)", fmt(nTheo, 0), "ядер", 0xFF38BDF8),
                    MetricItem("Активность", fmt(activity, 1), "Бк", 0xFFF59E0B)
                ),
                energyKinetic = aliveNuclei.toDouble(),
                energyPotential = decayedNuclei.toDouble(),
                energyLost = 0.0,
                graphChannels = listOf(
                    GraphChannel("Осталось N", "шт", 0xFF22C55E, aliveNuclei.toDouble()),
                    GraphChannel("Теория N", "шт", 0xFF38BDF8, nTheo),
                    GraphChannel("Распалось", "шт", 0xFFA855F7, decayedNuclei.toDouble()),
                    GraphChannel("Активность", "Бк", 0xFFF59E0B, activity)
                )
            )
        }
        ExperimentTopic.ORBITS -> {
            val mStar = p(params, "starMass", 1.0)
            val gm = 4.0 * PI * PI * mStar
            val r = max(0.05, hypot(orbitPos.x, orbitPos.y))
            val vAuYr = hypot(orbitVel.x, orbitVel.y)
            val vKmS = vAuYr * 4.74047
            val v1 = 29.785 * sqrt(mStar / r)
            val v2 = v1 * sqrt(2.0)
            val ekSpec = 0.5 * vAuYr * vAuYr
            val epSpec = -gm / r
            val eTotal = ekSpec + epSpec
            val ecc = if (orbitRMax + orbitRMin > 1e-5) (orbitRMax - orbitRMin) / (orbitRMax + orbitRMin) else 0.0

            val (pt, pd) = when {
                eTotal >= 0.0 -> "Гиперболический улёт (E ≥ 0)" to
                    "Скорость v = ${fmt(vKmS, 1)} км/с достигла второй космической (v₂ = ${fmt(v2, 1)} км/с). Планета навсегда покидает звезду!"
                ecc < 0.06 -> "Круговая орбита (e ≈ ${fmt(ecc, 2)})" to
                    "Центростремительное ускорение в точности равно гравитации звезды. Скорость почти постоянна: v ≈ ${fmt(vKmS, 1)} км/с."
                else -> "Эллиптическая орбита Кеплера (e ≈ ${fmt(ecc, 2)})" to
                    "В перигелии (r_min=${fmt(orbitRMin, 2)} а.е.) планета разгоняется, в афелии (r_max=${fmt(orbitRMax, 2)} а.е.) замедляется. Площадь секторов за равное время одинакова."
            }

            TelemetrySnapshot(
                simTime = simTime,
                phaseTitle = pt,
                phaseDetail = pd,
                liveFormula = "v₁ = ${fmt(v1, 1)} км/с | v₂ = ${fmt(v2, 1)} км/с | r = ${fmt(r, 2)} а.е.",
                metrics = listOf(
                    MetricItem("Радиус r", fmt(r, 2), "а.е.", 0xFF6366F1),
                    MetricItem("Скорость v", fmt(vKmS, 1), "км/с", 0xFF38BDF8),
                    MetricItem("1-я косм. v₁", fmt(v1, 1), "км/с", 0xFF2DD4BF),
                    MetricItem("Эксцентр. e", fmt(ecc, 2), "", 0xFFF59E0B)
                ),
                energyKinetic = ekSpec * 10.0,
                energyPotential = max(0.0, -epSpec * 5.0),
                energyLost = 0.0,
                graphChannels = listOf(
                    GraphChannel("Радиус r", "а.е.", 0xFF6366F1, r),
                    GraphChannel("Скорость v", "км/с", 0xFF38BDF8, vKmS),
                    GraphChannel("E_k", "у.е.", 0xFFEF4444, ekSpec),
                    GraphChannel("|E_p|", "у.е.", 0xFF22C55E, -epSpec)
                )
            )
        }
    }

    /**
     * Generates a detailed, student-friendly Russian physical explanation for EVERY parameter change!
     */
    fun explainParamChange(
        topic: ExperimentTopic,
        key: String,
        oldVal: Double,
        newVal: Double,
        params: Map<String, Double>
    ): Pair<String, String> {
        val desc = topic.descriptors().find { it.key == key }
        val label = desc?.label ?: key
        val unit = desc?.unit?.let { if (it.isNotEmpty()) " $it" else "" } ?: ""
        val dec = desc?.decimals ?: 2
        val dir = if (newVal > oldVal) "увеличено" else "уменьшено"

        if (desc?.kind == ParamKind.CHOICE) {
            val choiceName = desc.choices.getOrNull(newVal.toInt()) ?: newVal.toInt().toString()
            val detail = when (topic to key) {
                ExperimentTopic.PENDULUM to "mode" ->
                    if (newVal < 0.5) "Переключено на математический маятник: период зависит от длины нити L и гравитации g (T = 2π√(L/g))."
                    else "Переключено на пружинный маятник: период зависит только от массы m и жёсткости k (T = 2π√(m/k)) и НЕ зависит от гравитации."
                ExperimentTopic.CIRCUITS to "topology" -> when (newVal.toInt()) {
                    0 -> "Последовательная схема: R_общ = R₁ + R₂. Ток одинаков во всех элементах, а напряжение делится пропорционально сопротивлениям."
                    1 -> "Параллельная схема: 1/R_общ = 1/R₁ + 1/R₂. Общее сопротивление меньше наименьшего из резисторов, ток в цепи вырастает!"
                    else -> "RC-цепь: при замыкании ключа конденсатор заряжается экспоненциально с постоянной времени τ = RC, при размыкании — разряжается через R₂."
                }
                ExperimentTopic.IDEAL_GAS to "processMode" -> when (newVal.toInt()) {
                    0 -> "Изотермический режим (T = const): температура фиксирована, P·V = const (закон Бойля-Мариотта)."
                    1 -> "Изохорный режим (V = const): объём постоянен, давление растёт прямо пропорционально температуре (закон Шарля)."
                    2 -> "Изобарный режим (P = const): при изменении температуры поршень сам сдвигается так, чтобы давление оставалось постоянным (закон Гей-Люссака)."
                    else -> "Адиабатный режим (Q = 0): нет теплообмена! Сжатие поршнем мгновенно повышает температуру газа, расширение — охлаждает."
                }
                ExperimentTopic.OPTICS to "optMode" ->
                    if (newVal < 0.5) "Выбрана оптическая скамья с тонкой линзой: можно исследовать формулу 1/F = 1/d + 1/f и увеличение."
                    else "Выбрана граница двух сред: закон Снеллиуса n₁·sin(α) = n₂·sin(β), полное внутреннее отражение и дисперсия."
                ExperimentTopic.WAVES to "waveMode" ->
                    if (newVal < 0.5) "Режим стоячей волны: наложение прямой и отражённой волн образует неподвижные узлы и пучности."
                    else "Режим интерференции: два когерентных источника создают полосы максимумов и минимумов на экране."
                ExperimentTopic.BUOYANCY to "liquidType" ->
                    "Выбрана жидкость «$choiceName»: от плотности ρ_ж зависит сила Архимеда F_A = ρ_ж·g·V_погр."
                ExperimentTopic.ELECTROSTATICS to "fieldMode" -> when (newVal.toInt()) {
                    0 -> "Конденсатор: однородное электрическое поле отклоняет заряд по параболе."
                    1 -> "Циклотрон: магнитное поле B закручивает движущийся заряд по окружности."
                    else -> "Фильтр скоростей: при qE = qvB силы компенсируют друг друга и частица летит прямо."
                }
                ExperimentTopic.ELECTROMAGNETIC to "polarity" ->
                    "Перевёрнут полюс магнита ($choiceName): при том же движении знак ЭДС индукции и направление тока меняются на противоположные!"
                ExperimentTopic.PHOTOELECTRIC to "cathodeMetal" ->
                    "Выбран металл катода ($choiceName): чем больше работа выхода, тем более коротковолновый (синий/УФ) свет нужен для выбивания электронов."
                ExperimentTopic.RADIOACTIVE to "isotope" ->
                    "Выбран изотоп ($choiceName): у каждого изотопа свой строго постоянный период полураспада T₁/₂."
                else -> "Выбран режим «$choiceName»."
            }
            return "$label → $choiceName" to detail
        }

        if (desc?.kind == ParamKind.TOGGLE) {
            val on = newVal >= 0.5
            val detail = when (key) {
                "switchClosed" -> if (on) "Ключ замкнут: электрическая цепь замкнулась, под действием ЭДС начался направленный дрейф зарядов."
                else "Ключ разомкнут: ток в основной цепи прекратился (в RC-цепи начинается разряд конденсатора через R₂)."
                "showVacuumRef" -> if (on) "На холсте показана пунктирная эталонная парабола в вакууме — удобно сравнивать влияние воздуха и ветра."
                else "Эталонная парабола вакуума скрыта."
                "dispersion" -> if (on) "Белый луч разложен в радужный спектр! Фиолетовые лучи преломляются сильнее красных из-за большего n."
                else "Включён монохроматический жёлтый луч лазера."
                "showSweptArea" -> if (on) "Включены сектора Кеплера: за равные промежутки времени радиус-вектор заметает равные площади."
                else "Сектора Кеплера скрыты."
                "holdSensor" -> if (on) "Тело подвешено к динамометру: можно тянуть его пальцем вверх/вниз и наблюдать уменьшение веса в воде."
                else "Тело отпущено в свободное плавание под действием тяжести и силы Архимеда."
                "autoOscillate" -> if (on) "Магнит автоматически ходит через катушку, генерируя переменный индукционный ток."
                else "Автодвижение выключено: теперь двигай магнит через катушку пальцем вручную!"
                else -> if (on) "Опция включена." else "Опция выключена."
            }
            return "$label: ${if (on) "ВКЛ" else "ВЫКЛ"}" to detail
        }

        val header = "$label $dir: ${fmt(oldVal, dec)} → ${fmt(newVal, dec)}$unit"
        val detail = when (topic to key) {
            ExperimentTopic.BALLISTICS to "v0" -> {
                val ratio = (newVal / max(0.1, oldVal)).pow(2)
                "Начальная скорость определяет кинетическую энергию (E_k = ½mv₀²). Дальность в вакууме пропорциональна v₀², поэтому изменение скорости меняет дальность примерно в ${fmt(ratio, 2)} раз."
            }
            ExperimentTopic.BALLISTICS to "angle" ->
                "При α = ${fmt(newVal, 0)}°: горизонтальная составляющая v_x = v₀·cos(α), вертикальная v_y = v₀·sin(α). Максимум дальности в вакууме с земли — при 45°; с высоты h₀ > 0 — чуть ниже 45°."
            ExperimentTopic.BALLISTICS to "height" ->
                "Увеличение высоты броска h₀ увеличивает запас потенциальной энергии mgh₀ и время падения — тело пролетит дальше даже при малых углах."
            ExperimentTopic.BALLISTICS to "gravity" ->
                "Ускорение свободного падения g = ${fmt(newVal, 2)} м/с². Чем меньше g (например, на Луне 1.62 м/с²), тем медленнее гасится вертикальная скорость и тем дальше/выше летит тело."
            ExperimentTopic.BALLISTICS to "airDrag" ->
                if (newVal <= 0.01) "Сопротивление воздуха выключено (вакуум): траектория становится идеально симметричной параболой."
                else "Сопротивление воздуха F ~ C_d·v² тормозит тело и по горизонтали, и по вертикали. Нисходящая ветвь становится круче."
            ExperimentTopic.BALLISTICS to "wind" ->
                if (abs(newVal) < 0.2) "Ветер стих (0 м/с)."
                else if (newVal > 0) "Попутный ветер (+${fmt(newVal, 1)} м/с) уменьшает встречное сопротивление воздуха и дополнительно разгоняет тело по X."
                else "Встречный ветер (${fmt(newVal, 1)} м/с) увеличивает относительную скорость в воздухе и сильно сокращает дальность полёта."
            ExperimentTopic.BALLISTICS to "restitution" ->
                "При каждом ударе о землю скорость отскока умножается на e = ${fmt(newVal, 2)}, а кинетическая энергия уменьшается в e² = ${fmt(newVal * newVal, 2)} раз."

            ExperimentTopic.PENDULUM to "length" -> {
                val tNew = 2.0 * PI * sqrt(newVal / p(params, "gravity", 9.81))
                "По формуле Гюйгенса T = 2π√(L/g) увеличение длины в 4 раза увеличивает период в 2 раза. Сейчас теоретический период T = ${fmt(tNew, 2)} с."
            }
            ExperimentTopic.PENDULUM to "mass" ->
                if (p(params, "mode", 0.0) < 0.5) "Для математического маятника период T = 2π√(L/g) от массы НЕ зависит! Но кинетическая энергия и сила натяжения нити растут пропорционально m."
                else "Для пружинного маятника период T = 2π√(m/k) растёт как √m: более тяжёлый груз труднее разогнать пружиной."
            ExperimentTopic.PENDULUM to "gravity" ->
                "Чем сильнее гравитация g, тем больше возвращающая сила m·g·sin(θ) — математический маятник колеблется быстрее (период T ~ 1/√g)."
            ExperimentTopic.PENDULUM to "stiffness" ->
                "Жёсткость пружины k = ${fmt(newVal, 0)} Н/м: более тугая пружина создаёт большую силу F = -kx и уменьшает период колебаний T = 2π√(m/k)."
            ExperimentTopic.PENDULUM to "damping" ->
                if (newVal < 0.01) "Затухание выключено — механическая энергия колебаний сохраняется."
                else "Вязкое трение b = ${fmt(newVal, 2)} создаёт силу торможения, пропорциональную скорости: амплитуда экспоненциально затухает."
            ExperimentTopic.PENDULUM to "driveAmp", ExperimentTopic.PENDULUM to "driveFreq" ->
                "Вынуждающая сила F₀·cos(ωt) передаёт энергию маятнику. Когда ω близка к собственной частоте ω₀, наступает резонанс — максимальная раскачка!"

            ExperimentTopic.COLLISIONS to "m1", ExperimentTopic.COLLISIONS to "m2" ->
                "Изменение массы меняет импульс тела p = m·v и сдвигает центр масс. Тяжёлый шар при ударе почти не теряет скорость, передавая лёгкому почти удвоенную скорость."
            ExperimentTopic.COLLISIONS to "restitution" ->
                "Коэффициент восстановления e = ${fmt(newVal, 2)}: при e=1 энергия сохраняется полностью; при e=0 шары слипаются, теряя максимум энергии."
            ExperimentTopic.COLLISIONS to "friction" ->
                "Трение μ = ${fmt(newVal, 2)} создаёт внешнюю силу μmg: в этом случае суммарный импульс системы постепенно убывает до полной остановки."

            ExperimentTopic.CIRCUITS to "emf" ->
                "Увеличение ЭДС ε прямо пропорционально увеличивает силу тока в цепи I = ε/(R+r) и квадратично увеличивает мощность P ~ ε²."
            ExperimentTopic.CIRCUITS to "rInt" ->
                "Внутреннее сопротивление r = ${fmt(newVal, 1)} Ом ограничивает ток короткого замыкания и снижает напряжение на внешних клеммах U = ε − I·r."
            ExperimentTopic.CIRCUITS to "r1", ExperimentTopic.CIRCUITS to "r2" ->
                "По закону Ома рост сопротивления уменьшает силу тока I. В последовательной цепи большее сопротивление забирает большую долю напряжения (U = I·R)."
            ExperimentTopic.CIRCUITS to "capacitance" ->
                "Ёмкость C = ${fmt(newVal, 0)} мФ определяет постоянную времени τ = R·C: чем больше ёмкость, тем медленнее заряжается и разряжается конденсатор."

            ExperimentTopic.IDEAL_GAS to "temperature" ->
                "Температура T = ${fmt(newVal, 0)} К напрямую задаёт среднюю кинетическую энергию молекул E = (3/2)kT и их среднеквадратичную скорость v_кв ~ √T."
            ExperimentTopic.IDEAL_GAS to "volume" ->
                "Изменение объёма меняет концентрацию молекул n = N/V. При сжатии молекулы чаще ударяются о стенки сосуда — давление растёт."
            ExperimentTopic.IDEAL_GAS to "particles" ->
                "Число молекул N = ${fmt(newVal, 0)} напрямую меняет давление газа P = n·k·T (больше частиц — больше ударов о стенки в секунду)."
            ExperimentTopic.IDEAL_GAS to "molarMass" ->
                "При той же температуре более лёгкие молекулы (например, гелий M=4) движутся быстрее тяжёлых (аргон M=40), так как ½m₀v² = (3/2)kT."

            ExperimentTopic.OPTICS to "focalLen" ->
                if (newVal > 0) "Положительный фокус F = +${fmt(newVal, 0)} см (собирающая линза). Чем меньше |F|, тем сильнее оптическая сила D = 1/F и тем ближе к линзе собираются лучи."
                else "Отрицательный фокус F = ${fmt(newVal, 0)} см (рассеивающая линза): всегда даёт мнимое, прямое, уменьшенное изображение."
            ExperimentTopic.OPTICS to "objDist" ->
                "Сдвиг предмета к фокусу F увеличивает изображение и отодвигает его от линзы; при переходе d < F изображение становится мнимым и прямым."
            ExperimentTopic.OPTICS to "incidentAngle", ExperimentTopic.OPTICS to "n1", ExperimentTopic.OPTICS to "n2" ->
                "По закону Снеллиуса n₁·sin(α) = n₂·sin(β) луч прижимается к нормали при входе в более плотную среду (n₂ > n₁) и может полностью отразиться при n₁ > n₂."

            ExperimentTopic.WAVES to "frequency" ->
                "Рост частоты f при постоянной скорости v уменьшает длину волны λ = v/f — на струне укладывается больше полуволн, а полосы интерференции сближаются."
            ExperimentTopic.WAVES to "waveSpeed" ->
                "Увеличение скорости волны v (например, натяжения струны) растягивает длину волны λ = v/f."
            ExperimentTopic.WAVES to "slitDist" ->
                "Увеличение расстояния между источниками d сужает интерференционные полосы на экране."
            ExperimentTopic.WAVES to "phaseShift" ->
                "Сдвиг фаз Δφ = ${fmt(newVal, 0)}° смещает всю интерференционную картину: при 180° на месте центрального максимума возникает тёмный минимум!"

            ExperimentTopic.BUOYANCY to "bodyDensity" ->
                "Если плотность тела меньше плотности жидкости, тело всплывёт; если больше — утонет (сейчас ${fmt(newVal, 0)} кг/м³)."
            ExperimentTopic.BUOYANCY to "liquidDensity" ->
                "Более плотная жидкость (например, солёная вода или ртуть) сильнее выталкивает погружённое тело: F_A = ρ_ж·g·V_погр."
            ExperimentTopic.BUOYANCY to "bodyVolume" ->
                "При росте объёма пропорционально растут и масса тела, и выталкивающая сила Архимеда."

            ExperimentTopic.INCLINED_PLANE to "slopeAngle" ->
                "Рост угла α увеличивает скатывающую силу mg·sin(α) и уменьшает прижимающую силу трения μ·mg·cos(α)."
            ExperimentTopic.INCLINED_PLANE to "frictionMu" ->
                "Коэффициент трения μ = ${fmt(newVal, 2)}: срыв в скольжение происходит, когда tg(α) превысит μ."
            ExperimentTopic.INCLINED_PLANE to "pullForce" ->
                "Тяга F = ${fmt(newVal, 0)} Н тянет брусок вверх по склону, преодолевая скатывающую силу и трение."

            ExperimentTopic.ELECTROSTATICS to "charge" ->
                if (newVal == 0.0) "Нейтральная частица (q = 0): ни электрическое, ни магнитное поля на неё не действуют!"
                else "Увеличение заряда q усиливает силы F = qE и qvB; смена знака меняет направление отклонения на противоположное."
            ExperimentTopic.ELECTROSTATICS to "eField" ->
                "Напряжённость поля E напрямую задаёт вертикальное ускорение заряда между пластинами конденсатора."
            ExperimentTopic.ELECTROSTATICS to "bField" ->
                "Увеличение магнитного поля B сильнее закручивает траекторию — радиус окружности R = mv/(|q|B) уменьшается."

            ExperimentTopic.ELECTROMAGNETIC to "turns" ->
                "По закону Фарадея ЭДС пропорциональна числу витков катушки N — каждый виток суммирует напряжение!"
            ExperimentTopic.ELECTROMAGNETIC to "magStrength", ExperimentTopic.ELECTROMAGNETIC to "freq" ->
                "Чем сильнее магнит и быстрее меняется магнитный поток dΦ/dt, тем больше всплеск ЭДС индукции и тока."

            ExperimentTopic.PHOTOELECTRIC to "wavelengthNm" ->
                "Энергия фотона E = hc/λ растёт при уменьшении длины волны (к синему/УФ свету). Выше красной границы λ_кр фотоэффект прекращается."
            ExperimentTopic.PHOTOELECTRIC to "intensity" ->
                "Яркость света меняет число фотонов в секунду (и силу фототока I), но НЕ меняет энергию каждого электрона!"
            ExperimentTopic.PHOTOELECTRIC to "voltage" ->
                "Положительное U помогает электронам долететь до анода (ток насыщения); отрицательное тормозит их до полной остановки при U_з."

            ExperimentTopic.RADIOACTIVE to "halfLife" ->
                "Период полураспада T₁/₂ = ${fmt(newVal, 1)} с — время, за которое распадается ровно половина оставшихся ядер."
            ExperimentTopic.RADIOACTIVE to "nucleiCount" ->
                "Чем больше ядер N₀, тем точнее случайный распад следует гладкой теоретической кривой N₀·2^(−t/T₁/₂)."

            ExperimentTopic.ORBITS to "starMass" ->
                "Увеличение массы звезды M увеличивает гравитационное притяжение GMm/r² — для удержания на той же орбите планете нужна большая скорость v₁ ~ √M."
            ExperimentTopic.ORBITS to "orbitR" ->
                "Изменение начального радиуса меняет потенциальную энергию −GMm/r и первую космическую скорость."
            ExperimentTopic.ORBITS to "tangVel" ->
                "Изменение скорости меняет эксцентриситет орбиты: при v = v₁ орбита круговая; при v₁ < v < v₂ — вытянутый эллипс; при v ≥ v₂ — незамкнутая гипербола."
            ExperimentTopic.ORBITS to "launchAngle" ->
                "Отклонение угла скорости от касательной на ${fmt(newVal, 0)}° делает орбиту эллиптической даже при скорости v₁."

            else -> "Параметр $label изменён на ${fmt(newVal, dec)}$unit — пересчитаны физические характеристики системы."
        }
        return header to detail
    }

    companion object {
        fun fmt(v: Double, decimals: Int): String =
            if (!v.isFinite()) "∞" else String.format(Locale.US, "%.${decimals}f", v)
    }
}
