package com.xloneroom.physlab.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ClipDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.graphics.Typeface
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.widget.*
import com.xloneroom.physlab.engine.PhysicsEngine
import com.xloneroom.physlab.model.ParamDescriptor
import kotlin.math.roundToInt

object UiTheme {
    const val BG_DARK = 0xFF0C111C.toInt()
    const val BG_SURFACE = 0xFF131A28.toInt()
    const val BG_CARD = 0xFF182133.toInt()
    const val BG_CARD_ALT = 0xFF212C42.toInt()
    const val STROKE = 0xFF26334D.toInt()
    const val ACCENT = 0xFF38BDF8.toInt()
    const val ACCENT_SOFT = 0x2638BDF8
    const val ORANGE = 0xFFF97316.toInt()
    const val GREEN = 0xFF22C55E.toInt()
    const val PURPLE = 0xFFA855F7.toInt()
    const val YELLOW = 0xFFFACC15.toInt()
    const val RED = 0xFFEF4444.toInt()
    const val TEXT_PRIMARY = 0xFFF1F5F9.toInt()
    const val TEXT_MUTED = 0xFF94A3B8.toInt()
}

fun Context.dp(value: Float): Int =
    (value * resources.displayMetrics.density).roundToInt()

fun Context.dp(value: Int): Int = dp(value.toFloat())

fun roundedRect(
    fillColor: Int,
    radiusDp: Float,
    context: Context,
    strokeColor: Int = Color.TRANSPARENT,
    strokeWidthDp: Float = 0f
): GradientDrawable = GradientDrawable().apply {
    shape = GradientDrawable.RECTANGLE
    cornerRadius = context.dp(radiusDp).toFloat()
    setColor(fillColor)
    if (strokeWidthDp > 0f && strokeColor != Color.TRANSPARENT) {
        setStroke(context.dp(strokeWidthDp), strokeColor)
    }
}

fun makePillButton(
    context: Context,
    label: String,
    fillColor: Int = UiTheme.BG_CARD_ALT,
    textColor: Int = UiTheme.TEXT_PRIMARY,
    strokeColor: Int = UiTheme.STROKE,
    textSizeSp: Float = 12.5f,
    padH: Float = 12f,
    padV: Float = 7f,
    onClick: () -> Unit
): TextView = TextView(context).apply {
    text = label
    textSize = textSizeSp
    setTextColor(textColor)
    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    gravity = Gravity.CENTER
    background = roundedRect(fillColor, 18f, context, strokeColor, 1f)
    setPadding(context.dp(padH), context.dp(padV), context.dp(padH), context.dp(padV))
    isClickable = true
    isFocusable = true
    setOnClickListener {
        performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
        onClick()
    }
}

fun makeSeekBarDrawables(context: Context, accentColor: Int): Pair<LayerDrawable, GradientDrawable> {
    val bgTrack = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = context.dp(3f).toFloat()
        setColor(0xFF2B364C.toInt())
    }
    val progressFill = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = context.dp(3f).toFloat()
        setColor(accentColor)
    }
    val clipProgress = ClipDrawable(progressFill, Gravity.START, ClipDrawable.HORIZONTAL)
    val layer = LayerDrawable(arrayOf(bgTrack, clipProgress)).apply {
        setId(0, android.R.id.background)
        setId(1, android.R.id.progress)
    }
    val thumb = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setSize(context.dp(22), context.dp(22))
        setColor(0xFFFFFFFF.toInt())
        setStroke(context.dp(3), accentColor)
    }
    return layer to thumb
}

data class ParamControlHandle(
    val rootView: View,
    val syncValue: (Double) -> Unit
)

