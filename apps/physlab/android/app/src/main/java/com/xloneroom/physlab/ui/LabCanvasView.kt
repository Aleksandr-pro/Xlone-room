package com.xloneroom.physlab.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.*
import android.view.MotionEvent
import android.view.View
import com.xloneroom.physlab.engine.PhysicsEngine
import com.xloneroom.physlab.model.ExperimentTopic
import kotlin.math.*

class LabCanvasView(context: Context) : View(context) {

    var engine: PhysicsEngine? = null
    var params: MutableMap<String, Double> = mutableMapOf()
    var showVectors: Boolean = true
    var showGrid: Boolean = true
    var isPlaying: Boolean = true

    var onDirectDragParam: ((key: String, oldVal: Double, newVal: Double, commit: Boolean) -> Unit)? = null
    var onDirectTapAction: (() -> Unit)? = null

    private var dragMode: String? = null
    private var dragStartVal: Double = 0.0
    private var dragStartVal2: Double = 0.0

    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x1E94A3B8
        strokeWidth = 1.5f
    }
    private val axisPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x4494A3B8
        strokeWidth = 2.5f
    }
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFE2E8F0.toInt()
        textSize = 28f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    private val smallTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF94A3B8.toInt()
        textSize = 24f
    }
    private val dashPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 3f
        pathEffect = DashPathEffect(floatArrayOf(14f, 10f), 0f)
    }
    private val pathBuf = Path()

    // Cached interactive screen points for touch dragging
    private var handlePoint1 = PointF()
    private var handlePoint2 = PointF()

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val eng = engine ?: return

        // Background gradient
        bgPaint.shader = LinearGradient(
            0f, 0f, 0f, h,
            0xFF0B101B.toInt(), 0xFF131C2E.toInt(),
            Shader.TileMode.CLAMP
        )
        canvas.drawRect(0f, 0f, w, h, bgPaint)

        if (showGrid && eng.topic != ExperimentTopic.ORBITS) {
            drawGrid(canvas, w, h)
        }

        when (eng.topic) {
            ExperimentTopic.BALLISTICS -> drawBallistics(canvas, w, h, eng)
            ExperimentTopic.PENDULUM -> drawPendulum(canvas, w, h, eng)
            ExperimentTopic.COLLISIONS -> drawCollisions(canvas, w, h, eng)
            ExperimentTopic.BUOYANCY -> drawBuoyancy(canvas, w, h, eng)
            ExperimentTopic.INCLINED_PLANE -> drawInclinedPlane(canvas, w, h, eng)
            ExperimentTopic.CIRCUITS -> drawCircuits(canvas, w, h, eng)
            ExperimentTopic.ELECTROSTATICS -> drawElectrostatics(canvas, w, h, eng)
            ExperimentTopic.ELECTROMAGNETIC -> drawElectromagnetic(canvas, w, h, eng)
            ExperimentTopic.IDEAL_GAS -> drawIdealGas(canvas, w, h, eng)
            ExperimentTopic.OPTICS -> drawOptics(canvas, w, h, eng)
            ExperimentTopic.WAVES -> drawWaves(canvas, w, h, eng)
            ExperimentTopic.PHOTOELECTRIC -> drawPhotoelectric(canvas, w, h, eng)
            ExperimentTopic.RADIOACTIVE -> drawRadioactive(canvas, w, h, eng)
            ExperimentTopic.ORBITS -> drawOrbits(canvas, w, h, eng)
        }

        // Subtle interactive hint pill in bottom-left
        val hint = when (eng.topic) {
            ExperimentTopic.BALLISTICS -> "Потяни у пушки: угол и v₀"
            ExperimentTopic.PENDULUM -> "Потяни груз пальцем"
            ExperimentTopic.COLLISIONS -> "Потяни шары вдоль дорожки"
            ExperimentTopic.BUOYANCY -> "Потяни кубик в жидкость"
            ExperimentTopic.INCLINED_PLANE -> "Потяни склон: угол α"
            ExperimentTopic.CIRCUITS -> "Нажми на ключ в схеме"
            ExperimentTopic.ELECTROSTATICS -> "Поля E и B действуют на q"
            ExperimentTopic.ELECTROMAGNETIC -> "Двигай магнит пальцем!"
            ExperimentTopic.IDEAL_GAS -> "Потяни поршень вверх/вниз"
            ExperimentTopic.OPTICS -> if ((params["optMode"] ?: 0.0) < 0.5) "Потяни свечу вдоль оси" else "Потяни луч лазера"
            ExperimentTopic.WAVES -> "Волновая картина"
            ExperimentTopic.PHOTOELECTRIC -> "Свет выбивает электроны"
            ExperimentTopic.RADIOACTIVE -> "Наблюдай распад ядер"
            ExperimentTopic.ORBITS -> "Потяни вектор скорости v"
        }
        smallTextPaint.textSize = resources.displayMetrics.density * 11f
        smallTextPaint.color = 0xAA94A3B8.toInt()
        canvas.drawText(hint, resources.displayMetrics.density * 10f, h - resources.displayMetrics.density * 8f, smallTextPaint)
    }

    private fun drawGrid(canvas: Canvas, w: Float, h: Float) {
        val step = resources.displayMetrics.density * 28f
        var x = step
        while (x < w) {
            canvas.drawLine(x, 0f, x, h, gridPaint)
            x += step
        }
        var y = step
        while (y < h) {
            canvas.drawLine(0f, y, w, y, gridPaint)
            y += step
        }
    }

    private fun drawArrow(
        canvas: Canvas,
        x0: Float,
        y0: Float,
        x1: Float,
        y1: Float,
        color: Int,
        label: String? = null,
        strokeW: Float = 4.5f
    ) {
        val dx = x1 - x0
        val dy = y1 - y0
        val len = hypot(dx, dy)
        if (len < 6f) return

        strokePaint.color = color
        strokePaint.strokeWidth = strokeW
        canvas.drawLine(x0, y0, x1, y1, strokePaint)

        val ux = dx / len
        val uy = dy / len
        val head = min(18f, len * 0.35f)
        val px = -uy
        val py = ux

        pathBuf.reset()
        pathBuf.moveTo(x1, y1)
        pathBuf.lineTo(x1 - ux * head + px * head * 0.45f, y1 - uy * head + py * head * 0.45f)
        pathBuf.lineTo(x1 - ux * head - px * head * 0.45f, y1 - uy * head - py * head * 0.45f)
        pathBuf.close()
        fillPaint.color = color
        canvas.drawPath(pathBuf, fillPaint)

        if (!label.isNullOrBlank()) {
            textPaint.color = color
            textPaint.textSize = resources.displayMetrics.density * 11.5f
            canvas.drawText(label, x1 + 6f, y1 - 6f, textPaint)
        }
    }

    private fun drawBallistics(canvas: Canvas, w: Float, h: Float, eng: PhysicsEngine) {
        val d = resources.displayMetrics.density
        val padL = 36f * d
        val groundY = h - 34f * d
        val maxWorldX = max(50.0, max(eng.ballRange + 8.0, (eng.vacuumTrail.lastOrNull()?.x ?: 45.0) + 6.0))
        val maxWorldY = max(25.0, max(eng.ballMaxH + 5.0, (params["height"] ?: 2.0) + 18.0))
        val scale = min((w - padL - 20f * d) / maxWorldX.toFloat(), (groundY - 24f * d) / maxWorldY.toFloat())

        fun wx(m: Double) = padL + m.toFloat() * scale
        fun wy(m: Double) = groundY - m.toFloat() * scale

        // Ground
        fillPaint.color = 0xFF1A2538.toInt()
        canvas.drawRect(0f, groundY, w, h, fillPaint)
        strokePaint.color = 0xFF2DD4BF.toInt()
        strokePaint.strokeWidth = 3f
        canvas.drawLine(0f, groundY, w, groundY, strokePaint)

        // Meter markers along ground
        smallTextPaint.textSize = 10f * d
        smallTextPaint.color = 0xFF64748B.toInt()
        val meterStep = if (maxWorldX > 90) 20 else 10
        var mx = 0
        while (mx <= maxWorldX.toInt()) {
            val sx = wx(mx.toDouble())
            canvas.drawLine(sx, groundY, sx, groundY + 6f * d, axisPaint)
            canvas.drawText("${mx}м", sx - 6f * d, groundY + 18f * d, smallTextPaint)
            mx += meterStep
        }

        // Wind indicator if non-zero
        val wind = params["wind"] ?: 0.0
        if (abs(wind) > 0.3) {
            val dir = if (wind > 0) 1f else -1f
            drawArrow(canvas, w * 0.5f - dir * 35f * d, 22f * d, w * 0.5f + dir * 35f * d, 22f * d, 0xFF64748B.toInt(), "Ветер ${PhysicsEngine.fmt(wind, 1)} м/с", 3f)
        }

        // Reference vacuum parabola
        if ((params["showVacuumRef"] ?: 1.0) >= 0.5 && eng.vacuumTrail.size > 1) {
            dashPaint.color = 0x6694A3B8
            pathBuf.reset()
            eng.vacuumTrail.forEachIndexed { i, pt ->
                if (i == 0) pathBuf.moveTo(wx(pt.x), wy(pt.y))
                else pathBuf.lineTo(wx(pt.x), wy(pt.y))
            }
            canvas.drawPath(pathBuf, dashPaint)
        }

        // Actual trail
        if (eng.ballTrail.size > 1) {
            strokePaint.color = 0xFF38BDF8.toInt()
            strokePaint.strokeWidth = 3.5f * d
            pathBuf.reset()
            eng.ballTrail.forEachIndexed { i, pt ->
                if (i == 0) pathBuf.moveTo(wx(pt.x), wy(pt.y))
                else pathBuf.lineTo(wx(pt.x), wy(pt.y))
            }
            canvas.drawPath(pathBuf, strokePaint)
        }

        // Launcher pedestal & barrel
        val h0 = params["height"] ?: 2.0
        val lx = wx(0.0)
        val ly = wy(h0)
        val angRad = Math.toRadians(params["angle"] ?: 45.0)
        val v0 = params["v0"] ?: 24.0
        val aimLen = (24f + v0.toFloat() * 1.1f) * d
        val aimX = lx + cos(angRad).toFloat() * aimLen
        val aimY = ly - sin(angRad).toFloat() * aimLen
        handlePoint1.set(aimX, aimY)

        if (h0 > 0.1) {
            strokePaint.color = 0xFF475569.toInt()
            strokePaint.strokeWidth = 6f * d
            canvas.drawLine(lx, groundY, lx, ly, strokePaint)
        }
        strokePaint.color = 0xFF94A3B8.toInt()
        strokePaint.strokeWidth = 9f * d
        canvas.drawLine(lx, ly, lx + cos(angRad).toFloat() * 24f * d, ly - sin(angRad).toFloat() * 24f * d, strokePaint)

        // Aim handle dot
        fillPaint.color = 0x66F59E0B
        canvas.drawCircle(aimX, aimY, 10f * d, fillPaint)
        fillPaint.color = 0xFFF59E0B.toInt()
        canvas.drawCircle(aimX, aimY, 4.5f * d, fillPaint)

        // Projectile ball
        val bx = wx(eng.ballPos.x)
        val by = wy(eng.ballPos.y)
        fillPaint.color = 0x4438BDF8
        canvas.drawCircle(bx, by, 14f * d, fillPaint)
        fillPaint.color = 0xFF38BDF8.toInt()
        canvas.drawCircle(bx, by, 7.5f * d, fillPaint)

        if (showVectors) {
            val vScale = 2.0f * d
            drawArrow(canvas, bx, by, bx + eng.ballVel.x.toFloat() * vScale, by - eng.ballVel.y.toFloat() * vScale, 0xFFF59E0B.toInt(), "v")
            val g = (params["gravity"] ?: 9.81).toFloat()
            drawArrow(canvas, bx, by, bx, by + g * 2.8f * d, 0xFFEF4444.toInt(), "mg", 3.5f)
        }
    }

    private fun drawPendulum(canvas: Canvas, w: Float, h: Float, eng: PhysicsEngine) {
        val d = resources.displayMetrics.density
        val mode = (params["mode"] ?: 0.0).toInt()
        val pivotX = w * 0.5f
        val pivotY = 26f * d

        // Ceiling bracket
        strokePaint.color = 0xFF64748B.toInt()
        strokePaint.strokeWidth = 5f * d
        canvas.drawLine(pivotX - 70f * d, pivotY, pivotX + 70f * d, pivotY, strokePaint)

        if (mode == 0) {
            val L = params["length"] ?: 1.4
            val pxPerMeter = min((h - 60f * d) / 4.2f, w * 0.36f / 2.2f)
            val rodPx = (L * pxPerMeter).toFloat().coerceIn(45f * d, h - 75f * d)

            // Vertical reference
            dashPaint.color = 0x4494A3B8
            canvas.drawLine(pivotX, pivotY, pivotX, pivotY + rodPx + 20f * d, dashPaint)

            // Trail
            if (eng.pendTrail.size > 1) {
                strokePaint.color = 0x5538BDF8
                strokePaint.strokeWidth = 3f * d
                pathBuf.reset()
                eng.pendTrail.forEachIndexed { idx, pt ->
                    val sx = pivotX + (pt.x / max(0.2, L)).toFloat() * rodPx
                    val sy = pivotY - (pt.y / max(0.2, L)).toFloat() * rodPx
                    if (idx == 0) pathBuf.moveTo(sx, sy) else pathBuf.lineTo(sx, sy)
                }
                canvas.drawPath(pathBuf, strokePaint)
            }

            val bx = pivotX + sin(eng.pendAngle).toFloat() * rodPx
            val by = pivotY + cos(eng.pendAngle).toFloat() * rodPx
            handlePoint1.set(bx, by)

            // Rod
            strokePaint.color = 0xFFE2E8F0.toInt()
            strokePaint.strokeWidth = 3f * d
            canvas.drawLine(pivotX, pivotY, bx, by, strokePaint)

            // Bob sized slightly by mass
            val mass = params["mass"] ?: 1.5
            val bobR = (11f + 3f * cbrt(mass.toFloat())) * d
            fillPaint.color = 0x3338BDF8
            canvas.drawCircle(bx, by, bobR + 6f * d, fillPaint)
            fillPaint.color = 0xFF38BDF8.toInt()
            canvas.drawCircle(bx, by, bobR, fillPaint)

            if (showVectors) {
                val v = (L * eng.pendOmega).toFloat() * 14f * d
                val tx = cos(eng.pendAngle).toFloat()
                val ty = -sin(eng.pendAngle).toFloat()
                drawArrow(canvas, bx, by, bx + tx * v, by + ty * v, 0xFFF59E0B.toInt(), "v")
                val g = (params["gravity"] ?: 9.81).toFloat()
                drawArrow(canvas, bx, by, bx, by + g * 3f * d, 0xFFEF4444.toInt(), "mg", 3.5f)
            }
        } else {
            // Spring-mass horizontal/vertical oscillator (vertical spring for great phone portrait view!)
            val restLen = h * 0.48f
            val dispPx = (eng.springPos * 60.0 * d).toFloat().coerceIn(-h * 0.28f, h * 0.34f)
            val bx = pivotX
            val by = pivotY + restLen + dispPx
            handlePoint1.set(bx, by)

            // Equilibrium dashed line
            dashPaint.color = 0x552DD4BF
            canvas.drawLine(pivotX - 90f * d, pivotY + restLen, pivotX + 90f * d, pivotY + restLen, dashPaint)
            smallTextPaint.textSize = 10f * d
            smallTextPaint.color = 0xFF2DD4BF.toInt()
            canvas.drawText("x = 0", pivotX + 46f * d, pivotY + restLen - 4f * d, smallTextPaint)

            // Zigzag spring coils
            val coils = 12
            strokePaint.color = 0xFF94A3B8.toInt()
            strokePaint.strokeWidth = 3f * d
            pathBuf.reset()
            pathBuf.moveTo(pivotX, pivotY)
            val coilSpan = (by - pivotY - 18f * d) / coils
            for (i in 1 until coils) {
                val xOff = if (i % 2 == 0) -16f * d else 16f * d
                pathBuf.lineTo(pivotX + xOff, pivotY + i * coilSpan)
            }
            pathBuf.lineTo(bx, by)
            canvas.drawPath(pathBuf, strokePaint)

            val mass = params["mass"] ?: 1.5
            val boxHalf = (14f + 3f * cbrt(mass.toFloat())) * d
            fillPaint.color = 0xFFF97316.toInt()
            canvas.drawRoundRect(bx - boxHalf, by - boxHalf, bx + boxHalf, by + boxHalf, 8f * d, 8f * d, fillPaint)

            if (showVectors) {
                val k = (params["stiffness"] ?: 24.0).toFloat()
                val fElastic = (-k * eng.springPos.toFloat()) * 1.4f * d
                drawArrow(canvas, bx + boxHalf + 8f * d, by, bx + boxHalf + 8f * d, by - fElastic, 0xFF22C55E.toInt(), "F_упр")
                drawArrow(canvas, bx - boxHalf - 8f * d, by, bx - boxHalf - 8f * d, by + eng.springVel.toFloat() * 14f * d, 0xFFF59E0B.toInt(), "v")
            }
        }
    }

    private fun drawCollisions(canvas: Canvas, w: Float, h: Float, eng: PhysicsEngine) {
        val d = resources.displayMetrics.density
        val trackY = h * 0.62f
        val pad = 20f * d
        val trackW = w - 2f * pad

        fun tx(worldX: Double): Float = pad + ((worldX + 10.5) / 21.0).toFloat() * trackW

        // Air track rail
        fillPaint.color = 0xFF1E293B.toInt()
        canvas.drawRoundRect(pad, trackY, w - pad, trackY + 14f * d, 4f * d, 4f * d, fillPaint)
        strokePaint.color = 0xFF475569.toInt()
        strokePaint.strokeWidth = 3f * d
        canvas.drawLine(pad, trackY - 50f * d, pad, trackY + 14f * d, strokePaint)
        canvas.drawLine(w - pad, trackY - 50f * d, w - pad, trackY + 14f * d, strokePaint)

        val m1 = params["m1"] ?: 3.0
        val m2 = params["m2"] ?: 1.5
        val r1Px = ((0.45 + 0.12 * cbrt(m1)) * trackW / 21.0).toFloat()
        val r2Px = ((0.45 + 0.12 * cbrt(m2)) * trackW / 21.0).toFloat()

        val sx1 = tx(eng.colX1)
        val sy1 = trackY - r1Px
        val sx2 = tx(eng.colX2)
        val sy2 = trackY - r2Px
        handlePoint1.set(sx1, sy1)
        handlePoint2.set(sx2, sy2)

        // Impact flash
        if (eng.colImpactFlash > 0.01) {
            val midX = 0.5f * (sx1 + sx2)
            val midY = 0.5f * (sy1 + sy2)
            fillPaint.color = Color.argb((eng.colImpactFlash * 160).toInt().coerceIn(0, 255), 250, 204, 21)
            canvas.drawCircle(midX, midY, (22f + 26f * (1f - eng.colImpactFlash.toFloat())) * d, fillPaint)
        }

        // Center of mass marker
        val xCm = (m1 * eng.colX1 + m2 * eng.colX2) / (m1 + m2)
        val sxCm = tx(xCm)
        fillPaint.color = 0xFF2DD4BF.toInt()
        canvas.drawCircle(sxCm, trackY + 7f * d, 5f * d, fillPaint)
        smallTextPaint.textSize = 10f * d
        smallTextPaint.color = 0xFF2DD4BF.toInt()
        canvas.drawText("ЦМ", sxCm - 8f * d, trackY + 26f * d, smallTextPaint)

        // Ball 1
        fillPaint.color = 0xFF38BDF8.toInt()
        canvas.drawCircle(sx1, sy1, r1Px, fillPaint)
        textPaint.color = 0xFF0A0F18.toInt()
        textPaint.textSize = 11f * d
        canvas.drawText("m₁", sx1 - 8f * d, sy1 + 4f * d, textPaint)

        // Ball 2
        fillPaint.color = 0xFFF97316.toInt()
        canvas.drawCircle(sx2, sy2, r2Px, fillPaint)
        canvas.drawText("m₂", sx2 - 8f * d, sy2 + 4f * d, textPaint)

        if (showVectors) {
            drawArrow(canvas, sx1, sy1 - r1Px - 10f * d, sx1 + eng.colV1.toFloat() * 10f * d, sy1 - r1Px - 10f * d, 0xFF38BDF8.toInt(), "v₁=${PhysicsEngine.fmt(eng.colV1, 1)}")
            drawArrow(canvas, sx2, sy2 - r2Px - 28f * d, sx2 + eng.colV2.toFloat() * 10f * d, sy2 - r2Px - 28f * d, 0xFFF97316.toInt(), "v₂=${PhysicsEngine.fmt(eng.colV2, 1)}")
        }
    }

    private fun drawCircuits(canvas: Canvas, w: Float, h: Float, eng: PhysicsEngine) {
        val d = resources.displayMetrics.density
        val topo = (params["topology"] ?: 0.0).toInt()
        val closed = (params["switchClosed"] ?: 1.0) >= 0.5
        val emf = params["emf"] ?: 12.0
        val r1 = params["r1"] ?: 10.0
        val r2 = params["r2"] ?: 14.0

        val left = w * 0.14f
        val right = w * 0.86f
        val top = h * 0.24f
        val bot = h * 0.78f
        val midY = (top + bot) * 0.5f

        // Wire frame
        strokePaint.color = if (abs(eng.circuitCurrent) > 0.02) 0xFF38BDF8.toInt() else 0xFF475569.toInt()
        strokePaint.strokeWidth = 3.5f * d

        // Left battery branch
        canvas.drawLine(left, top, left, midY - 18f * d, strokePaint)
        canvas.drawLine(left, midY + 18f * d, left, bot, strokePaint)
        // Battery plates
        strokePaint.color = 0xFFFACC15.toInt()
        strokePaint.strokeWidth = 4.5f * d
        canvas.drawLine(left - 18f * d, midY - 10f * d, left + 18f * d, midY - 10f * d, strokePaint)
        strokePaint.strokeWidth = 8f * d
        canvas.drawLine(left - 10f * d, midY + 10f * d, left + 10f * d, midY + 10f * d, strokePaint)
        textPaint.color = 0xFFFACC15.toInt()
        textPaint.textSize = 11.5f * d
        canvas.drawText("ε=${PhysicsEngine.fmt(emf, 1)}В", left - 24f * d, midY + 34f * d, textPaint)

        // Bottom return wire + Switch
        val swX = (left + right) * 0.48f
        handlePoint1.set(swX, bot)
        strokePaint.color = if (abs(eng.circuitCurrent) > 0.02) 0xFF38BDF8.toInt() else 0xFF475569.toInt()
        strokePaint.strokeWidth = 3.5f * d
        canvas.drawLine(left, bot, swX - 22f * d, bot, strokePaint)
        canvas.drawLine(swX + 22f * d, bot, right, bot, strokePaint)
        fillPaint.color = 0xFFE2E8F0.toInt()
        canvas.drawCircle(swX - 22f * d, bot, 4.5f * d, fillPaint)
        canvas.drawCircle(swX + 22f * d, bot, 4.5f * d, fillPaint)
        strokePaint.color = 0xFFF59E0B.toInt()
        strokePaint.strokeWidth = 4f * d
        if (closed) {
            canvas.drawLine(swX - 22f * d, bot, swX + 22f * d, bot, strokePaint)
        } else {
            canvas.drawLine(swX - 22f * d, bot, swX + 16f * d, bot - 22f * d, strokePaint)
        }
        smallTextPaint.textSize = 10f * d
        smallTextPaint.color = 0xFFF59E0B.toInt()
        canvas.drawText(if (closed) "Ключ ЗАМКНУТ" else "Ключ РАЗОМКНУТ", swX - 36f * d, bot + 18f * d, smallTextPaint)

        // Top & Right components depending on topology
        strokePaint.color = if (abs(eng.circuitCurrent) > 0.02) 0xFF38BDF8.toInt() else 0xFF475569.toInt()
        strokePaint.strokeWidth = 3.5f * d
        if (topo == 0) {
            // Series: R1 on top, R2 on right
            canvas.drawLine(left, top, right, top, strokePaint)
            canvas.drawLine(right, top, right, bot, strokePaint)
            drawResistorBox(canvas, (left + right) * 0.5f, top, 54f * d, 22f * d, "R₁=${r1.toInt()}Ω", abs(eng.circuitCurrent))
            drawResistorBox(canvas, right, midY, 24f * d, 52f * d, "R₂=${r2.toInt()}Ω", abs(eng.circuitCurrent))
        } else if (topo == 1) {
            // Parallel: R1 on middle-right branch, R2 on far-right branch
            val midRight = (left + right) * 0.62f
            canvas.drawLine(left, top, right, top, strokePaint)
            canvas.drawLine(midRight, top, midRight, bot, strokePaint)
            canvas.drawLine(right, top, right, bot, strokePaint)
            drawResistorBox(canvas, midRight, midY, 24f * d, 52f * d, "R₁=${r1.toInt()}Ω", eng.circuitVExt / r1)
            drawResistorBox(canvas, right, midY, 24f * d, 52f * d, "R₂=${r2.toInt()}Ω", eng.circuitVExt / r2)
        } else {
            // RC circuit: R1 on top, Capacitor in center, R2 discharge branch on right
            val capX = (left + right) * 0.62f
            canvas.drawLine(left, top, right, top, strokePaint)
            canvas.drawLine(capX, top, capX, midY - 12f * d, strokePaint)
            canvas.drawLine(capX, midY + 12f * d, capX, bot, strokePaint)
            canvas.drawLine(right, top, right, bot, strokePaint)

            drawResistorBox(canvas, (left + capX) * 0.5f, top, 50f * d, 22f * d, "R₁=${r1.toInt()}Ω", if (closed) abs(eng.circuitCurrent) else 0.0)
            drawResistorBox(canvas, right, midY, 24f * d, 52f * d, "R₂=${r2.toInt()}Ω", if (!closed) abs(eng.circuitCurrent) else 0.0)

            // Capacitor plates with charge bar
            val ratio = (eng.capVoltage / max(1.0, emf)).coerceIn(0.0, 1.0).toFloat()
            strokePaint.color = Color.rgb((60 + 195 * ratio).toInt(), (180 + 40 * ratio).toInt(), 250)
            strokePaint.strokeWidth = 5f * d
            canvas.drawLine(capX - 20f * d, midY - 10f * d, capX + 20f * d, midY - 10f * d, strokePaint)
            canvas.drawLine(capX - 20f * d, midY + 10f * d, capX + 20f * d, midY + 10f * d, strokePaint)
            textPaint.color = 0xFF2DD4BF.toInt()
            textPaint.textSize = 11f * d
            canvas.drawText("U_C=${PhysicsEngine.fmt(eng.capVoltage, 1)}В", capX - 30f * d, midY - 20f * d, textPaint)
        }

        // Animated electron dots along main loop when current flows
        if (abs(eng.circuitCurrent) > 0.02) {
            fillPaint.color = 0xFF38BDF8.toInt()
            val dots = 12
            val perimeter = 2f * (right - left) + 2f * (bot - top)
            for (i in 0 until dots) {
                val dist = (((i.toDouble() / dots) + eng.electronPhase) % 1.0).toFloat() * perimeter
                val pt = pointOnRect(left, top, right, bot, dist)
                canvas.drawCircle(pt.x, pt.y, 4f * d, fillPaint)
            }
        }

        // Digital Ammeter badge in center-top
        fillPaint.color = 0xEE161C29.toInt()
        canvas.drawRoundRect(w * 0.34f, 10f * d, w * 0.66f, 38f * d, 12f * d, 12f * d, fillPaint)
        textPaint.color = 0xFF38BDF8.toInt()
        textPaint.textSize = 12f * d
        canvas.drawText(
            "A: ${PhysicsEngine.fmt(eng.circuitCurrent, 2)} А  |  V: ${PhysicsEngine.fmt(eng.circuitVExt, 1)} В",
            w * 0.37f,
            28f * d,
            textPaint
        )
    }

    private fun drawResistorBox(canvas: Canvas, cx: Float, cy: Float, bw: Float, bh: Float, label: String, current: Double) {
        val d = resources.displayMetrics.density
        val heat = (abs(current) / 3.0).coerceIn(0.0, 1.0).toFloat()
        fillPaint.color = Color.rgb((35 + 210 * heat).toInt(), (45 + 90 * heat).toInt(), (68 - 40 * heat).toInt())
        canvas.drawRoundRect(cx - bw * 0.5f, cy - bh * 0.5f, cx + bw * 0.5f, cy + bh * 0.5f, 6f * d, 6f * d, fillPaint)
        strokePaint.color = 0xFFF97316.toInt()
        strokePaint.strokeWidth = 2f * d
        canvas.drawRoundRect(cx - bw * 0.5f, cy - bh * 0.5f, cx + bw * 0.5f, cy + bh * 0.5f, 6f * d, 6f * d, strokePaint)
        textPaint.color = 0xFFFFFFFF.toInt()
        textPaint.textSize = 10.5f * d
        canvas.drawText(label, cx - bw * 0.45f, cy + 4f * d, textPaint)
    }

    private fun pointOnRect(l: Float, t: Float, r: Float, b: Float, dist: Float): PointF {
        val w = r - l
        val h = b - t
        return when {
            dist < w -> PointF(l + dist, t)
            dist < w + h -> PointF(r, t + (dist - w))
            dist < 2f * w + h -> PointF(r - (dist - w - h), b)
            else -> PointF(l, b - (dist - 2f * w - h))
        }
    }

    private fun drawIdealGas(canvas: Canvas, w: Float, h: Float, eng: PhysicsEngine) {
        val d = resources.displayMetrics.density
        val cylL = w * 0.18f
        val cylR = w * 0.82f
        val cylBot = h - 22f * d
        val cylTopLimit = 26f * d
        val maxCylH = cylBot - cylTopLimit

        val vol = (params["volume"] ?: 5.0).coerceIn(1.5, 10.0)
        val pistonY = cylBot - (vol / 10.0).toFloat() * maxCylH
        handlePoint1.set((cylL + cylR) * 0.5f, pistonY)

        // Cylinder interior
        fillPaint.color = 0xFF0A0F18.toInt()
        canvas.drawRect(cylL, cylTopLimit, cylR, cylBot, fillPaint)

        // Molecules colored by speed
        val temp = params["temperature"] ?: 300.0
        for (m in eng.gasMolecules) {
            val sx = cylL + (m.x / 10.0).toFloat() * (cylR - cylL)
            val sy = cylBot - (m.y / 10.0).toFloat() * maxCylH
            val spd = hypot(m.vx, m.vy)
            val hot = ((spd / 4.8) * (temp / 300.0).pow(0.1)).coerceIn(0.0, 1.0).toFloat()
            fillPaint.color = Color.rgb(
                (56 + 195 * hot).toInt().coerceIn(0, 255),
                (189 - 110 * hot).toInt().coerceIn(0, 255),
                (248 - 200 * hot).toInt().coerceIn(0, 255)
            )
            canvas.drawCircle(sx, sy, 4.2f * d, fillPaint)
        }

        // Movable piston head
        fillPaint.color = if (eng.gasCollisionFlash > 0.1) 0xFF64748B.toInt() else 0xFF475569.toInt()
        canvas.drawRect(cylL, pistonY - 12f * d, cylR, pistonY, fillPaint)
        strokePaint.color = 0xFF94A3B8.toInt()
        strokePaint.strokeWidth = 6f * d
        canvas.drawLine((cylL + cylR) * 0.5f, pistonY - 12f * d, (cylL + cylR) * 0.5f, 4f * d, strokePaint)
        fillPaint.color = 0xFFF59E0B.toInt()
        canvas.drawRoundRect((cylL + cylR) * 0.5f - 28f * d, pistonY - 18f * d, (cylL + cylR) * 0.5f + 28f * d, pistonY - 4f * d, 8f * d, 8f * d, fillPaint)

        // Cylinder glass walls
        strokePaint.color = 0xFF94A3B8.toInt()
        strokePaint.strokeWidth = 4f * d
        canvas.drawLine(cylL, cylTopLimit, cylL, cylBot, strokePaint)
        canvas.drawLine(cylL, cylBot, cylR, cylBot, strokePaint)
        canvas.drawLine(cylR, cylBot, cylR, cylTopLimit, strokePaint)

        // Side telemetry pill
        textPaint.color = 0xFFF97316.toInt()
        textPaint.textSize = 11.5f * d
        canvas.drawText("P = ${PhysicsEngine.fmt(eng.gasMeasuredPressureKpa, 1)} кПа", 10f * d, 26f * d, textPaint)
        textPaint.color = 0xFFEF4444.toInt()
        canvas.drawText("T = ${PhysicsEngine.fmt(temp, 0)} К", 10f * d, 44f * d, textPaint)
        textPaint.color = 0xFF38BDF8.toInt()
        canvas.drawText("V = ${PhysicsEngine.fmt(vol, 1)} л", 10f * d, 62f * d, textPaint)
    }

    private fun drawOptics(canvas: Canvas, w: Float, h: Float, eng: PhysicsEngine) {
        val d = resources.displayMetrics.density
        val mode = (params["optMode"] ?: 0.0).toInt()

        if (mode == 0) {
            val axisY = h * 0.54f
            val lensX = w * 0.5f
            val pxPerCm = (w * 0.44f) / 72f

            // Principal optical axis
            dashPaint.color = 0x8894A3B8.toInt()
            canvas.drawLine(0f, axisY, w, axisY, dashPaint)

            val fLen = (params["focalLen"] ?: 18.0).let { if (abs(it) < 1.0) 1.0 else it }.toFloat()
            val objD = (params["objDist"] ?: 32.0).toFloat()
            val objH = (params["objHeight"] ?: 8.0).toFloat()

            // Focus markers
            fillPaint.color = 0xFFFACC15.toInt()
            canvas.drawCircle(lensX - abs(fLen) * pxPerCm, axisY, 4f * d, fillPaint)
            canvas.drawCircle(lensX + abs(fLen) * pxPerCm, axisY, 4f * d, fillPaint)
            smallTextPaint.textSize = 10f * d
            smallTextPaint.color = 0xFFFACC15.toInt()
            canvas.drawText("F", lensX - abs(fLen) * pxPerCm - 3f * d, axisY + 15f * d, smallTextPaint)
            canvas.drawText("F'", lensX + abs(fLen) * pxPerCm - 3f * d, axisY + 15f * d, smallTextPaint)

            // Lens body
            val lensH = h * 0.38f
            strokePaint.color = 0xFF38BDF8.toInt()
            strokePaint.strokeWidth = 4f * d
            canvas.drawLine(lensX, axisY - lensH, lensX, axisY + lensH, strokePaint)
            // Lens arrows indicating converging vs diverging
            if (fLen > 0) {
                drawArrow(canvas, lensX, axisY - lensH + 14f * d, lensX, axisY - lensH, 0xFF38BDF8.toInt(), strokeW = 3.5f)
                drawArrow(canvas, lensX, axisY + lensH - 14f * d, lensX, axisY + lensH, 0xFF38BDF8.toInt(), strokeW = 3.5f)
            } else {
                drawArrow(canvas, lensX, axisY - lensH, lensX, axisY - lensH + 14f * d, 0xFFA855F7.toInt(), strokeW = 3.5f)
                drawArrow(canvas, lensX, axisY + lensH, lensX, axisY + lensH - 14f * d, 0xFFA855F7.toInt(), strokeW = 3.5f)
            }

            // Object arrow
            val ox = lensX - objD * pxPerCm
            val oyTop = axisY - objH * pxPerCm * 1.4f
            handlePoint1.set(ox, oyTop)
            drawArrow(canvas, ox, axisY, ox, oyTop, 0xFFF59E0B.toInt(), "Предмет", 5f)

            // Thin lens equation: 1/f = 1/F - 1/d
            val denom = (1.0f / fLen) - (1.0f / objD)
            if (abs(denom) > 1e-4f) {
                val fImg = 1.0f / denom
                val ix = lensX + fImg * pxPerCm
                val hImg = objH * (-fImg / objD)
                val iyTip = axisY - hImg * pxPerCm * 1.4f

                // Principal ray 1: parallel -> through focus
                strokePaint.color = 0xFF38BDF8.toInt()
                strokePaint.strokeWidth = 2.5f * d
                canvas.drawLine(ox, oyTop, lensX, oyTop, strokePaint)
                if (fImg > 0) {
                    canvas.drawLine(lensX, oyTop, ix, iyTip, strokePaint)
                } else {
                    // Diverges away from focal point
                    val farX = w
                    val slope = (iyTip - oyTop) / (ix - lensX)
                    canvas.drawLine(lensX, oyTop, farX, oyTop + slope * (farX - lensX), strokePaint)
                    dashPaint.color = 0x8838BDF8.toInt()
                    canvas.drawLine(lensX, oyTop, ix, iyTip, dashPaint)
                }

                // Principal ray 2: straight through optical center
                strokePaint.color = 0xFF2DD4BF.toInt()
                canvas.drawLine(ox, oyTop, lensX, axisY, strokePaint)
                if (fImg > 0) {
                    canvas.drawLine(lensX, axisY, ix, iyTip, strokePaint)
                } else {
                    val slope2 = (axisY - oyTop) / (lensX - ox)
                    canvas.drawLine(lensX, axisY, w, axisY + slope2 * (w - lensX), strokePaint)
                    dashPaint.color = 0x882DD4BF.toInt()
                    canvas.drawLine(ox, oyTop, ix, iyTip, dashPaint)
                }

                // Image arrow
                drawArrow(
                    canvas,
                    ix,
                    axisY,
                    ix,
                    iyTip,
                    if (fImg > 0) 0xFFA855F7.toInt() else 0xFF22C55E.toInt(),
                    if (fImg > 0) "Действ." else "Мнимое",
                    4.5f
                )
            }
        } else {
            // Snell's law & Dispersion
            val midX = w * 0.5f
            val midY = h * 0.5f
            val n1 = params["n1"] ?: 1.0
            val n2 = params["n2"] ?: 1.52
            val alphaDeg = params["incidentAngle"] ?: 38.0
            val disp = (params["dispersion"] ?: 0.0) >= 0.5

            // Medium 1 (top) and Medium 2 (bottom)
            val alpha1 = ((n1 - 1.0) * 65).toInt().coerceIn(0, 110)
            val alpha2 = ((n2 - 1.0) * 65).toInt().coerceIn(0, 130)
            fillPaint.color = Color.argb(alpha1, 56, 189, 248)
            canvas.drawRect(0f, 0f, w, midY, fillPaint)
            fillPaint.color = Color.argb(alpha2, 56, 189, 248)
            canvas.drawRect(0f, midY, w, h, fillPaint)

            // Interface & normal
            strokePaint.color = 0xFF94A3B8.toInt()
            strokePaint.strokeWidth = 3f * d
            canvas.drawLine(0f, midY, w, midY, strokePaint)
            dashPaint.color = 0x8894A3B8.toInt()
            canvas.drawLine(midX, 14f * d, midX, h - 14f * d, dashPaint)

            val rayLen = min(w, h) * 0.42f
            val aRad = Math.toRadians(alphaDeg)
            val startX = midX - sin(aRad).toFloat() * rayLen
            val startY = midY - cos(aRad).toFloat() * rayLen
            handlePoint1.set(startX, startY)

            // Incident beam
            strokePaint.color = if (disp) 0xFFFFFFFF.toInt() else 0xFFFACC15.toInt()
            strokePaint.strokeWidth = 4f * d
            canvas.drawLine(startX, startY, midX, midY, strokePaint)
            fillPaint.color = 0xFFFACC15.toInt()
            canvas.drawCircle(startX, startY, 6f * d, fillPaint)

            // Reflected beam
            val refX = midX + sin(aRad).toFloat() * rayLen
            val refY = midY - cos(aRad).toFloat() * rayLen
            strokePaint.color = 0x88FACC15.toInt()
            strokePaint.strokeWidth = 2.5f * d
            canvas.drawLine(midX, midY, refX, refY, strokePaint)

            if (disp) {
                val colors = intArrayOf(0xFFEF4444.toInt(), 0xFFF97316.toInt(), 0xFFFACC15.toInt(), 0xFF22C55E.toInt(), 0xFF38BDF8.toInt(), 0xFFA855F7.toInt())
                for (i in colors.indices) {
                    val nEff = n2 + (i - 2.5) * 0.035
                    val sinB = (n1 / nEff) * sin(aRad)
                    if (sinB <= 1.0) {
                        val bRad = asin(sinB)
                        val ex = midX + sin(bRad).toFloat() * rayLen
                        val ey = midY + cos(bRad).toFloat() * rayLen
                        strokePaint.color = colors[i]
                        strokePaint.strokeWidth = 3f * d
                        canvas.drawLine(midX, midY, ex, ey, strokePaint)
                    }
                }
            } else {
                val sinB = (n1 / n2) * sin(aRad)
                if (sinB <= 1.0) {
                    val bRad = asin(sinB)
                    val ex = midX + sin(bRad).toFloat() * rayLen
                    val ey = midY + cos(bRad).toFloat() * rayLen
                    strokePaint.color = 0xFF38BDF8.toInt()
                    strokePaint.strokeWidth = 4f * d
                    canvas.drawLine(midX, midY, ex, ey, strokePaint)
                } else {
                    // Total Internal Reflection: bright reflected beam!
                    strokePaint.color = 0xFFEF4444.toInt()
                    strokePaint.strokeWidth = 4.5f * d
                    canvas.drawLine(midX, midY, refX, refY, strokePaint)
                    textPaint.color = 0xFFEF4444.toInt()
                    textPaint.textSize = 12f * d
                    canvas.drawText("ПОЛНОЕ ОТРАЖЕНИЕ!", midX + 12f * d, midY + 26f * d, textPaint)
                }
            }

            textPaint.color = 0xFFE2E8F0.toInt()
            textPaint.textSize = 11f * d
            canvas.drawText("n₁ = ${PhysicsEngine.fmt(n1, 2)}", 12f * d, 24f * d, textPaint)
            canvas.drawText("n₂ = ${PhysicsEngine.fmt(n2, 2)}", 12f * d, midY + 22f * d, textPaint)
        }
    }

    private fun drawWaves(canvas: Canvas, w: Float, h: Float, eng: PhysicsEngine) {
        val d = resources.displayMetrics.density
        val mode = (params["waveMode"] ?: 0.0).toInt()
        val f = params["frequency"] ?: 2.5
        val v = params["waveSpeed"] ?: 10.0
        val amp = params["amplitude"] ?: 5.0
        val lambda = v / max(0.1, f)
        val k = 2.0 * PI / lambda

        if (mode == 0) {
            val midY = h * 0.5f
            val pad = 20f * d
            val strW = w - 2f * pad
            val ampPx = (amp / 10.0).toFloat() * (h * 0.34f)
            val L = 10.0 // meters

            // Equilibrium line
            dashPaint.color = 0x4494A3B8
            canvas.drawLine(pad, midY, w - pad, midY, dashPaint)

            // Standing wave envelope
            dashPaint.color = 0x552DD4BF
            pathBuf.reset()
            val samples = 120
            for (i in 0..samples) {
                val frac = i.toFloat() / samples
                val x = frac * L
                val sx = pad + frac * strW
                val env = abs(sin(k * x)).toFloat() * ampPx
                if (i == 0) pathBuf.moveTo(sx, midY - env) else pathBuf.lineTo(sx, midY - env)
            }
            canvas.drawPath(pathBuf, dashPaint)

            // Active vibrating string
            strokePaint.color = 0xFF2DD4BF.toInt()
            strokePaint.strokeWidth = 4f * d
            pathBuf.reset()
            for (i in 0..samples) {
                val frac = i.toFloat() / samples
                val x = frac * L
                val sx = pad + frac * strW
                val y = sin(k * x) * cos(eng.wavePhase) * ampPx
                if (i == 0) pathBuf.moveTo(sx, midY - y.toFloat()) else pathBuf.lineTo(sx, midY - y.toFloat())
            }
            canvas.drawPath(pathBuf, strokePaint)

            // Endpoints & Nodes
            fillPaint.color = 0xFFF59E0B.toInt()
            var nIdx = 0
            while (nIdx * (lambda / 2.0) <= L + 0.01) {
                val frac = ((nIdx * (lambda / 2.0)) / L).toFloat().coerceIn(0f, 1f)
                canvas.drawCircle(pad + frac * strW, midY, 5f * d, fillPaint)
                nIdx++
            }
        } else {
            // 2-source interference ripples + intensity screen on right
            val slitD = params["slitDist"] ?: 2.4
            val phaseRad = Math.toRadians(params["phaseShift"] ?: 0.0)
            val srcX = w * 0.16f
            val midY = h * 0.5f
            val pxPerMeter = h / 10.0f
            val s1Y = midY - (slitD * 0.5 * pxPerMeter).toFloat()
            val s2Y = midY + (slitD * 0.5 * pxPerMeter).toFloat()

            // Concentric wavefront rings from both sources
            val maxR = w * 0.72f
            val stepPx = (lambda * pxPerMeter).toFloat().coerceAtLeast(10f * d)
            val offset = ((eng.wavePhase / (2.0 * PI)) % 1.0).toFloat() * stepPx

            strokePaint.strokeWidth = 2f * d
            var r = offset
            while (r < maxR) {
                val fade = (1f - r / maxR).coerceIn(0.1f, 0.9f)
                strokePaint.color = Color.argb((fade * 140).toInt(), 56, 189, 248)
                canvas.drawCircle(srcX, s1Y, r, strokePaint)
                strokePaint.color = Color.argb((fade * 140).toInt(), 45, 212, 191)
                canvas.drawCircle(srcX, s2Y, r, strokePaint)
                r += stepPx
            }

            // Intensity screen at x = w * 0.85
            val scrX = w * 0.84f
            val scrDistM = (scrX - srcX) / pxPerMeter
            strokePaint.color = 0xFF64748B.toInt()
            strokePaint.strokeWidth = 3f * d
            canvas.drawLine(scrX, 12f * d, scrX, h - 12f * d, strokePaint)

            // Intensity graph along screen
            strokePaint.color = 0xFFFACC15.toInt()
            strokePaint.strokeWidth = 3f * d
            pathBuf.reset()
            val rows = 90
            for (i in 0..rows) {
                val py = 12f * d + (h - 24f * d) * i / rows
                val yM = (py - midY) / pxPerMeter
                val r1M = hypot(scrDistM.toDouble(), (yM + slitD * 0.5))
                val r2M = hypot(scrDistM.toDouble(), (yM - slitD * 0.5))
                val dPhi = k * (r2M - r1M) + phaseRad
                val intensity = cos(dPhi * 0.5).pow(2)
                val gx = scrX + (intensity * 26f * d).toFloat()
                if (i == 0) pathBuf.moveTo(gx, py) else pathBuf.lineTo(gx, py)

                // Draw bright fringe tick on screen
                fillPaint.color = Color.argb((intensity * 230).toInt(), 250, 204, 21)
                canvas.drawRect(scrX - 4f * d, py - 2f * d, scrX + 4f * d, py + 2f * d, fillPaint)
            }
            canvas.drawPath(pathBuf, strokePaint)

            fillPaint.color = 0xFFF59E0B.toInt()
            canvas.drawCircle(srcX, s1Y, 6f * d, fillPaint)
            canvas.drawCircle(srcX, s2Y, 6f * d, fillPaint)
        }
    }

    private fun drawOrbits(canvas: Canvas, w: Float, h: Float, eng: PhysicsEngine) {
        val d = resources.displayMetrics.density
        val cx = w * 0.5f
        val cy = h * 0.5f
        val maxSpan = max(3.2, eng.orbitRMax * 1.25)
        val scale = (min(w, h) * 0.44f) / maxSpan.toFloat()

        fun sx(au: Double) = cx + (au * scale).toFloat()
        fun sy(au: Double) = cy - (au * scale).toFloat()

        // Kepler swept area sectors
        if ((params["showSweptArea"] ?: 1.0) >= 0.5) {
            eng.keplerSectors.forEachIndexed { idx, pts ->
                pathBuf.reset()
                pathBuf.moveTo(cx, cy)
                for (pt in pts) pathBuf.lineTo(sx(pt.x), sy(pt.y))
                pathBuf.close()
                fillPaint.color = if (idx % 2 == 0) 0x266366F1 else 0x2638BDF8
                canvas.drawPath(pathBuf, fillPaint)
            }
        }

        // Orbit trail
        if (eng.orbitTrail.size > 1) {
            strokePaint.color = 0xFF6366F1.toInt()
            strokePaint.strokeWidth = 2.8f * d
            pathBuf.reset()
            eng.orbitTrail.forEachIndexed { idx, pt ->
                if (idx == 0) pathBuf.moveTo(sx(pt.x), sy(pt.y)) else pathBuf.lineTo(sx(pt.x), sy(pt.y))
            }
            canvas.drawPath(pathBuf, strokePaint)
        }

        // Star
        val mStar = (params["starMass"] ?: 1.0).toFloat()
        val starR = (12f + 4f * mStar) * d
        fillPaint.color = 0x44FACC15
        canvas.drawCircle(cx, cy, starR + 10f * d, fillPaint)
        fillPaint.color = 0xFFFACC15.toInt()
        canvas.drawCircle(cx, cy, starR, fillPaint)

        // Planet
        val px = sx(eng.orbitPos.x)
        val py = sy(eng.orbitPos.y)
        fillPaint.color = 0xFF38BDF8.toInt()
        canvas.drawCircle(px, py, 7.5f * d, fillPaint)

        // Velocity vector handle
        val vxPx = px + (eng.orbitVel.x * 7.5f * d).toFloat()
        val vyPx = py - (eng.orbitVel.y * 7.5f * d).toFloat()
        handlePoint1.set(vxPx, vyPx)

        if (showVectors) {
            drawArrow(canvas, px, py, vxPx, vyPx, 0xFF38BDF8.toInt(), "v")
            val r = max(0.1, hypot(eng.orbitPos.x, eng.orbitPos.y))
            val fx = (-eng.orbitPos.x / r) * 32.0 * d
            val fy = (eng.orbitPos.y / r) * 32.0 * d
            drawArrow(canvas, px, py, px + fx.toFloat(), py + fy.toFloat(), 0xFFF97316.toInt(), "F_g", 3.5f)
        }
    }

    private fun drawBuoyancy(canvas: Canvas, w: Float, h: Float, eng: PhysicsEngine) {
        val d = resources.displayMetrics.density
        val tankL = w * 0.24f
        val tankR = w * 0.76f
        val tankTop = 26f * d
        val tankBot = h - 22f * d
        val tankH = tankBot - tankTop

        val liqType = (params["liquidType"] ?: 0.0).toInt()
        val liqColor = when (liqType) {
            0 -> 0x6638BDF8.toInt() // water
            1 -> 0x66FACC15.toInt() // oil
            2 -> 0x662DD4BF.toInt() // glycerin
            else -> 0x9994A3B8.toInt() // mercury
        }
        val baseWaterY = tankTop + tankH * 0.45f
        val risePx = (eng.buoySubmergedFrac * 14f * d).toFloat()
        val waterY = baseWaterY - risePx

        // Liquid fill
        fillPaint.color = liqColor
        canvas.drawRect(tankL, waterY, tankR, tankBot, fillPaint)
        strokePaint.color = 0xFF38BDF8.toInt()
        strokePaint.strokeWidth = 2.5f * d
        canvas.drawLine(tankL, waterY, tankR, waterY, strokePaint)

        // Tank walls + ruler ticks
        strokePaint.color = 0xFF94A3B8.toInt()
        strokePaint.strokeWidth = 3.5f * d
        canvas.drawLine(tankL, tankTop, tankL, tankBot, strokePaint)
        canvas.drawLine(tankL, tankBot, tankR, tankBot, strokePaint)
        canvas.drawLine(tankR, tankBot, tankR, tankTop, strokePaint)

        // Body
        val volL = params["bodyVolume"] ?: 2.0
        val sidePx = ((0.14 + 0.045 * cbrt(volL)) * tankH).toFloat()
        val bodyCx = (tankL + tankR) * 0.5f
        val bodyCy = baseWaterY - (eng.buoyY.toFloat() * tankH * 0.5f)
        handlePoint1.set(bodyCx, bodyCy)

        val hold = (params["holdSensor"] ?: 0.0) >= 0.5
        if (hold) {
            strokePaint.color = 0xFFFACC15.toInt()
            strokePaint.strokeWidth = 2.5f * d
            canvas.drawLine(bodyCx, 6f * d, bodyCx, bodyCy - sidePx, strokePaint)
            fillPaint.color = 0xFF1E293B.toInt()
            canvas.drawRoundRect(bodyCx - 28f * d, 4f * d, bodyCx + 28f * d, 24f * d, 6f * d, 6f * d, fillPaint)
        }

        val rhoB = params["bodyDensity"] ?: 750.0
        fillPaint.color = when {
            rhoB < 950 -> 0xFFD97706.toInt() // wood
            rhoB < 3000 -> 0xFF64748B.toInt() // stone/alu
            else -> 0xFF475569.toInt() // iron/heavy
        }
        canvas.drawRoundRect(bodyCx - sidePx, bodyCy - sidePx, bodyCx + sidePx, bodyCy + sidePx, 6f * d, 6f * d, fillPaint)
        strokePaint.color = 0xFFE2E8F0.toInt()
        strokePaint.strokeWidth = 2f * d
        canvas.drawRoundRect(bodyCx - sidePx, bodyCy - sidePx, bodyCx + sidePx, bodyCy + sidePx, 6f * d, 6f * d, strokePaint)

        textPaint.color = 0xFFFFFFFF.toInt()
        textPaint.textSize = 11f * d
        canvas.drawText("${rhoB.toInt()} кг/м³", bodyCx - 26f * d, bodyCy + 4f * d, textPaint)

        if (showVectors) {
            val rhoL = params["liquidDensity"] ?: 1000.0
            val g = params["gravity"] ?: 9.81
            val fG = rhoB * (volL / 1000.0) * g
            val fA = rhoL * (volL / 1000.0) * eng.buoySubmergedFrac * g
            val sc = (1.6f * d) / max(1.0f, (fG / 30.0).toFloat())
            drawArrow(canvas, bodyCx - 12f * d, bodyCy, bodyCx - 12f * d, bodyCy + min(65f * d, (fG * sc).toFloat()), 0xFFEF4444.toInt(), "mg")
            if (fA > 0.1) {
                drawArrow(canvas, bodyCx + 12f * d, bodyCy, bodyCx + 12f * d, bodyCy - min(65f * d, (fA * sc).toFloat()), 0xFF38BDF8.toInt(), "F_A")
            }
        }
    }

    private fun drawInclinedPlane(canvas: Canvas, w: Float, h: Float, eng: PhysicsEngine) {
        val d = resources.displayMetrics.density
        val alphaDeg = params["slopeAngle"] ?: 28.0
        val rad = Math.toRadians(alphaDeg)
        val baseY = h - 26f * d
        val leftX = w * 0.12f
        val maxW = w * 0.76f
        val maxH = h - 56f * d

        // Scale triangle to fit screen cleanly
        val rampLenPx = min(maxW / cos(rad).toFloat(), maxH / sin(rad).toFloat()).coerceAtLeast(80f * d)
        val topX = leftX + cos(rad).toFloat() * rampLenPx
        val topY = baseY - sin(rad).toFloat() * rampLenPx
        handlePoint1.set(topX, topY)

        // Wedge
        pathBuf.reset()
        pathBuf.moveTo(leftX, baseY)
        pathBuf.lineTo(topX, baseY)
        pathBuf.lineTo(topX, topY)
        pathBuf.close()
        fillPaint.color = 0xFF1E293B.toInt()
        canvas.drawPath(pathBuf, fillPaint)
        strokePaint.color = 0xFF475569.toInt()
        strokePaint.strokeWidth = 3f * d
        canvas.drawPath(pathBuf, strokePaint)

        // Block at slopePos (0..10m)
        val frac = (eng.slopePos / 10.0).toFloat().coerceIn(0.04f, 0.94f)
        val bx = leftX + cos(rad).toFloat() * rampLenPx * frac
        val by = baseY - sin(rad).toFloat() * rampLenPx * frac

        val ux = cos(rad).toFloat()
        val uy = -sin(rad).toFloat()
        val nx = -sin(rad).toFloat()
        val ny = -cos(rad).toFloat()
        val bw = 18f * d
        val bh = 13f * d
        val cx = bx + nx * bh
        val cy = by + ny * bh

        canvas.save()
        canvas.rotate(-alphaDeg.toFloat(), cx, cy)
        fillPaint.color = 0xFFF97316.toInt()
        canvas.drawRoundRect(cx - bw, cy - bh, cx + bw, cy + bh, 5f * d, 5f * d, fillPaint)
        canvas.restore()

        textPaint.color = 0xFF94A3B8.toInt()
        textPaint.textSize = 11.5f * d
        canvas.drawText("α = ${alphaDeg.toInt()}°", leftX + 26f * d, baseY - 8f * d, textPaint)

        if (showVectors) {
            drawArrow(canvas, cx, cy, cx, cy + 44f * d, 0xFFEF4444.toInt(), "mg")
            drawArrow(canvas, cx, cy, cx + nx * 36f * d, cy + ny * 36f * d, 0xFF22C55E.toInt(), "N")
            val pull = params["pullForce"] ?: 0.0
            if (pull > 1.0) {
                drawArrow(canvas, cx, cy, cx + ux * 40f * d, cy + uy * 40f * d, 0xFF38BDF8.toInt(), "F_тяги")
            }
            if (abs(eng.slopeVel) > 0.02 || (params["frictionMu"] ?: 0.25) > 0.01) {
                val frDir = if (eng.slopeVel > 0.02) -1f else 1f
                drawArrow(canvas, cx, cy, cx + ux * frDir * 28f * d, cy + uy * frDir * 28f * d, 0xFFFACC15.toInt(), "F_тр")
            }
        }
    }

    private fun drawElectrostatics(canvas: Canvas, w: Float, h: Float, eng: PhysicsEngine) {
        val d = resources.displayMetrics.density
        val mode = (params["fieldMode"] ?: 0.0).toInt()
        val eF = params["eField"] ?: 6.0
        val bF = params["bField"] ?: 0.0

        val padX = w * 0.08f
        val boxW = w - 2f * padX
        val midY = h * 0.5f
        val halfH = h * 0.36f

        fun sx(wx: Double) = padX + (wx / 10.0).toFloat() * boxW
        fun sy(wy: Double) = midY - (wy / 4.2).toFloat() * halfH

        // Plates for modes 0 and 2
        if (mode != 1) {
            strokePaint.color = if (eF >= 0) 0xFFEF4444.toInt() else 0xFF38BDF8.toInt()
            strokePaint.strokeWidth = 5f * d
            canvas.drawLine(padX, midY - halfH, w - padX, midY - halfH, strokePaint)
            strokePaint.color = if (eF >= 0) 0xFF38BDF8.toInt() else 0xFFEF4444.toInt()
            canvas.drawLine(padX, midY + halfH, w - padX, midY + halfH, strokePaint)
        }

        // B-field symbols (dots / crosses) for modes 1 and 2
        if (mode != 0 && abs(bF) > 0.2) {
            smallTextPaint.textSize = 13f * d
            smallTextPaint.color = 0x552DD4BF
            val sym = if (bF > 0) "⊗" else "⊙"
            for (ix in 1..6) {
                for (iy in 1..3) {
                    canvas.drawText(sym, padX + boxW * ix / 7f, (midY - halfH) + (2f * halfH) * iy / 4f, smallTextPaint)
                }
            }
        }

        // Trail
        if (eng.chargeTrail.size > 1) {
            strokePaint.color = 0xFF38BDF8.toInt()
            strokePaint.strokeWidth = 3f * d
            pathBuf.reset()
            eng.chargeTrail.forEachIndexed { idx, pt ->
                if (idx == 0) pathBuf.moveTo(sx(pt.x), sy(pt.y)) else pathBuf.lineTo(sx(pt.x), sy(pt.y))
            }
            canvas.drawPath(pathBuf, strokePaint)
        }

        val q = params["charge"] ?: 1.0
        val px = sx(eng.chargePos.x)
        val py = sy(eng.chargePos.y)
        fillPaint.color = if (q > 0) 0xFFEF4444.toInt() else if (q < 0) 0xFF38BDF8.toInt() else 0xFF94A3B8.toInt()
        canvas.drawCircle(px, py, 8.5f * d, fillPaint)
        textPaint.color = 0xFFFFFFFF.toInt()
        textPaint.textSize = 11f * d
        canvas.drawText(if (q > 0) "+" else if (q < 0) "−" else "0", px - 3.5f * d, py + 4f * d, textPaint)

        if (showVectors) {
            drawArrow(canvas, px, py, px + (eng.chargeVel.x * 2.5f * d).toFloat(), py - (eng.chargeVel.y * 2.5f * d).toFloat(), 0xFFFACC15.toInt(), "v")
        }
    }

    private fun drawElectromagnetic(canvas: Canvas, w: Float, h: Float, eng: PhysicsEngine) {
        val d = resources.displayMetrics.density
        val cx = w * 0.52f
        val cy = h * 0.58f

        // Galvanometer dial at top
        val dialCx = w * 0.5f
        val dialCy = 44f * d
        val dialR = 28f * d
        fillPaint.color = 0xFF1E293B.toInt()
        canvas.drawCircle(dialCx, dialCy, dialR, fillPaint)
        strokePaint.color = 0xFF64748B.toInt()
        strokePaint.strokeWidth = 2.5f * d
        canvas.drawCircle(dialCx, dialCy, dialR, strokePaint)

        val needleAng = (eng.inducedEmf * 0.08).coerceIn(-1.2, 1.2)
        strokePaint.color = 0xFFFACC15.toInt()
        strokePaint.strokeWidth = 3f * d
        canvas.drawLine(dialCx, dialCy + 8f * d, dialCx + sin(needleAng).toFloat() * (dialR - 5f * d), dialCy - cos(needleAng).toFloat() * (dialR - 5f * d), strokePaint)
        smallTextPaint.textSize = 10f * d
        smallTextPaint.color = 0xFFFACC15.toInt()
        canvas.drawText("ε = ${PhysicsEngine.fmt(eng.inducedEmf, 1)} В", dialCx + dialR + 10f * d, dialCy + 4f * d, smallTextPaint)

        // Coil windings
        val coilW = 90f * d
        val coilH = 74f * d
        val glowAlpha = (abs(eng.inducedCurrent) * 280).toInt().coerceIn(0, 180)
        val glowCol = if (eng.inducedCurrent >= 0) Color.argb(glowAlpha, 56, 189, 248) else Color.argb(glowAlpha, 249, 115, 22)
        fillPaint.color = glowCol
        canvas.drawRoundRect(cx - coilW * 0.5f, cy - coilH * 0.5f, cx + coilW * 0.5f, cy + coilH * 0.5f, 10f * d, 10f * d, fillPaint)

        strokePaint.color = 0xFFD97706.toInt()
        strokePaint.strokeWidth = 4f * d
        val loops = 7
        for (i in 0 until loops) {
            val lx = cx - coilW * 0.42f + (coilW * 0.84f) * i / (loops - 1)
            canvas.drawOval(lx - 8f * d, cy - coilH * 0.5f, lx + 8f * d, cy + coilH * 0.5f, strokePaint)
        }

        // Movable Bar Magnet
        val magX = cx + eng.magPosX.toFloat() * (w * 0.34f)
        val magW = 48f * d
        val magH = 16f * d
        handlePoint1.set(magX, cy)
        val polNRight = (params["polarity"] ?: 0.0) < 0.5
        fillPaint.color = if (polNRight) 0xFF3B82F6.toInt() else 0xFFEF4444.toInt()
        canvas.drawRect(magX - magW, cy - magH, magX, cy + magH, fillPaint)
        fillPaint.color = if (polNRight) 0xFFEF4444.toInt() else 0xFF3B82F6.toInt()
        canvas.drawRect(magX, cy - magH, magX + magW, cy + magH, fillPaint)

        textPaint.color = 0xFFFFFFFF.toInt()
        textPaint.textSize = 12f * d
        canvas.drawText(if (polNRight) "S" else "N", magX - magW * 0.6f, cy + 4f * d, textPaint)
        canvas.drawText(if (polNRight) "N" else "S", magX + magW * 0.4f, cy + 4f * d, textPaint)
    }

    private fun drawPhotoelectric(canvas: Canvas, w: Float, h: Float, eng: PhysicsEngine) {
        val d = resources.displayMetrics.density
        val catX = w * 0.16f
        val anoX = w * 0.84f
        val tubeT = h * 0.20f
        val tubeB = h * 0.80f
        val midY = (tubeT + tubeB) * 0.5f

        // Glass vacuum tube
        fillPaint.color = 0xFF0A0F18.toInt()
        canvas.drawRoundRect(catX - 18f * d, tubeT, anoX + 18f * d, tubeB, 28f * d, 28f * d, fillPaint)
        strokePaint.color = 0xFF475569.toInt()
        strokePaint.strokeWidth = 3f * d
        canvas.drawRoundRect(catX - 18f * d, tubeT, anoX + 18f * d, tubeB, 28f * d, 28f * d, strokePaint)

        // Cathode & Anode plates
        strokePaint.color = 0xFF94A3B8.toInt()
        strokePaint.strokeWidth = 7f * d
        canvas.drawLine(catX, tubeT + 18f * d, catX, tubeB - 18f * d, strokePaint)
        strokePaint.color = 0xFFF59E0B.toInt()
        canvas.drawLine(anoX, tubeT + 18f * d, anoX, tubeB - 18f * d, strokePaint)

        // Light beam colored by wavelength
        val lambdaNm = params["wavelengthNm"] ?: 400.0
        val beamCol = wavelengthToColor(lambdaNm)
        strokePaint.color = beamCol
        strokePaint.strokeWidth = 4f * d
        for (k in -1..1) {
            val sy = midY + k * 24f * d
            canvas.drawLine(catX + 60f * d, sy - 42f * d, catX + 4f * d, sy, strokePaint)
        }

        // Photoelectrons
        fillPaint.color = 0xFF38BDF8.toInt()
        for (e in eng.photoElectrons) {
            val ex = catX + (e.x.toFloat()) * (anoX - catX)
            val ey = tubeT + 18f * d + (e.y.toFloat()) * (tubeB - tubeT - 36f * d)
            canvas.drawCircle(ex, ey, 4f * d, fillPaint)
        }

        textPaint.color = 0xFFE2E8F0.toInt()
        textPaint.textSize = 11.5f * d
        canvas.drawText("Катод", catX - 14f * d, tubeB + 16f * d, textPaint)
        canvas.drawText("Анод (${PhysicsEngine.fmt(params["voltage"] ?: 1.0, 1)} В)", anoX - 38f * d, tubeB + 16f * d, textPaint)
        textPaint.color = 0xFF38BDF8.toInt()
        canvas.drawText("I = ${PhysicsEngine.fmt(eng.photoCurrentMa, 2)} мА", w * 0.42f, 22f * d, textPaint)
    }

    private fun wavelengthToColor(nm: Double): Int = when {
        nm < 380 -> 0xFFA855F7.toInt() // UV
        nm < 450 -> 0xFF6366F1.toInt() // Violet/Blue
        nm < 495 -> 0xFF38BDF8.toInt() // Cyan
        nm < 570 -> 0xFF22C55E.toInt() // Green
        nm < 590 -> 0xFFFACC15.toInt() // Yellow
        nm < 620 -> 0xFFF97316.toInt() // Orange
        else -> 0xFFEF4444.toInt()     // Red
    }

    private fun drawRadioactive(canvas: Canvas, w: Float, h: Float, eng: PhysicsEngine) {
        val d = resources.displayMetrics.density
        val total = eng.decayAtoms.size.coerceAtLeast(1)
        val cols = ceil(sqrt(total * 1.4)).toInt().coerceAtLeast(8)
        val rows = ceil(total.toDouble() / cols).toInt().coerceAtLeast(4)

        val padX = 24f * d
        val padT = 32f * d
        val padB = 26f * d
        val cellW = (w - 2f * padX) / cols
        val cellH = (h - padT - padB) / rows
        val r = min(cellW, cellH) * 0.36f

        eng.decayAtoms.forEachIndexed { idx, atom ->
            val col = idx % cols
            val row = idx / cols
            val cx = padX + (col + 0.5f) * cellW
            val cy = padT + (row + 0.5f) * cellH

            if (!atom.decayed) {
                fillPaint.color = 0xFF22C55E.toInt()
                canvas.drawCircle(cx, cy, r, fillPaint)
            } else {
                if (atom.flash > 0.05) {
                    fillPaint.color = Color.argb((atom.flash * 220).toInt(), 250, 204, 21)
                    canvas.drawCircle(cx, cy, r * (1.8f - 0.5f * atom.flash.toFloat()), fillPaint)
                }
                fillPaint.color = 0x55A855F7
                canvas.drawCircle(cx, cy, r * 0.85f, fillPaint)
            }
        }

        textPaint.color = 0xFF22C55E.toInt()
        textPaint.textSize = 11.5f * d
        canvas.drawText("Активных: ${eng.aliveNuclei}", padX, 20f * d, textPaint)
        textPaint.color = 0xFFA855F7.toInt()
        canvas.drawText("Распалось: ${eng.decayedNuclei}", w * 0.52f, 20f * d, textPaint)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        val eng = engine ?: return false
        val x = event.x
        val y = event.y
        val d = resources.displayMetrics.density
        val hitR = 38f * d

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                dragMode = null

                when (eng.topic) {
                    ExperimentTopic.BALLISTICS -> {
                        dragMode = "ballistics_aim"
                        dragStartVal = params["angle"] ?: 45.0
                        dragStartVal2 = params["v0"] ?: 24.0
                        return true
                    }
                    ExperimentTopic.PENDULUM -> {
                        if (hypot(x - handlePoint1.x, y - handlePoint1.y) < hitR * 1.6f) {
                            dragMode = "pendulum_bob"
                            dragStartVal = params["angle0"] ?: 35.0
                            return true
                        }
                    }
                    ExperimentTopic.COLLISIONS -> {
                        val d1 = hypot(x - handlePoint1.x, y - handlePoint1.y)
                        val d2 = hypot(x - handlePoint2.x, y - handlePoint2.y)
                        if (d1 < hitR * 1.4f || d2 < hitR * 1.4f) {
                            dragMode = if (d1 <= d2) "col_b1" else "col_b2"
                            return true
                        }
                    }
                    ExperimentTopic.BUOYANCY -> {
                        dragMode = "buoy_drag"
                        return true
                    }
                    ExperimentTopic.INCLINED_PLANE -> {
                        dragMode = "slope_angle"
                        dragStartVal = params["slopeAngle"] ?: 28.0
                        return true
                    }
                    ExperimentTopic.ELECTROMAGNETIC -> {
                        dragMode = "em_magnet"
                        return true
                    }
                    ExperimentTopic.CIRCUITS -> {
                        if (hypot(x - handlePoint1.x, y - handlePoint1.y) < hitR * 1.5f) {
                            val old = params["switchClosed"] ?: 1.0
                            val next = if (old >= 0.5) 0.0 else 1.0
                            onDirectDragParam?.invoke("switchClosed", old, next, true)
                            return true
                        }
                    }
                    ExperimentTopic.IDEAL_GAS -> {
                        dragMode = "gas_piston"
                        dragStartVal = params["volume"] ?: 5.0
                        return true
                    }
                    ExperimentTopic.OPTICS -> {
                        dragMode = if ((params["optMode"] ?: 0.0) < 0.5) "optics_obj" else "optics_angle"
                        dragStartVal = if (dragMode == "optics_obj") (params["objDist"] ?: 32.0) else (params["incidentAngle"] ?: 38.0)
                        return true
                    }
                    ExperimentTopic.ORBITS -> {
                        dragMode = "orbit_vel"
                        dragStartVal = params["tangVel"] ?: 27.2
                        return true
                    }
                    else -> Unit
                }
                return true
            }

            MotionEvent.ACTION_MOVE -> {
                val w = width.toFloat().coerceAtLeast(1f)
                val h = height.toFloat().coerceAtLeast(1f)
                when (dragMode) {
                    "ballistics_aim" -> {
                        val padL = 36f * d
                        val groundY = h - 34f * d
                        val dx = max(10f, x - padL)
                        val dy = max(5f, groundY - y)
                        val ang = Math.toDegrees(atan2(dy.toDouble(), dx.toDouble())).coerceIn(5.0, 88.0)
                        val v0 = (hypot(dx, dy) / (4.2f * d)).toDouble().coerceIn(4.0, 58.0)
                        onDirectDragParam?.invoke("angle", dragStartVal, ang, false)
                        onDirectDragParam?.invoke("v0", dragStartVal2, v0, false)
                    }
                    "pendulum_bob" -> {
                        val mode = (params["mode"] ?: 0.0).toInt()
                        if (mode == 0) {
                            val angRad = atan2((x - w * 0.5f).toDouble(), max(20f, y - 26f * d).toDouble()).coerceIn(-1.4, 1.4)
                            eng.pendAngle = angRad
                            eng.pendOmega = 0.0
                            val deg = abs(Math.toDegrees(angRad)).coerceIn(4.0, 80.0)
                            onDirectDragParam?.invoke("angle0", dragStartVal, deg, false)
                        } else {
                            val restY = 26f * d + h * 0.48f
                            val dispM = ((y - restY) / (60.0 * d)).coerceIn(-2.0, 2.0)
                            eng.springPos = dispM
                            eng.springVel = 0.0
                            onDirectDragParam?.invoke("angle0", dragStartVal, abs(dispM / 0.025).coerceIn(4.0, 80.0), false)
                        }
                        invalidate()
                    }
                    "col_b1", "col_b2" -> {
                        val pad = 20f * d
                        val normX = ((x - pad) / (w - 2f * pad)).coerceIn(0.05f, 0.95f)
                        val worldX = -10.5 + normX * 21.0
                        if (dragMode == "col_b1") eng.colX1 = min(worldX, eng.colX2 - 1.3)
                        else eng.colX2 = max(worldX, eng.colX1 + 1.3)
                        invalidate()
                    }
                    "gas_piston" -> {
                        val cylBot = h - 22f * d
                        val cylTopLimit = 26f * d
                        val maxCylH = (cylBot - cylTopLimit).coerceAtLeast(40f)
                        val vol = (((cylBot - y) / maxCylH) * 10.0).toDouble().coerceIn(1.5, 10.0)
                        onDirectDragParam?.invoke("volume", dragStartVal, vol, false)
                    }
                    "optics_obj" -> {
                        val pxPerCm = (w * 0.44f) / 72f
                        val dist = ((w * 0.5f - x) / pxPerCm).toDouble().coerceIn(6.0, 70.0)
                        onDirectDragParam?.invoke("objDist", dragStartVal, dist, false)
                    }
                    "optics_angle" -> {
                        val midX = w * 0.5f
                        val midY = h * 0.5f
                        val deg = Math.toDegrees(atan2(max(5f, midX - x).toDouble(), max(5f, midY - y).toDouble())).coerceIn(0.0, 85.0)
                        onDirectDragParam?.invoke("incidentAngle", dragStartVal, deg, false)
                    }
                    "orbit_vel" -> {
                        val spd = (hypot(x - w * 0.5f, y - h * 0.5f) / (3.2f * d)).toDouble().coerceIn(8.0, 62.0)
                        onDirectDragParam?.invoke("tangVel", dragStartVal, spd, false)
                    }
                    "buoy_drag" -> {
                        val tankTop = 26f * d
                        val tankBot = h - 22f * d
                        val baseWaterY = tankTop + (tankBot - tankTop) * 0.45f
                        val newY = ((baseWaterY - y) / ((tankBot - tankTop) * 0.5f)).toDouble().coerceIn(-0.82, 0.72)
                        eng.buoyY = newY
                        eng.buoyVy = 0.0
                        invalidate()
                    }
                    "slope_angle" -> {
                        val baseY = h - 26f * d
                        val leftX = w * 0.12f
                        val deg = Math.toDegrees(atan2(max(10f, baseY - y).toDouble(), max(15f, x - leftX).toDouble())).coerceIn(5.0, 65.0)
                        onDirectDragParam?.invoke("slopeAngle", dragStartVal, deg, false)
                    }
                    "em_magnet" -> {
                        if ((params["autoOscillate"] ?: 1.0) >= 0.5) {
                            onDirectDragParam?.invoke("autoOscillate", 1.0, 0.0, true)
                        }
                        val normX = ((x - w * 0.52f) / (w * 0.34f)).toDouble().coerceIn(-0.92, 0.92)
                        eng.manualMagTargetX = normX
                    }
                }
                return true
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                parent?.requestDisallowInterceptTouchEvent(false)
                when (dragMode) {
                    "ballistics_aim" -> {
                        onDirectDragParam?.invoke("angle", dragStartVal, params["angle"] ?: dragStartVal, true)
                        onDirectDragParam?.invoke("v0", dragStartVal2, params["v0"] ?: dragStartVal2, true)
                    }
                    "pendulum_bob" -> onDirectDragParam?.invoke("angle0", dragStartVal, params["angle0"] ?: dragStartVal, true)
                    "gas_piston" -> onDirectDragParam?.invoke("volume", dragStartVal, params["volume"] ?: dragStartVal, true)
                    "optics_obj" -> onDirectDragParam?.invoke("objDist", dragStartVal, params["objDist"] ?: dragStartVal, true)
                    "optics_angle" -> onDirectDragParam?.invoke("incidentAngle", dragStartVal, params["incidentAngle"] ?: dragStartVal, true)
                    "orbit_vel" -> onDirectDragParam?.invoke("tangVel", dragStartVal, params["tangVel"] ?: dragStartVal, true)
                    "slope_angle" -> onDirectDragParam?.invoke("slopeAngle", dragStartVal, params["slopeAngle"] ?: dragStartVal, true)
                }
                dragMode = null
                return true
            }
        }
        return super.onTouchEvent(event)
    }
}
