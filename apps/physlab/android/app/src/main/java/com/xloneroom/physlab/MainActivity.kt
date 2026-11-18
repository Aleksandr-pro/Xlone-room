package com.xloneroom.physlab

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.text.TextUtils
import android.view.Choreographer
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.*
import com.xloneroom.physlab.engine.PhysicsEngine
import com.xloneroom.physlab.model.*
import com.xloneroom.physlab.storage.RoomRepository
import com.xloneroom.physlab.ui.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

class MainActivity : Activity(), Choreographer.FrameCallback {

    private lateinit var repo: RoomRepository
    private val engine = PhysicsEngine()
    private val rooms = mutableListOf<LabRoom>()
    private lateinit var activeRoom: LabRoom

    private var isPlaying = true
    private var timeScale = 1.0
    private var canvasExpanded = false
    private var pvGraphMode = false
    private var activeTab = 0 // 0=Controls, 1=Graphs, 2=Journal/Theory, 3=Rooms/Topics

    // Latest pedagogical explanation banner override (shows last change for a few seconds or until phase updates)
    private var lastExplanationTitle = ""
    private var lastExplanationDetail = ""
    private var lastExplanationUntilMs = 0L

    // UI references
    private lateinit var rootLayout: LinearLayout
    private lateinit var roomSelectorBtn: TextView
    private lateinit var playPauseBtn: TextView
    private lateinit var canvasContainer: FrameLayout
    private lateinit var canvasView: LabCanvasView
    private lateinit var timeBadge: TextView
    private lateinit var speedBadge: TextView
    private lateinit var vectorsBtn: TextView
    private lateinit var gridBtn: TextView
    private lateinit var expandBtn: TextView

    private lateinit var liveBannerTitle: TextView
    private lateinit var liveBannerDetail: TextView
    private lateinit var liveBannerFormula: TextView

    private lateinit var tabContentScroll: ScrollView
    private lateinit var tabContentBox: LinearLayout
    private val navTabViews = mutableListOf<LinearLayout>()

    // Active tab live updaters
    private val paramHandles = mutableMapOf<String, ParamControlHandle>()
    private var oscilloscopeView: OscilloscopeView? = null
    private val liveMetricValueViews = mutableListOf<TextView>()
    private var energyBarView: LinearLayout? = null
    private var liveProcessCardTitle: TextView? = null
    private var liveProcessCardDetail: TextView? = null
    private var liveProcessCardFormula: TextView? = null

    private var lastFrameNanos = 0L
    private var lastUiRefreshMs = 0L
    private var lastSaveMs = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        repo = RoomRepository(this)
        rooms.clear()
        rooms.addAll(repo.loadRooms())
        val activeId = repo.loadActiveRoomId(rooms)
        activeRoom = rooms.firstOrNull { it.id == activeId } ?: rooms.first()

        buildRootUi()
        setContentView(rootLayout)
        applySystemInsets()