@SuppressLint("ClickableViewAccessibility")
fun buildSliderControl(
    context: Context,
    desc: ParamDescriptor,
    initialValue: Double,
    accentColor: Int = UiTheme.ACCENT,
    onLiveChange: (Double) -> Unit,
    onCommitChange: (oldVal: Double, newVal: Double) -> Unit
): ParamControlHandle {
    var currentVal = initialValue.coerceIn(desc.min, desc.max)
    var dragStartVal = currentVal
    var isSyncing = false

    val card = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        background = roundedRect(UiTheme.BG_CARD, 16f, context)
        setPadding(context.dp(12), context.dp(9), context.dp(12), context.dp(5))
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = context.dp(7) }
    }

    val topRow = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
    }

    val lblView = TextView(context).apply {
        text = desc.label
        textSize = 13.5f
        setTextColor(UiTheme.TEXT_PRIMARY)
        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    }

    val valueView = TextView(context).apply {
        text = formatParam(desc, currentVal)
        textSize = 13.5f
        setTextColor(accentColor)
        typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
        setPadding(context.dp(8), context.dp(2), context.dp(8), context.dp(2))
    }

    val minusBtn = makePillButton(context, "−", UiTheme.BG_CARD_ALT, UiTheme.TEXT_PRIMARY, 0, 14f, 10f, 3f) {}
    val plusBtn = makePillButton(context, "+", UiTheme.BG_CARD_ALT, UiTheme.TEXT_PRIMARY, 0, 14f, 10f, 3f) {}

    topRow.addView(lblView)
    topRow.addView(minusBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        marginEnd = context.dp(6)
    })
    topRow.addView(valueView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        marginEnd = context.dp(6)
    })
    topRow.addView(plusBtn)
    card.addView(topRow)

    val stepsTotal = ((desc.max - desc.min) / desc.step).roundToInt().coerceAtLeast(1)
    val (trackDrawable, thumbDrawable) = makeSeekBarDrawables(context, accentColor)
    val seekBar = SeekBar(context).apply {
        max = stepsTotal
        progress = ((currentVal - desc.min) / desc.step).roundToInt().coerceIn(0, stepsTotal)
        progressDrawable = trackDrawable
        thumb = thumbDrawable
        splitTrack = false
        setPadding(context.dp(10), context.dp(10), context.dp(10), context.dp(10))
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            context.dp(44)
        )
    }

    // Critical for phone UX: prevent vertical ScrollView from stealing horizontal SeekBar drags!
    seekBar.setOnTouchListener { v, ev ->
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                v.parent?.requestDisallowInterceptTouchEvent(true)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                v.parent?.requestDisallowInterceptTouchEvent(false)
            }
        }
        false
    }

    seekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
        override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
            if (isSyncing) return
            val next = (desc.min + progress * desc.step).coerceIn(desc.min, desc.max)
            currentVal = next
            valueView.text = formatParam(desc, currentVal)
            if (fromUser) {
                onLiveChange(currentVal)
            }
        }

        override fun onStartTrackingTouch(sb: SeekBar?) {
            dragStartVal = currentVal
        }

        override fun onStopTrackingTouch(sb: SeekBar?) {
            if (kotlin.math.abs(currentVal - dragStartVal) > 1e-6) {
                onCommitChange(dragStartVal, currentVal)
            }
        }
    })

    val stepAdjust = { delta: Double ->
        val oldV = currentVal
        val next = (currentVal + delta).coerceIn(desc.min, desc.max)
        if (kotlin.math.abs(next - oldV) > 1e-6) {
            currentVal = next
            isSyncing = true
            seekBar.progress = ((currentVal - desc.min) / desc.step).roundToInt().coerceIn(0, stepsTotal)
            isSyncing = false
            valueView.text = formatParam(desc, currentVal)
            onLiveChange(currentVal)
            onCommitChange(oldV, currentVal)
        }
    }
    minusBtn.setOnClickListener {
        it.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
        stepAdjust(-desc.step)
    }
    plusBtn.setOnClickListener {
        it.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
        stepAdjust(desc.step)
    }

    card.addView(seekBar)

    if (desc.hint.isNotBlank()) {
        val hintView = TextView(context).apply {
            text = desc.hint
            textSize = 11f
            setTextColor(UiTheme.TEXT_MUTED)
        }
        card.addView(hintView)
    }

    return ParamControlHandle(card) { updated ->
        val clamped = updated.coerceIn(desc.min, desc.max)
        currentVal = clamped
        isSyncing = true
        seekBar.progress = ((clamped - desc.min) / desc.step).roundToInt().coerceIn(0, stepsTotal)
        isSyncing = false
        valueView.text = formatParam(desc, clamped)
    }
}

