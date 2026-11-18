package com.xloneroom.physlab.ui

import android.content.Context
import android.graphics.*
import android.view.View
import com.xloneroom.physlab.engine.PhysicsEngine
import com.xloneroom.physlab.model.GraphChannel
import kotlin.math.max
import kotlin.math.min

class OscilloscopeView(context: Context) : View(context) {

    var history: List<Pair<Double, DoubleArray>> = emptyList()
    var channels: List<GraphChannel> = emptyList()
    var pvHistory: List<Pair<Double, Double>> = emptyList()
    var pvMode: Boolean = false

    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF0B101B.toInt() }
    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x2294A3B8
        strokeWidth = 1.5f
    }
    private val tracePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFE2E8F0.toInt()
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    private val pathBuf = Path()

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return
        val d = resources.displayMetrics.density

        canvas.drawRoundRect(0f, 0f, w, h, 14f * d, 14f * d, bgPaint)

        // Subtle grid
        for (i in 1..3) {
            val y = h * i / 4f
            canvas.drawLine(0f, y, w, y, gridPaint)
        }
        for (i in 1..4) {
            val x = w * i / 5f
            canvas.drawLine(x, 0f, x, h, gridPaint)
        }

        val padL = 12f * d
        val padR = 12f * d
        val padT = 28f * d
        val padB = 16f * d
        val plotW = (w - padL - padR).coerceAtLeast(10f)
        val plotH = (h - padT - padB).coerceAtLeast(10f)

        if (pvMode && pvHistory.size >= 1) {
            // P-V Indicator diagram
            textPaint.color = 0xFFF97316.toInt()
            textPaint.textSize = 11f * d
            canvas.drawText("Диаграмма P(V) — кПа от литров", padL, 18f * d, textPaint)

            tracePaint.color = 0xFFF97316.toInt()
            tracePaint.strokeWidth = 3f * d
            pathBuf.reset()
            var lastSx = padL
            var lastSy = padT + plotH * 0.5f
            pvHistory.forEachIndexed { idx, (v, p) ->
                val sx = padL + ((v - 1.0) / 9.5).toFloat().coerceIn(0f, 1f) * plotW
                val sy = padT + plotH - ((p / 450.0).toFloat().coerceIn(0f, 1f)) * plotH
                if (idx == 0) pathBuf.moveTo(sx, sy) else pathBuf.lineTo(sx, sy)
                lastSx = sx
                lastSy = sy
            }
            canvas.drawPath(pathBuf, tracePaint)
            dotPaint.color = 0xFFFACC15.toInt()
            canvas.drawCircle(lastSx, lastSy, 5f * d, dotPaint)
            return
        }

        // Draw legend row across top
        var lx = padL
        textPaint.textSize = 10.5f * d
        channels.forEach { ch ->
            textPaint.color = ch.color.toInt()
            val lbl = "${ch.name}: ${PhysicsEngine.fmt(ch.currentValue, 1)}"
            canvas.drawText(lbl, lx, 18f * d, textPaint)
            lx += textPaint.measureText(lbl) + 12f * d
        }

        if (history.size < 2 || channels.isEmpty()) return

        // Plot each channel auto-scaled independently so all physical trends are clearly visible
        for (cIdx in channels.indices) {
            var minV = Double.POSITIVE_INFINITY
            var maxV = Double.NEGATIVE_INFINITY
            for (sample in history) {
                val arr = sample.second
                if (cIdx < arr.size && arr[cIdx].isFinite()) {
                    minV = min(minV, arr[cIdx])
                    maxV = max(maxV, arr[cIdx])
                }
            }
            if (!minV.isFinite() || !maxV.isFinite()) continue
            val span = max(0.5, maxV - minV)

            tracePaint.color = channels[cIdx].color.toInt()
            tracePaint.strokeWidth = 2.5f * d
            pathBuf.reset()
            var started = false
            history.forEachIndexed { i, sample ->
                val arr = sample.second
                if (cIdx >= arr.size || !arr[cIdx].isFinite()) return@forEachIndexed
                val sx = padL + (i.toFloat() / (history.size - 1)) * plotW
                val normY = ((arr[cIdx] - minV) / span).toFloat().coerceIn(0f, 1f)
                val sy = padT + plotH - normY * plotH
                if (!started) {
                    pathBuf.moveTo(sx, sy)
                    started = true
                } else {
                    pathBuf.lineTo(sx, sy)
                }
            }
            canvas.drawPath(pathBuf, tracePaint)
        }
    }
}