        loadRoomIntoEngine(activeRoom, switchToControls = false)
    }

    override fun onResume() {
        super.onResume()
        lastFrameNanos = 0L
        Choreographer.getInstance().postFrameCallback(this)
    }

    override fun onPause() {
        super.onPause()
        Choreographer.getInstance().removeFrameCallback(this)
        repo.saveRooms(rooms, activeRoom.id)
    }

    private fun applySystemInsets() {
        rootLayout.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val sys = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                v.setPadding(sys.left, sys.top, sys.right, sys.bottom)
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom
                )
            }
            insets
        }
        rootLayout.requestApplyInsets()
    }

    private fun buildRootUi() {
        rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(UiTheme.BG_DARK)
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }

        // 1. Top Header Bar
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(UiTheme.BG_SURFACE)
            setPadding(dp(10), dp(7), dp(10), dp(7))
        }

        roomSelectorBtn = TextView(this).apply {
            textSize = 13.5f
            setTextColor(UiTheme.TEXT_PRIMARY)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            background = roundedRect(UiTheme.BG_CARD_ALT, 16f, this@MainActivity, UiTheme.STROKE, 1f)
            setPadding(dp(11), dp(6), dp(11), dp(6))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = dp(8)
            }
            setOnClickListener { switchTab(3) }
        }

        playPauseBtn = makePillButton(this, "⏸", UiTheme.ACCENT, 0xFF0A0F18.toInt(), UiTheme.ACCENT, 14f, 12f, 6f) {
            isPlaying = !isPlaying
            updatePlayButtonUi()
        }
        val stepBtn = makePillButton(this, "+1", UiTheme.BG_CARD_ALT, UiTheme.TEXT_PRIMARY, UiTheme.STROKE, 12.5f, 10f, 6f) {
            isPlaying = false
            updatePlayButtonUi()
            engine.step(0.02, activeRoom.params)
            flushPendingEngineEvents()
            canvasView.invalidate()
            refreshLiveTelemetryUi(force = true)
        }
        val resetBtn = makePillButton(this, "↺", UiTheme.BG_CARD_ALT, UiTheme.TEXT_PRIMARY, UiTheme.STROKE, 14f, 11f, 6f) {
            engine.reset(activeRoom.topic, activeRoom.params)
            canvasView.invalidate()
            refreshLiveTelemetryUi(force = true)
        }

        header.addView(roomSelectorBtn)
        header.addView(playPauseBtn, wrapLp(marginEnd = 5))
        header.addView(stepBtn, wrapLp(marginEnd = 5))
        header.addView(resetBtn)
        rootLayout.addView(header)

        // 2. Interactive Simulation Canvas Container
        val screenH = resources.displayMetrics.heightPixels
        val defaultCanvasH = (screenH * 0.34f).toInt().coerceAtLeast(dp(220))
        canvasContainer = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, defaultCanvasH)
        }

        canvasView = LabCanvasView(this).apply {
            layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
            onDirectDragParam = { key, oldVal, newVal, commit ->
                handleDirectCanvasParam(key, oldVal, newVal, commit)
            }
        }
        canvasContainer.addView(canvasView)

        // Top-left floating time & speed badges
        val hudLeft = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP or Gravity.START
            ).apply { setMargins(dp(8), dp(8), 0, 0) }
        }
        timeBadge = makePillButton(this, "t = 0.00 с", 0xCC161C29.toInt(), UiTheme.TEXT_PRIMARY, UiTheme.STROKE, 11f, 9f, 4f) {}
        speedBadge = makePillButton(this, "1×", 0xCC161C29.toInt(), UiTheme.ACCENT, UiTheme.STROKE, 11f, 9f, 4f) {
            timeScale = when (timeScale) {
                1.0 -> 0.5
                0.5 -> 0.25
                0.25 -> 2.0
                else -> 1.0
            }
            speedBadge.text = "${if (timeScale == 1.0 || timeScale == 2.0) timeScale.toInt().toString() else timeScale}×"
        }
        hudLeft.addView(timeBadge, wrapLp(marginEnd = 5))
        hudLeft.addView(speedBadge)
        canvasContainer.addView(hudLeft)

        // Top-right floating toggles (Vectors, Grid, Expand)
        val hudRight = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP or Gravity.END
            ).apply { setMargins(0, dp(8), dp(8), 0) }
        }
        vectorsBtn = makePillButton(this, "Векторы", 0xCC1E3A5F.toInt(), UiTheme.ACCENT, UiTheme.ACCENT, 11f, 9f, 4f) {
            canvasView.showVectors = !canvasView.showVectors
            vectorsBtn.background = roundedRect(
                if (canvasView.showVectors) 0xCC1E3A5F.toInt() else 0xCC161C29.toInt(),
                16f, this, if (canvasView.showVectors) UiTheme.ACCENT else UiTheme.STROKE, 1f
            )
            canvasView.invalidate()
        }
        gridBtn = makePillButton(this, "Сетка", 0xCC1E3A5F.toInt(), UiTheme.ACCENT, UiTheme.ACCENT, 11f, 9f, 4f) {
            canvasView.showGrid = !canvasView.showGrid
            gridBtn.background = roundedRect(
                if (canvasView.showGrid) 0xCC1E3A5F.toInt() else 0xCC161C29.toInt(),
                16f, this, if (canvasView.showGrid) UiTheme.ACCENT else UiTheme.STROKE, 1f
            )
            canvasView.invalidate()
        }
        expandBtn = makePillButton(this, "⛶", 0xCC161C29.toInt(), UiTheme.TEXT_PRIMARY, UiTheme.STROKE, 12f, 9f, 4f) {
            canvasExpanded = !canvasExpanded
            val targetH = if (canvasExpanded) (screenH * 0.62f).toInt() else defaultCanvasH
            canvasContainer.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, targetH)
        }
        hudRight.addView(vectorsBtn, wrapLp(marginEnd = 5))
        hudRight.addView(gridBtn, wrapLp(marginEnd = 5))
        hudRight.addView(expandBtn)
        canvasContainer.addView(hudRight)

        rootLayout.addView(canvasContainer)

        // 3. Live Physical Narrative Strip (always visible right under the simulation!)
        val bannerCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(UiTheme.BG_SURFACE)
            setPadding(dp(12), dp(7), dp(12), dp(8))
            setOnClickListener { switchTab(2) }
        }
        val bannerTop = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        liveBannerTitle = TextView(this).apply {
            textSize = 12.5f
            setTextColor(UiTheme.ACCENT)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val journalHint = TextView(this).apply {
            text = "Журнал →"
            textSize = 11f
            setTextColor(UiTheme.TEXT_MUTED)
        }
        bannerTop.addView(liveBannerTitle)
        bannerTop.addView(journalHint)

        liveBannerDetail = TextView(this).apply {
            textSize = 12f
            setTextColor(UiTheme.TEXT_PRIMARY)
            maxLines = 2
            ellipsize = TextUtils.TruncateAt.END
            setPadding(0, dp(2), 0, dp(2))
        }
        liveBannerFormula = TextView(this).apply {
            textSize = 11.5f
            setTextColor(UiTheme.YELLOW)
            typeface = Typeface.MONOSPACE
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }
        bannerCard.addView(bannerTop)
        bannerCard.addView(liveBannerDetail)
        bannerCard.addView(liveBannerFormula)
        rootLayout.addView(bannerCard)

        // Thin divider
        rootLayout.addView(View(this).apply {
            setBackgroundColor(UiTheme.STROKE)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1))
        })

        // 4. Scrollable Tab Body
        tabContentScroll = ScrollView(this).apply {
            isFillViewport = true
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        tabContentBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(16))
        }
        tabContentScroll.addView(tabContentBox)
        rootLayout.addView(tabContentScroll)

        // 5. Phone Bottom Navigation Bar
        val bottomNav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(UiTheme.BG_SURFACE)
            setPadding(dp(4), dp(5), dp(4), dp(6))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(58))
        }
        val tabs = listOf(
            "🎛" to "Параметры",
            "📈" to "Графики",
            "📖" to "Процессы",
            "🧪" to "Комнаты"
        )
        navTabViews.clear()
        tabs.forEachIndexed { idx, (icon, label) ->
            val item = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f)
                setOnClickListener { switchTab(idx) }
            }
            val ic = TextView(this).apply {
                text = icon
                textSize = 17f
                gravity = Gravity.CENTER
            }
            val lb = TextView(this).apply {
                text = label
                textSize = 11f
                gravity = Gravity.CENTER
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }
            item.addView(ic)
            item.addView(lb)
            navTabViews.add(item)
            bottomNav.addView(item)
        }
        rootLayout.addView(bottomNav)
    }

    private fun updatePlayButtonUi() {
        playPauseBtn.text = if (isPlaying) "⏸" else "▶"
        playPauseBtn.background = roundedRect(
            if (isPlaying) UiTheme.ACCENT else UiTheme.GREEN,
            18f, this, if (isPlaying) UiTheme.ACCENT else UiTheme.GREEN, 1f
        )
        canvasView.isPlaying = isPlaying
    }

    private fun switchTab(idx: Int) {
        activeTab = idx
        renderBottomNavHighlight()
        renderActiveTabContent()
    }

    private fun renderBottomNavHighlight() {
        navTabViews.forEachIndexed { idx, box ->
            val active = idx == activeTab
            box.background = if (active) roundedRect(UiTheme.ACCENT_SOFT, 12f, this) else null
            val labelTv = box.getChildAt(1) as? TextView
            labelTv?.setTextColor(if (active) UiTheme.ACCENT else UiTheme.TEXT_MUTED)
        }
    }

    private fun loadRoomIntoEngine(room: LabRoom, switchToControls: Boolean = true) {
        activeRoom = room
        roomSelectorBtn.text = "🧪 ${room.name} ▾"
        engine.reset(room.topic, room.params)
        canvasView.engine = engine
        canvasView.params = room.params
        pvGraphMode = false
        lastExplanationUntilMs = 0L
        if (switchToControls) activeTab = 0
        renderBottomNavHighlight()
        renderActiveTabContent()
        refreshLiveTelemetryUi(force = true)
        repo.saveRooms(rooms, activeRoom.id)
    }

    private fun handleDirectCanvasParam(key: String, oldVal: Double, newVal: Double, commit: Boolean) {
        activeRoom.params[key] = newVal
        engine.syncParamsLive(activeRoom.params, key, oldVal, newVal)
        // Sync all sliders (e.g. adiabatic volume drag also changes temperature!)
        for ((pKey, handle) in paramHandles) {
            activeRoom.params[pKey]?.let { handle.syncValue(it) }
        }
        if (commit && abs(newVal - oldVal) > 1e-4) {
            recordParamChangeToJournal(key, oldVal, newVal)
        }
        canvasView.invalidate()
        refreshLiveTelemetryUi(force = true)
    }

    private fun recordParamChangeToJournal(key: String, oldVal: Double, newVal: Double) {
        val (title, detail) = engine.explainParamChange(activeRoom.topic, key, oldVal, newVal, activeRoom.params)
        val now = System.currentTimeMillis()
        activeRoom.journal.add(
            0,
            ChangeLogEntry(
                id = "log_${now}_${key}",
                simTimeSec = engine.simTime,
                wallTimeMs = now,
                kind = "PARAM",
                title = title,
                detail = detail
            )
        )
        if (activeRoom.journal.size > 100) activeRoom.journal.removeAt(activeRoom.journal.lastIndex)
        activeRoom.updatedAt = now
        lastExplanationTitle = title
        lastExplanationDetail = detail
        lastExplanationUntilMs = now + 7000L
        repo.saveRooms(rooms, activeRoom.id)
        refreshLiveTelemetryUi(force = true)
    }

    private fun flushPendingEngineEvents() {
        if (engine.pendingEvents.isEmpty()) return
        val now = System.currentTimeMillis()
        for ((t, d) in engine.pendingEvents) {
            activeRoom.journal.add(
                0,
                ChangeLogEntry(
                    id = "ev_${now}_${activeRoom.journal.size}",
                    simTimeSec = engine.simTime,
                    wallTimeMs = now,
                    kind = "EVENT",
                    title = t,
                    detail = d
                )
            )
            lastExplanationTitle = t
            lastExplanationDetail = d
            lastExplanationUntilMs = now + 5000L
        }
        engine.pendingEvents.clear()
        if (activeRoom.journal.size > 100) activeRoom.journal.subList(100, activeRoom.journal.size).clear()
    }

    private fun captureMeasurementSnapshot() {
        val snap = engine.captureTelemetry(activeRoom.params)
        val map = linkedMapOf<String, String>()
        for (m in snap.metrics) {
            map[m.label] = "${m.value} ${m.unit}".trim()
        }
        val row = MeasurementRow(
            index = activeRoom.measurements.size + 1,
            simTimeSec = snap.simTime,
            note = snap.phaseTitle,
            values = map
        )
        activeRoom.measurements.add(0, row)
        val now = System.currentTimeMillis()
        val summary = map.entries.joinToString(", ") { "${it.key}: ${it.value}" }
        activeRoom.journal.add(
            0,
            ChangeLogEntry(
                id = "meas_$now",
                simTimeSec = snap.simTime,
                wallTimeMs = now,
                kind = "MEASURE",
                title = "Замер №${row.index} зафиксирован",
                detail = summary
            )
        )
        activeRoom.updatedAt = now
        repo.saveRooms(rooms, activeRoom.id)
        Toast.makeText(this, "Замер №${row.index} записан в таблицу", Toast.LENGTH_SHORT).show()
        if (activeTab == 1 || activeTab == 2) renderActiveTabContent()
    }

    private fun renderActiveTabContent() {
        tabContentBox.removeAllViews()
        paramHandles.clear()
        oscilloscopeView = null
        liveMetricValueViews.clear()
        energyBarView = null
        liveProcessCardTitle = null
        liveProcessCardDetail = null
        liveProcessCardFormula = null

        when (activeTab) {
            0 -> renderControlsTab()
            1 -> renderGraphsTab()
            2 -> renderProcessesAndJournalTab()
            else -> renderRoomsAndTopicsTab()
        }
        tabContentScroll.scrollTo(0, 0)
    }

    private fun renderControlsTab() {
        // Preset chips row
        val presets = activeRoom.topic.presets()
        if (presets.isNotEmpty()) {
            val lbl = TextView(this).apply {
                text = "Быстрые сценарии:"
                textSize = 12f
                setTextColor(UiTheme.TEXT_MUTED)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setPadding(0, 0, 0, dp(5))
            }
            tabContentBox.addView(lbl)

            val hScroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            for (preset in presets) {
                val chip = makePillButton(this, preset.label, UiTheme.BG_CARD, UiTheme.ACCENT, UiTheme.STROKE, 12f, 11f, 6f) {
                    val oldSummary = preset.values.entries.joinToString { "${it.key}=${PhysicsEngine.fmt(activeRoom.params[it.key] ?: 0.0, 2)}" }
                    for ((k, v) in preset.values) {
                        activeRoom.params[k] = v
                    }
                    engine.reset(activeRoom.topic, activeRoom.params)
                    val now = System.currentTimeMillis()
                    val title = "Сценарий «${preset.label}»"
                    activeRoom.journal.add(
                        0,
                        ChangeLogEntry(
                            id = "pre_$now",
                            simTimeSec = 0.0,
                            wallTimeMs = now,
                            kind = "PARAM",
                            title = title,
                            detail = "${preset.description} (Было: $oldSummary)"
                        )
                    )
                    lastExplanationTitle = title
                    lastExplanationDetail = preset.description
                    lastExplanationUntilMs = now + 7000L
                    renderActiveTabContent()
                    canvasView.invalidate()
                    refreshLiveTelemetryUi(force = true)
                    repo.saveRooms(rooms, activeRoom.id)
                }
                row.addView(chip, wrapLp(marginEnd = 6))
            }
            hScroll.addView(row)
            tabContentBox.addView(hScroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(10)
            })
        }

        // Capture Measurement CTA button
        val captureBtn = makePillButton(
            this,
            "📌 Зафиксировать замер в таблицу (${activeRoom.measurements.size})",
            0xFF1D4ED8.toInt(),
            0xFFFFFFFF.toInt(),
            0xFF3B82F6.toInt(),
            13.5f,
            14f,
            10f
        ) {
            captureMeasurementSnapshot()
            renderActiveTabContent()
        }
        tabContentBox.addView(captureBtn, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(10) })

        // Sliders, toggles & choices
        for (desc in activeRoom.topic.descriptors()) {
            val curVal = activeRoom.params[desc.key] ?: desc.defaultValue
            val handle = when (desc.kind) {
                ParamKind.SLIDER -> buildSliderControl(
                    context = this,
                    desc = desc,
                    initialValue = curVal,
                    accentColor = activeRoom.topic.branch.badgeColor.toInt(),
                    onLiveChange = { next ->
                        val prev = activeRoom.params[desc.key] ?: desc.defaultValue
                        activeRoom.params[desc.key] = next
                        engine.syncParamsLive(activeRoom.params, desc.key, prev, next)
                        // Sync linked parameters (e.g. adiabatic T/V)
                        for ((k, h) in paramHandles) {
                            if (k != desc.key) activeRoom.params[k]?.let { h.syncValue(it) }
                        }
                        canvasView.invalidate()
                        refreshLiveTelemetryUi(force = true)
                    },
                    onCommitChange = { oldV, newV ->
                        recordParamChangeToJournal(desc.key, oldV, newV)
                    }
                )
                ParamKind.TOGGLE -> buildToggleControl(this, desc, curVal) { oldV, newV ->
                    activeRoom.params[desc.key] = newV
                    engine.syncParamsLive(activeRoom.params, desc.key, oldV, newV)
                    recordParamChangeToJournal(desc.key, oldV, newV)
                    canvasView.invalidate()
                }
                ParamKind.CHOICE -> buildChoiceControl(this, desc, curVal) { oldV, newV ->
                    activeRoom.params[desc.key] = newV
                    engine.syncParamsLive(activeRoom.params, desc.key, oldV, newV)
                    recordParamChangeToJournal(desc.key, oldV, newV)
                    canvasView.invalidate()
                }
            }
            paramHandles[desc.key] = handle
            tabContentBox.addView(handle.rootView)
        }
    }

    private fun renderGraphsTab() {
        val snap = engine.captureTelemetry(activeRoom.params)

        // 2x2 Instruments grid
        val grid = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val chunks = snap.metrics.chunked(2)
        for (pair in chunks) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = dp(8)
                }
            }
            pair.forEachIndexed { idx, m ->
                val card = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    background = roundedRect(UiTheme.BG_CARD, 14f, this@MainActivity, UiTheme.STROKE, 1f)
                    setPadding(dp(12), dp(9), dp(12), dp(9))
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                        if (idx == 0 && pair.size > 1) marginEnd = dp(8)
                    }
                }
                val lbl = TextView(this).apply {
                    text = m.label
                    textSize = 11.5f
                    setTextColor(UiTheme.TEXT_MUTED)
                }
                val valTv = TextView(this).apply {
                    text = "${m.value} ${m.unit}".trim()
                    textSize = 18f
                    setTextColor(m.accentColor.toInt())
                    typeface = Typeface.MONOSPACE
                }
                liveMetricValueViews.add(valTv)
                card.addView(lbl)
                card.addView(valTv)
                row.addView(card)
            }
            grid.addView(row)
        }
        tabContentBox.addView(grid)

        // Energy balance bar
        val eTitle = TextView(this).apply {
            text = "Баланс энергии (E_k / E_p / Потери)"
            textSize = 12f
            setTextColor(UiTheme.TEXT_MUTED)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setPadding(0, dp(2), 0, dp(4))
        }
        tabContentBox.addView(eTitle)
        energyBarView = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            background = roundedRect(UiTheme.BG_CARD, 8f, this@MainActivity)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(16)).apply {
                bottomMargin = dp(10)
            }
        }
        tabContentBox.addView(energyBarView)

        // Oscilloscope header + P-V switch for Ideal Gas
        val gHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(6)
            }
        }
        gHeader.addView(TextView(this).apply {
            text = "Осциллограф в реальном времени"
            textSize = 13f
            setTextColor(UiTheme.TEXT_PRIMARY)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        if (activeRoom.topic == ExperimentTopic.IDEAL_GAS) {
            gHeader.addView(makePillButton(this, if (pvGraphMode) "Режим: P(V)" else "Режим: Временной", UiTheme.BG_CARD_ALT, UiTheme.ORANGE, UiTheme.STROKE, 11.5f, 10f, 4f) {
                pvGraphMode = !pvGraphMode
                renderActiveTabContent()
            })
        }
        tabContentBox.addView(gHeader)

        oscilloscopeView = OscilloscopeView(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(185)).apply {
                bottomMargin = dp(12)
            }
            pvMode = pvGraphMode
        }
        tabContentBox.addView(oscilloscopeView)

        // Measurements Table
        val mHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(6)
            }
        }
        mHeader.addView(TextView(this).apply {
            text = "Таблица замеров (${activeRoom.measurements.size})"
            textSize = 13.5f
            setTextColor(UiTheme.TEXT_PRIMARY)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        mHeader.addView(makePillButton(this, "+ Замер", 0xFF1D4ED8.toInt(), 0xFFFFFFFF.toInt(), 0xFF3B82F6.toInt(), 11.5f, 10f, 5f) {
            captureMeasurementSnapshot()
        })
        tabContentBox.addView(mHeader)

        if (activeRoom.measurements.isEmpty()) {
            tabContentBox.addView(TextView(this).apply {
                text = "Замеров пока нет. Нажмите «+ Замер» во время опыта, чтобы сохранить точные показания в отчёт."
                textSize = 12.5f
                setTextColor(UiTheme.TEXT_MUTED)
                background = roundedRect(UiTheme.BG_CARD, 12f, this@MainActivity, UiTheme.STROKE, 1f)
                setPadding(dp(12), dp(12), dp(12), dp(12))
            })
        } else {
            for (row in activeRoom.measurements) {
                val card = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    background = roundedRect(UiTheme.BG_CARD, 12f, this@MainActivity, UiTheme.STROKE, 1f)
                    setPadding(dp(10), dp(8), dp(10), dp(8))
                    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                        bottomMargin = dp(6)
                    }
                }
                card.addView(TextView(this).apply {
                    text = "#${row.index} · t = ${PhysicsEngine.fmt(row.simTimeSec, 2)} с · ${row.note}"
                    textSize = 12f
                    setTextColor(UiTheme.ACCENT)
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                })
                card.addView(TextView(this).apply {
                    text = row.values.entries.joinToString("  |  ") { "${it.key}: ${it.value}" }
                    textSize = 12f
                    setTextColor(UiTheme.TEXT_PRIMARY)
                    typeface = Typeface.MONOSPACE
                    setPadding(0, dp(3), 0, 0)
                })
                tabContentBox.addView(card)
            }
        }

        refreshLiveTelemetryUi(force = true)
    }

    private fun renderProcessesAndJournalTab() {
        val snap = engine.captureTelemetry(activeRoom.params)

        // 1. Live Process Explainer Card
        val procCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedRect(UiTheme.BG_CARD, 14f, this@MainActivity, UiTheme.ACCENT, 1f)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(10)
            }
        }
        liveProcessCardTitle = TextView(this).apply {
            text = "Что происходит сейчас: ${snap.phaseTitle}"
            textSize = 14f
            setTextColor(UiTheme.ACCENT)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        liveProcessCardDetail = TextView(this).apply {
            text = snap.phaseDetail
            textSize = 13f
            setTextColor(UiTheme.TEXT_PRIMARY)
            setPadding(0, dp(4), 0, dp(6))
        }
        liveProcessCardFormula = TextView(this).apply {
            text = snap.liveFormula
            textSize = 12f
            setTextColor(UiTheme.YELLOW)
            typeface = Typeface.MONOSPACE
        }
        procCard.addView(liveProcessCardTitle)
        procCard.addView(liveProcessCardDetail)
        procCard.addView(liveProcessCardFormula)
        tabContentBox.addView(procCard)

        // 2. Theory card
        val theoryCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedRect(UiTheme.BG_CARD, 14f, this@MainActivity, UiTheme.STROKE, 1f)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(10)
            }
        }
        theoryCard.addView(TextView(this).apply {
            text = "📚 Теория: ${activeRoom.topic.title}"
            textSize = 13.5f
            setTextColor(UiTheme.TEXT_PRIMARY)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        })
        theoryCard.addView(TextView(this).apply {
            text = activeRoom.topic.mainFormula
            textSize = 12f
            setTextColor(UiTheme.PURPLE)
            typeface = Typeface.MONOSPACE
            setPadding(0, dp(4), 0, dp(4))
        })
        theoryCard.addView(TextView(this).apply {
            text = activeRoom.topic.theoryNotes
            textSize = 12.5f
            setTextColor(UiTheme.TEXT_MUTED)
        })
        tabContentBox.addView(theoryCard)

        // 3. Guided Student Lab Tasks
        val tasksTitle = TextView(this).apply {
            text = "✅ Задания к лабораторной работе"
            textSize = 13.5f
            setTextColor(UiTheme.TEXT_PRIMARY)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setPadding(0, 0, 0, dp(6))
        }
        tabContentBox.addView(tasksTitle)
        for (task in activeRoom.topic.labTasks()) {
            val cb = CheckBox(this).apply {
                text = task.text
                textSize = 12.5f
                setTextColor(UiTheme.TEXT_PRIMARY)
                isChecked = activeRoom.completedTaskIds.contains(task.id)
                background = roundedRect(UiTheme.BG_CARD, 12f, this@MainActivity, UiTheme.STROKE, 1f)
                setPadding(dp(10), dp(8), dp(10), dp(8))
                setOnCheckedChangeListener { _, checked ->
                    if (checked) activeRoom.completedTaskIds.add(task.id) else activeRoom.completedTaskIds.remove(task.id)
                    repo.saveRooms(rooms, activeRoom.id)
                }
            }
            tabContentBox.addView(cb, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(6)
            })
        }

        // 4. Full Chronological Change & Explanation Journal
        val jHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(6)
                bottomMargin = dp(6)
            }
        }
        jHeader.addView(TextView(this).apply {
            text = "📝 Журнал изменений и объяснений (${activeRoom.journal.size})"
            textSize = 13.5f
            setTextColor(UiTheme.TEXT_PRIMARY)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        jHeader.addView(makePillButton(this, "📤 Отчёт", UiTheme.BG_CARD_ALT, UiTheme.ACCENT, UiTheme.STROKE, 11.5f, 10f, 5f) {
            shareLabReport(activeRoom)
        })
        tabContentBox.addView(jHeader)

        val timeFmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
        for (entry in activeRoom.journal) {
            val badgeColor = when (entry.kind) {
                "EVENT" -> UiTheme.YELLOW
                "MEASURE" -> UiTheme.GREEN
                "ROOM" -> UiTheme.PURPLE
                else -> UiTheme.ACCENT
            }
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                background = roundedRect(UiTheme.BG_CARD, 12f, this@MainActivity, UiTheme.STROKE, 1f)
                setPadding(dp(11), dp(8), dp(11), dp(8))
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = dp(6)
                }
            }
            card.addView(TextView(this).apply {
                text = "[${timeFmt.format(Date(entry.wallTimeMs))} · t=${PhysicsEngine.fmt(entry.simTimeSec, 1)}с] ${entry.title}"
                textSize = 12.5f
                setTextColor(badgeColor)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            })
            card.addView(TextView(this).apply {
                text = entry.detail
                textSize = 12.5f
                setTextColor(UiTheme.TEXT_PRIMARY)
                setPadding(0, dp(3), 0, 0)
            })
            tabContentBox.addView(card)
        }
    }

    private fun renderRoomsAndTopicsTab() {
        // Create Room CTA
        val createBtn = makePillButton(
            this,
            "+ Создать комнату для лабораторной работы",
            0xFF0284C7.toInt(),
            0xFFFFFFFF.toInt(),
            0xFF38BDF8.toInt(),
            13.5f,
            14f,
            11f
        ) {
            showCreateRoomDialog(null)
        }
        tabContentBox.addView(createBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(12)
        })

        // Saved Lab Rooms
        tabContentBox.addView(TextView(this).apply {
            text = "🧪 Мои лабораторные комнаты (${rooms.size})"
            textSize = 14f
            setTextColor(UiTheme.TEXT_PRIMARY)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setPadding(0, 0, 0, dp(6))
        })

        for (r in rooms) {
            val isAct = r.id == activeRoom.id
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                background = roundedRect(
                    UiTheme.BG_CARD,
                    14f,
                    this@MainActivity,
                    if (isAct) UiTheme.ACCENT else UiTheme.STROKE,
                    if (isAct) 1.8f else 1f
                )
                setPadding(dp(12), dp(10), dp(12), dp(10))
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = dp(8)
                }
            }
            card.addView(TextView(this).apply {
                text = "${if (isAct) "🟢 " else ""}${r.name}"
                textSize = 14f
                setTextColor(UiTheme.TEXT_PRIMARY)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            })
            card.addView(TextView(this).apply {
                text = "${r.topic.title} · ${r.topic.branch.title} · Замеров: ${r.measurements.size} · Записей: ${r.journal.size}"
                textSize = 11.5f
                setTextColor(UiTheme.TEXT_MUTED)
                setPadding(0, dp(2), 0, dp(6))
            })
            val btnRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            btnRow.addView(makePillButton(this, if (isAct) "К приборам" else "Открыть", if (isAct) UiTheme.ACCENT else UiTheme.BG_CARD_ALT, if (isAct) 0xFF0A0F18.toInt() else UiTheme.TEXT_PRIMARY, UiTheme.STROKE, 12f, 12f, 6f) {
                loadRoomIntoEngine(r, switchToControls = true)
            }, wrapLp(marginEnd = 6))
            btnRow.addView(makePillButton(this, "📤 Отчёт", UiTheme.BG_CARD_ALT, UiTheme.ACCENT, UiTheme.STROKE, 12f, 11f, 6f) {
                shareLabReport(r)
            }, wrapLp(marginEnd = 6))
            if (rooms.size > 1) {
                btnRow.addView(makePillButton(this, "Удалить", UiTheme.BG_CARD_ALT, UiTheme.RED, UiTheme.STROKE, 12f, 10f, 6f) {
                    rooms.removeAll { it.id == r.id }
                    if (activeRoom.id == r.id) {
                        loadRoomIntoEngine(rooms.first(), switchToControls = false)
                    } else {
                        repo.saveRooms(rooms, activeRoom.id)
                        renderActiveTabContent()
                    }
                })
            }
            card.addView(btnRow)
            tabContentBox.addView(card)
        }

        // Experiment Topic Catalog
        tabContentBox.addView(TextView(this).apply {
            text = "📚 Все темы экспериментов (8 модулей)"
            textSize = 14f
            setTextColor(UiTheme.TEXT_PRIMARY)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setPadding(0, dp(8), 0, dp(6))
        })

        for (topic in ExperimentTopic.entries) {
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                background = roundedRect(UiTheme.BG_CARD, 14f, this@MainActivity, UiTheme.STROKE, 1f)
                setPadding(dp(12), dp(10), dp(12), dp(10))
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = dp(8)
                }
            }
            val topRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            topRow.addView(TextView(this).apply {
                text = topic.branch.title
                textSize = 10.5f
                setTextColor(topic.branch.badgeColor.toInt())
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            topRow.addView(TextView(this).apply {
                text = topic.gradeLabel
                textSize = 10.5f
                setTextColor(UiTheme.TEXT_MUTED)
            })
            card.addView(topRow)
            card.addView(TextView(this).apply {
                text = topic.title
                textSize = 14f
                setTextColor(UiTheme.TEXT_PRIMARY)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setPadding(0, dp(2), 0, dp(2))
            })
            card.addView(TextView(this).apply {
                text = topic.shortDesc
                textSize = 12f
                setTextColor(UiTheme.TEXT_MUTED)
            })
            card.addView(TextView(this).apply {
                text = topic.mainFormula
                textSize = 11.5f
                setTextColor(UiTheme.YELLOW)
                typeface = Typeface.MONOSPACE
                setPadding(0, dp(4), 0, dp(8))
            })
            val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            actions.addView(makePillButton(this, "Открыть в текущей комнате", UiTheme.BG_CARD_ALT, UiTheme.TEXT_PRIMARY, UiTheme.STROKE, 11.5f, 10f, 6f) {
                activeRoom.topic = topic
                activeRoom.params.clear()
                activeRoom.params.putAll(topic.defaultParams())
                val now = System.currentTimeMillis()
                activeRoom.journal.add(0, ChangeLogEntry("top_$now", 0.0, now, "ROOM", "Смена темы → ${topic.title}", topic.shortDesc))
                loadRoomIntoEngine(activeRoom, switchToControls = true)
            }, wrapLp(marginEnd = 6))
            actions.addView(makePillButton(this, "+ Новая комната", UiTheme.ACCENT, 0xFF0A0F18.toInt(), UiTheme.ACCENT, 11.5f, 10f, 6f) {
                showCreateRoomDialog(topic)
            })
            card.addView(actions)
            tabContentBox.addView(card)
        }
    }

    private fun showCreateRoomDialog(preselectedTopic: ExperimentTopic?) {
        var chosenTopic = preselectedTopic ?: activeRoom.topic

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(12), dp(18), dp(8))
        }

        val nameInput = EditText(this).apply {
            hint = "Название (напр., Лаб. №3: Оптика)"
            setText("Лаб. работа: ${chosenTopic.title.substringBefore(":")}")
            setTextColor(UiTheme.TEXT_PRIMARY)
            setHintTextColor(UiTheme.TEXT_MUTED)
        }
        val studentInput = EditText(this).apply {
            hint = "Имя ученика / класс"
            setText(activeRoom.studentName)
            setTextColor(UiTheme.TEXT_PRIMARY)
            setHintTextColor(UiTheme.TEXT_MUTED)
        }
        val goalInput = EditText(this).apply {
            hint = "Цель эксперимента"
            setText("Исследовать зависимости и зафиксировать замеры")
            setTextColor(UiTheme.TEXT_PRIMARY)
            setHintTextColor(UiTheme.TEXT_MUTED)
        }

        val topicSpinner = Spinner(this).apply {
            val titles = ExperimentTopic.entries.map { "${it.branch.title}: ${it.title}" }
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, titles)
            setSelection(ExperimentTopic.entries.indexOf(chosenTopic))
            onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                    chosenTopic = ExperimentTopic.entries[position]
                }
                override fun onNothingSelected(parent: AdapterView<*>?) {}
            }
        }

        container.addView(TextView(this).apply { text = "Тема эксперимента:"; setTextColor(UiTheme.TEXT_MUTED); textSize = 12f })
        container.addView(topicSpinner)
        container.addView(TextView(this).apply { text = "Название комнаты:"; setTextColor(UiTheme.TEXT_MUTED); textSize = 12f; setPadding(0, dp(8), 0, 0) })
        container.addView(nameInput)
        container.addView(TextView(this).apply { text = "Ученик / группа:"; setTextColor(UiTheme.TEXT_MUTED); textSize = 12f; setPadding(0, dp(8), 0, 0) })
        container.addView(studentInput)
        container.addView(TextView(this).apply { text = "Цель работы:"; setTextColor(UiTheme.TEXT_MUTED); textSize = 12f; setPadding(0, dp(8), 0, 0) })
        container.addView(goalInput)

        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Новая комната эксперимента")
            .setView(container)
            .setPositiveButton("Создать и открыть") { _, _ ->
                val newRoom = repo.createRoom(
                    name = nameInput.text.toString().trim(),
                    studentName = studentInput.text.toString().trim(),
                    goal = goalInput.text.toString().trim(),
                    topic = chosenTopic
                )
                rooms.add(0, newRoom)
                loadRoomIntoEngine(newRoom, switchToControls = true)
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun shareLabReport(room: LabRoom) {
        val snap = if (room.id == activeRoom.id) {
            engine.captureTelemetry(room.params)
        } else {
            val tmp = PhysicsEngine(room.topic)
            tmp.reset(room.topic, room.params)
            tmp.captureTelemetry(room.params)
        }
        val report = repo.buildLabReportText(room, snap)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Отчёт PhysLab: ${room.name}")
            putExtra(Intent.EXTRA_TEXT, report)
        }
        startActivity(Intent.createChooser(intent, "Отправить отчёт по лабораторной работе"))
    }

    private fun refreshLiveTelemetryUi(force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!force && now - lastUiRefreshMs < 90L) return
        lastUiRefreshMs = now

        val snap = engine.captureTelemetry(activeRoom.params)
        timeBadge.text = "t = ${PhysicsEngine.fmt(snap.simTime, 2)} с"

        val useExplain = now < lastExplanationUntilMs && lastExplanationTitle.isNotBlank()
        liveBannerTitle.text = if (useExplain) "💡 $lastExplanationTitle" else "⚡ ${snap.phaseTitle}"
        liveBannerDetail.text = if (useExplain) lastExplanationDetail else snap.phaseDetail
        liveBannerFormula.text = snap.liveFormula

        // Update Graphs tab if currently open
        if (activeTab == 1) {
            snap.metrics.forEachIndexed { idx, m ->
                liveMetricValueViews.getOrNull(idx)?.text = "${m.value} ${m.unit}".trim()
            }
            oscilloscopeView?.let { osc ->
                osc.history = engine.history
                osc.channels = snap.graphChannels
                osc.pvHistory = engine.pvHistory
                osc.invalidate()
            }
            energyBarView?.let { bar ->
                val tot = (snap.energyKinetic + snap.energyPotential + snap.energyLost).coerceAtLeast(1e-5)
                bar.removeAllViews()
                fun seg(frac: Double, color: Int) {
                    val w = frac.toFloat().coerceAtLeast(0f)
                    if (w > 0.01f) {
                        bar.addView(View(this).apply {
                            setBackgroundColor(color)
                            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, w)
                        })
                    }
                }
                seg(snap.energyKinetic / tot, UiTheme.RED)
                seg(snap.energyPotential / tot, UiTheme.GREEN)
                seg(snap.energyLost / tot, 0xFF64748B.toInt())
            }
        } else if (activeTab == 2) {
            liveProcessCardTitle?.text = "Что происходит сейчас: ${snap.phaseTitle}"
            liveProcessCardDetail?.text = snap.phaseDetail
            liveProcessCardFormula?.text = snap.liveFormula
        }
    }

    override fun doFrame(frameTimeNanos: Long) {
        if (lastFrameNanos == 0L) lastFrameNanos = frameTimeNanos
        val rawDt = (frameTimeNanos - lastFrameNanos) / 1_000_000_000.0
        lastFrameNanos = frameTimeNanos

        if (isPlaying) {
            val dt = (rawDt * timeScale).coerceIn(0.001, 0.04)
            engine.step(dt, activeRoom.params)
            flushPendingEngineEvents()
            canvasView.invalidate()
            refreshLiveTelemetryUi(force = false)

            val now = System.currentTimeMillis()
            if (now - lastSaveMs > 4000L) {
                lastSaveMs = now
                repo.saveRooms(rooms, activeRoom.id)
            }
        }
        Choreographer.getInstance().postFrameCallback(this)
    }

    private fun wrapLp(marginEnd: Int = 0) = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply { this.marginEnd = dp(marginEnd) }
}