fun buildToggleControl(
    context: Context,
    desc: ParamDescriptor,
    initialValue: Double,
    onChange: (oldVal: Double, newVal: Double) -> Unit
): ParamControlHandle {
    var current = if (initialValue >= 0.5) 1.0 else 0.0
    var syncing = false

    val row = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        background = roundedRect(UiTheme.BG_CARD, 16f, context)
        setPadding(context.dp(14), context.dp(10), context.dp(14), context.dp(10))
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = context.dp(7) }
    }

    val lbl = TextView(context).apply {
        text = desc.label
        textSize = 13.5f
        setTextColor(UiTheme.TEXT_PRIMARY)
        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    }

    val sw = Switch(context).apply {
        isChecked = current >= 0.5
        setOnCheckedChangeListener { _, isChecked ->
            if (syncing) return@setOnCheckedChangeListener
            val old = current
            val next = if (isChecked) 1.0 else 0.0
            current = next
            onChange(old, next)
        }
    }

    row.addView(lbl)
    row.addView(sw)
    row.setOnClickListener { sw.toggle() }

    return ParamControlHandle(row) { updated ->
        val next = if (updated >= 0.5) 1.0 else 0.0
        current = next
        syncing = true
        sw.isChecked = next >= 0.5
        syncing = false
    }
}

fun buildChoiceControl(
    context: Context,
    desc: ParamDescriptor,
    initialValue: Double,
    onChange: (oldVal: Double, newVal: Double) -> Unit
): ParamControlHandle {
    var currentIdx = initialValue.roundToInt().coerceIn(0, (desc.choices.size - 1).coerceAtLeast(0))

    val card = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        background = roundedRect(UiTheme.BG_CARD, 16f, context)
        setPadding(context.dp(12), context.dp(9), context.dp(12), context.dp(9))
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = context.dp(7) }
    }

    val lbl = TextView(context).apply {
        text = desc.label
        textSize = 13f
        setTextColor(UiTheme.TEXT_MUTED)
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        setPadding(0, 0, 0, context.dp(6))
    }
    card.addView(lbl)

    val scroll = HorizontalScrollView(context).apply {
        isHorizontalScrollBarEnabled = false
    }
    val chipRow = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
    }
    val chipViews = mutableListOf<TextView>()

    fun refreshChips() {
        chipViews.forEachIndexed { idx, tv ->
            val active = idx == currentIdx
            tv.background = roundedRect(
                if (active) UiTheme.ACCENT else UiTheme.BG_CARD_ALT,
                16f,
                context,
                if (active) UiTheme.ACCENT else UiTheme.STROKE,
                1f
            )
            tv.setTextColor(if (active) 0xFF0A0F18.toInt() else UiTheme.TEXT_PRIMARY)
        }
    }

    desc.choices.forEachIndexed { idx, name ->
        val chip = makePillButton(context, name, textSizeSp = 12f, padH = 12f, padV = 7f) {
            if (idx != currentIdx) {
                val old = currentIdx.toDouble()
                currentIdx = idx
                refreshChips()
                onChange(old, idx.toDouble())
            }
        }
        chipViews.add(chip)
        chipRow.addView(chip, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { marginEnd = context.dp(6) })
    }

    refreshChips()
    scroll.addView(chipRow)
    card.addView(scroll)

    return ParamControlHandle(card) { updated ->
        currentIdx = updated.roundToInt().coerceIn(0, (desc.choices.size - 1).coerceAtLeast(0))
        refreshChips()
    }
}

fun formatParam(desc: ParamDescriptor, value: Double): String {
    val num = PhysicsEngine.fmt(value, desc.decimals)
    return if (desc.unit.isBlank()) num else "$num ${desc.unit}"
}
