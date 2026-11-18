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
import com.xloneroom.physlab.engine.AutoLabRunner
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
    private var activeTab = 0 // 0=Опыт, 1=Приборы, 2=Объяснения, 3=Лабораторные
    private var selectedBranchFilter: PhysicsBranch? = null

    private var lastExplanationTitle = ""
    private var lastExplanationDetail = ""
    private var lastExplanationUntilMs = 0L

    private lateinit var rootLayout: LinearLayout
    private lateinit var roomSelectorBtn: TextView
    private lateinit var playPauseBtn: TextView
    private lateinit var canvasContainer: FrameLayout
    private lateinit var canvasView: LabCanvasView
    private lateinit var timeSpeedBadge: TextView
    private lateinit var vectorsBtn: TextView
    private lateinit var expandBtn: TextView

    private lateinit var liveBannerTitle: TextView
    private lateinit var liveBannerDetail: TextView

    private lateinit var tabContentScroll: ScrollView
    private lateinit var tabContentBox: LinearLayout
    private val navTabViews = mutableListOf<LinearLayout>()

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

        // 1. Lightweight Top Bar
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
            background = roundedRect(UiTheme.BG_CARD, 18f, this@MainActivity)
            setPadding(dp(12), dp(7), dp(12), dp(7))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = dp(8)
            }
            setOnClickListener { switchTab(3) }
        }

        playPauseBtn = makePillButton(this, "⏸", UiTheme.ACCENT, 0xFF0A0F18.toInt(), 0, 14f, 12f, 6f) {
            isPlaying = !isPlaying
            updatePlayButtonUi()
        }
        val resetBtn = makePillButton(this, "↺", UiTheme.BG_CARD, UiTheme.TEXT_PRIMARY, 0, 14f, 11f, 6f) {
            engine.reset(activeRoom.topic, activeRoom.params)
            canvasView.invalidate()
            refreshLiveTelemetryUi(force = true)
        }
        val quickSnapBtn = makePillButton(this, "📌", UiTheme.BG_CARD, UiTheme.YELLOW, 0, 13.5f, 10f, 6f) {
            captureMeasurementSnapshot()
        }

        header.addView(roomSelectorBtn)
        header.addView(playPauseBtn, wrapLp(marginEnd = 5))
        header.addView(resetBtn, wrapLp(marginEnd = 5))
        header.addView(quickSnapBtn)
        rootLayout.addView(header)

        // 2. Simulation Canvas (clean & spacious)
        val screenH = resources.displayMetrics.heightPixels
        val defaultCanvasH = (screenH * 0.35f).toInt().coerceAtLeast(dp(225))
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

        // Single compact time/speed chip top-left
        timeSpeedBadge = makePillButton(this, "t = 0.00 с · 1×", 0xAA131A28.toInt(), UiTheme.TEXT_PRIMARY, 0, 11f, 9f, 4f) {
            timeScale = when (timeScale) {
                1.0 -> 0.5
                0.5 -> 0.25
                0.25 -> 2.0
                else -> 1.0
            }
            refreshLiveTelemetryUi(force = true)
        }
        canvasContainer.addView(timeSpeedBadge, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP or Gravity.START
        ).apply { setMargins(dp(8), dp(8), 0, 0) })

        // Two compact icon buttons top-right
        val hudRight = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP or Gravity.END
            ).apply { setMargins(0, dp(8), dp(8), 0) }
        }
        vectorsBtn = makePillButton(this, "Векторы", 0xAA1E3A5F.toInt(), UiTheme.ACCENT, 0, 11f, 9f, 4f) {
            canvasView.showVectors = !canvasView.showVectors
            vectorsBtn.background = roundedRect(
                if (canvasView.showVectors) 0xAA1E3A5F.toInt() else 0xAA131A28.toInt(),
                16f, this
            )
            vectorsBtn.setTextColor(if (canvasView.showVectors) UiTheme.ACCENT else UiTheme.TEXT_MUTED)
            canvasView.invalidate()
        }
        expandBtn = makePillButton(this, "⛶", 0xAA131A28.toInt(), UiTheme.TEXT_PRIMARY, 0, 12f, 9f, 4f) {
            canvasExpanded = !canvasExpanded
            val targetH = if (canvasExpanded) (screenH * 0.60f).toInt() else defaultCanvasH
            canvasContainer.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, targetH)
        }
        hudRight.addView(vectorsBtn, wrapLp(marginEnd = 5))
        hudRight.addView(expandBtn)
        canvasContainer.addView(hudRight)

        rootLayout.addView(canvasContainer)

        // 3. Clean 2-line Narrative Banner
        val bannerCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(UiTheme.BG_SURFACE)
            setPadding(dp(14), dp(8), dp(14), dp(9))
            setOnClickListener { switchTab(2) }
        }
        val bannerTop = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        liveBannerTitle = TextView(this).apply {
            textSize = 13f
            setTextColor(UiTheme.ACCENT)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val journalHint = TextView(this).apply {
            text = "Подробнее →"
            textSize = 11f
            setTextColor(UiTheme.TEXT_MUTED)
        }
        bannerTop.addView(liveBannerTitle)
        bannerTop.addView(journalHint)

        liveBannerDetail = TextView(this).apply {
            textSize = 12.2f
            setTextColor(UiTheme.TEXT_PRIMARY)
            maxLines = 2
            ellipsize = TextUtils.TruncateAt.END
            setPadding(0, dp(2), 0, 0)
        }
        bannerCard.addView(bannerTop)
        bannerCard.addView(liveBannerDetail)
        rootLayout.addView(bannerCard)

        // 4. Scrollable Tab Body
        tabContentScroll = ScrollView(this).apply {
            isFillViewport = true
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        tabContentBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(18))
        }
        tabContentScroll.addView(tabContentBox)
        rootLayout.addView(tabContentScroll)

        // 5. Clean Bottom Navigation
        val bottomNav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(UiTheme.BG_SURFACE)
            setPadding(dp(6), dp(5), dp(6), dp(6))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56))
        }
        val tabs = listOf(
            "🎛" to "Опыт",
            "📊" to "Приборы",
            "📖" to "Объяснения",
            "🧪" to "Лабораторные"
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
                textSize = 16.5f
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
            18f, this
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
            box.background = if (active) roundedRect(UiTheme.ACCENT_SOFT, 14f, this) else null
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
        Toast.makeText(this, "Замер №${row.index} сохранён", Toast.LENGTH_SHORT).show()
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
        // Quick Scenarios strip
        val presets = activeRoom.topic.presets()
        if (presets.isNotEmpty()) {
            val hScroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            for (preset in presets) {
                val chip = makePillButton(this, preset.label, UiTheme.BG_CARD, UiTheme.ACCENT, 0, 12f, 12f, 7f) {
                    val oldSummary = preset.values.entries.joinToString { "${it.key}=${PhysicsEngine.fmt(activeRoom.params[it.key] ?: 0.0, 2)}" }
                    for ((k, v) in preset.values) activeRoom.params[k] = v
                    engine.reset(activeRoom.topic, activeRoom.params)
                    val now = System.currentTimeMillis()
                    val title = "Сценарий «${preset.label}»"
                    activeRoom.journal.add(0, ChangeLogEntry("pre_$now", 0.0, now, "PARAM", title, "${preset.description} (Было: $oldSummary)"))
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
                    for ((k, h) in paramHandles) {
                        if (k != desc.key) activeRoom.params[k]?.let { h.syncValue(it) }
                    }
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

        // 2x2 Clean Digital Instruments
        val grid = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        for (pair in snap.metrics.chunked(2)) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = dp(8)
                }
            }
            pair.forEachIndexed { idx, m ->
                val card = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    background = roundedRect(UiTheme.BG_CARD, 16f, this@MainActivity)
                    setPadding(dp(12), dp(10), dp(12), dp(10))
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
                    textSize = 18.5f
                    setTextColor(m.accentColor.toInt())
                    typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
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
        tabContentBox.addView(TextView(this).apply {
            text = "Баланс энергии (E_k / E_p / Потери)"
            textSize = 12f
            setTextColor(UiTheme.TEXT_MUTED)
            setPadding(0, dp(2), 0, dp(4))
        })
        energyBarView = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            background = roundedRect(UiTheme.BG_CARD, 8f, this@MainActivity)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(14)).apply {
                bottomMargin = dp(10)
            }
        }
        tabContentBox.addView(energyBarView)

        val gHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(6)
            }
        }
        gHeader.addView(TextView(this).apply {
            text = "Живой график"
            textSize = 13.5f
            setTextColor(UiTheme.TEXT_PRIMARY)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        if (activeRoom.topic == ExperimentTopic.IDEAL_GAS) {
            gHeader.addView(makePillButton(this, if (pvGraphMode) "График: P(V)" else "График: время", UiTheme.BG_CARD, UiTheme.ORANGE, 0, 11.5f, 10f, 5f) {
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
        mHeader.addView(makePillButton(this, "+ Замер", UiTheme.ACCENT, 0xFF0A0F18.toInt(), 0, 12f, 11f, 5f) {
            captureMeasurementSnapshot()
        })
        tabContentBox.addView(mHeader)

        if (activeRoom.measurements.isEmpty()) {
            tabContentBox.addView(TextView(this).apply {
                text = "Нажмите 📌 сверху или «+ Замер», чтобы записать показания приборов в таблицу и отчёт."
                textSize = 12.5f
                setTextColor(UiTheme.TEXT_MUTED)
                background = roundedRect(UiTheme.BG_CARD, 14f, this@MainActivity)
                setPadding(dp(12), dp(12), dp(12), dp(12))
            })
        } else {
            for (row in activeRoom.measurements) {
                val card = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    background = roundedRect(UiTheme.BG_CARD, 14f, this@MainActivity)
                    setPadding(dp(11), dp(9), dp(11), dp(9))
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
            background = roundedRect(UiTheme.BG_CARD, 16f, this@MainActivity, UiTheme.ACCENT, 1f)
            setPadding(dp(13), dp(11), dp(13), dp(11))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(10)
            }
        }
        liveProcessCardTitle = TextView(this).apply {
            text = snap.phaseTitle
            textSize = 14.5f
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
            background = roundedRect(UiTheme.BG_CARD, 16f, this@MainActivity)
            setPadding(dp(13), dp(11), dp(13), dp(11))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(10)
            }
        }
        theoryCard.addView(TextView(this).apply {
            text = "📚 Краткая теория"
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
        tabContentBox.addView(TextView(this).apply {
            text = "✅ Задания к лабораторной работе"
            textSize = 13.5f
            setTextColor(UiTheme.TEXT_PRIMARY)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setPadding(0, 0, 0, dp(6))
        })
        for (task in activeRoom.topic.labTasks()) {
            val cb = CheckBox(this).apply {
                text = task.text
                textSize = 12.5f
                setTextColor(UiTheme.TEXT_PRIMARY)
                isChecked = activeRoom.completedTaskIds.contains(task.id)
                background = roundedRect(UiTheme.BG_CARD, 14f, this@MainActivity)
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

        // 4. Chronological Journal + Report Share
        val jHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(8)
                bottomMargin = dp(6)
            }
        }
        jHeader.addView(TextView(this).apply {
            text = "📝 Журнал действий (${activeRoom.journal.size})"
            textSize = 13.5f
            setTextColor(UiTheme.TEXT_PRIMARY)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        jHeader.addView(makePillButton(this, "📤 Отчёт", UiTheme.BG_CARD_ALT, UiTheme.ACCENT, 0, 12f, 11f, 5f) {
            shareLabReport(activeRoom)
        })
        tabContentBox.addView(jHeader)

        val timeFmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
        for (entry in activeRoom.journal) {
            val badgeColor = when (entry.kind) {
                "EVENT" -> UiTheme.YELLOW
                "MEASURE" -> UiTheme.GREEN
                "ROOM", "AUTO" -> UiTheme.PURPLE
                else -> UiTheme.ACCENT
            }
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                background = roundedRect(UiTheme.BG_CARD, 14f, this@MainActivity)
                setPadding(dp(11), dp(8), dp(11), dp(8))
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = dp(6)
                }
            }
            card.addView(TextView(this).apply {
                text = "[${timeFmt.format(Date(entry.wallTimeMs))} · ${PhysicsEngine.fmt(entry.simTimeSec, 1)}с] ${entry.title}"
                textSize = 12.2f
                setTextColor(badgeColor)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            })
            card.addView(TextView(this).apply {
                text = entry.detail
                textSize = 12.2f
                setTextColor(UiTheme.TEXT_PRIMARY)
                setPadding(0, dp(3), 0, 0)
            })
            tabContentBox.addView(card)
        }
    }

    private fun renderRoomsAndTopicsTab() {
        // Create Custom Room button
        val createBtn = makePillButton(
            this,
            "+ Создать свою комнату",
            UiTheme.ACCENT,
            0xFF0A0F18.toInt(),
            0,
            13.5f,
            14f,
            10f
        ) {
            showCreateRoomDialog(null)
        }
        tabContentBox.addView(createBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(12)
        })

        // Branch Filter Chips
        val fScroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        val fRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val filterItems = listOf<Pair<PhysicsBranch?, String>>(null to "Все разделы") +
            PhysicsBranch.entries.map { it to it.title }

        for ((branch, title) in filterItems) {
            val active = selectedBranchFilter == branch
            val chip = makePillButton(
                this,
                title,
                if (active) UiTheme.ACCENT else UiTheme.BG_CARD,
                if (active) 0xFF0A0F18.toInt() else UiTheme.TEXT_PRIMARY,
                0,
                11.5f,
                11f,
                6f
            ) {
                selectedBranchFilter = branch
                renderActiveTabContent()
            }
            fRow.addView(chip, wrapLp(marginEnd = 6))
        }
        fScroll.addView(fRow)
        tabContentBox.addView(fScroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(12)
        })

        // 1. Saved Rooms
        tabContentBox.addView(TextView(this).apply {
            text = "🧪 Мои комнаты (${rooms.size})"
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
                    16f,
                    this@MainActivity,
                    if (isAct) UiTheme.ACCENT else 0,
                    if (isAct) 1.5f else 0f
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
                text = "${r.topic.title} · Замеров: ${r.measurements.size}"
                textSize = 11.5f
                setTextColor(UiTheme.TEXT_MUTED)
                setPadding(0, dp(2), 0, dp(7))
            })
            val btnRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            btnRow.addView(makePillButton(this, if (isAct) "К опыту" else "Открыть", if (isAct) UiTheme.ACCENT else UiTheme.BG_CARD_ALT, if (isAct) 0xFF0A0F18.toInt() else UiTheme.TEXT_PRIMARY, 0, 12f, 12f, 6f) {
                loadRoomIntoEngine(r, switchToControls = true)
            }, wrapLp(marginEnd = 6))
            btnRow.addView(makePillButton(this, "📤 Отчёт", UiTheme.BG_CARD_ALT, UiTheme.ACCENT, 0, 12f, 11f, 6f) {
                shareLabReport(r)
            }, wrapLp(marginEnd = 6))
            if (rooms.size > 1) {
                btnRow.addView(makePillButton(this, "Удалить", UiTheme.BG_CARD_ALT, UiTheme.RED, 0, 12f, 10f, 6f) {
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

        // 2. Automatic senior-school lab series. Each button runs the real local model and saves a report table.
        val filteredAutoLabs = ExperimentTopic.autoLabWorks10To11().filter {
            selectedBranchFilter == null || it.topic.branch == selectedBranchFilter
        }
        if (filteredAutoLabs.isNotEmpty()) {
            tabContentBox.addView(TextView(this).apply {
                text = "⚙ Автолаборатории 10–11 классы (${filteredAutoLabs.size})"
                textSize = 14f
                setTextColor(UiTheme.TEXT_PRIMARY)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setPadding(0, dp(8), 0, dp(3))
            })
            tabContentBox.addView(TextView(this).apply {
                text = "Сами выставляют условия, проводят серию расчётов и сохраняют реальные показания модели в отчёт."
                textSize = 11.5f
                setTextColor(UiTheme.TEXT_MUTED)
                setPadding(0, 0, 0, dp(7))
            })
            for (lab in filteredAutoLabs) {
                val card = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    background = roundedRect(UiTheme.BG_CARD, 16f, this@MainActivity, UiTheme.PURPLE, 1f)
                    setPadding(dp(12), dp(10), dp(12), dp(10))
                    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                        bottomMargin = dp(7)
                    }
                }
                val top = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                top.addView(TextView(this).apply {
                    text = "⚙ ${lab.topic.branch.title}"
                    textSize = 10.5f
                    setTextColor(UiTheme.PURPLE)
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                })
                top.addView(TextView(this).apply {
                    text = lab.grade
                    textSize = 10.5f
                    setTextColor(UiTheme.YELLOW)
                })
                card.addView(top)
                card.addView(TextView(this).apply {
                    text = lab.title
                    textSize = 13.5f
                    setTextColor(UiTheme.TEXT_PRIMARY)
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    setPadding(0, dp(2), 0, dp(2))
                })
                card.addView(TextView(this).apply {
                    text = "Цель: ${lab.goal}"
                    textSize = 12f
                    setTextColor(UiTheme.TEXT_MUTED)
                    setPadding(0, 0, 0, dp(3))
                })
                card.addView(TextView(this).apply {
                    text = "${lab.steps.size} авто-замера: ${lab.steps.joinToString(" → ") { it.title }}"
                    textSize = 11f
                    setTextColor(UiTheme.PURPLE)
                    maxLines = 2
                    ellipsize = TextUtils.TruncateAt.END
                    setPadding(0, 0, 0, dp(7))
                })
                card.addView(makePillButton(this, "⚙ Запустить авто-серию", UiTheme.PURPLE, UiTheme.TEXT_PRIMARY, 0, 12f, 12f, 6f) {
                    startAutomaticLab(lab)
                })
                tabContentBox.addView(card)
            }
        }

        // 3. Ready school lab works (filtered by branch)
        val filteredLabs = ExperimentTopic.readyLabWorks().filter {
            selectedBranchFilter == null || it.topic.branch == selectedBranchFilter
        }
        if (filteredLabs.isNotEmpty()) {
            tabContentBox.addView(TextView(this).apply {
                text = "🎓 Готовые лабораторные работы (${filteredLabs.size})"
                textSize = 14f
                setTextColor(UiTheme.TEXT_PRIMARY)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setPadding(0, dp(8), 0, dp(6))
            })
            for (lw in filteredLabs) {
                val card = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    background = roundedRect(UiTheme.BG_CARD, 16f, this@MainActivity)
                    setPadding(dp(12), dp(10), dp(12), dp(10))
                    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                        bottomMargin = dp(7)
                    }
                }
                val top = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                top.addView(TextView(this).apply {
                    text = lw.topic.branch.title
                    textSize = 10.5f
                    setTextColor(lw.topic.branch.badgeColor.toInt())
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                })
                top.addView(TextView(this).apply {
                    text = lw.grade
                    textSize = 10.5f
                    setTextColor(UiTheme.TEXT_MUTED)
                })
                card.addView(top)
                card.addView(TextView(this).apply {
                    text = lw.title
                    textSize = 13.5f
                    setTextColor(UiTheme.TEXT_PRIMARY)
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    setPadding(0, dp(2), 0, dp(2))
                })
                card.addView(TextView(this).apply {
                    text = "Цель: ${lw.goal}"
                    textSize = 12f
                    setTextColor(UiTheme.TEXT_MUTED)
                    setPadding(0, 0, 0, dp(7))
                })
                card.addView(makePillButton(this, "▶ Начать лабораторную работу", UiTheme.BG_CARD_ALT, UiTheme.ACCENT, 0, 12f, 12f, 6f) {
                    val created = repo.createRoom(
                        name = lw.title,
                        studentName = activeRoom.studentName,
                        goal = lw.goal,
                        topic = lw.topic
                    )
                    for ((k, v) in lw.initialParams) created.params[k] = v
                    rooms.add(0, created)
                    loadRoomIntoEngine(created, switchToControls = true)
                })
                tabContentBox.addView(card)
            }
        }

        // 4. Full Catalog of 14 Physics Topics
        val filteredTopics = ExperimentTopic.entries.filter {
            selectedBranchFilter == null || it.branch == selectedBranchFilter
        }
        tabContentBox.addView(TextView(this).apply {
            text = "📚 Все физические установки (${filteredTopics.size})"
            textSize = 14f
            setTextColor(UiTheme.TEXT_PRIMARY)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setPadding(0, dp(8), 0, dp(6))
        })

        for (topic in filteredTopics) {
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                background = roundedRect(UiTheme.BG_CARD, 16f, this@MainActivity)
                setPadding(dp(12), dp(10), dp(12), dp(10))
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = dp(8)
                }
            }
            val topRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
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
                setPadding(0, 0, 0, dp(7))
            })
            val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            actions.addView(makePillButton(this, "Открыть здесь", UiTheme.BG_CARD_ALT, UiTheme.TEXT_PRIMARY, 0, 12f, 11f, 6f) {
                activeRoom.topic = topic
                activeRoom.params.clear()
                activeRoom.params.putAll(topic.defaultParams())
                val now = System.currentTimeMillis()
                activeRoom.journal.add(0, ChangeLogEntry("top_$now", 0.0, now, "ROOM", "Смена темы → ${topic.title}", topic.shortDesc))
                loadRoomIntoEngine(activeRoom, switchToControls = true)
            }, wrapLp(marginEnd = 6))
            actions.addView(makePillButton(this, "+ Новая комната", UiTheme.ACCENT, 0xFF0A0F18.toInt(), 0, 12f, 11f, 6f) {
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

    /** Creates a fresh room, runs the selected scripted series through PhysicsEngine and persists every snapshot. */
    private fun startAutomaticLab(lab: AutoLabWork) {
        val room = repo.createRoom(
            name = lab.title,
            studentName = activeRoom.studentName,
            goal = lab.goal,
            topic = lab.topic
        )
        val result = AutoLabRunner.run(lab)
        val descriptors = lab.topic.descriptors().associateBy { it.key }
        val now = System.currentTimeMillis()

        for (sample in result.samples) {
            val values = linkedMapOf<String, String>()
            values["Этап"] = sample.step.title
            values["Условия"] = formatAutoConditions(descriptors, sample.step.params)
            for (metric in sample.snapshot.metrics) {
                values[metric.label] = "${metric.value} ${metric.unit}".trim()
            }
            values["Расчёт"] = sample.snapshot.liveFormula

            room.measurements.add(
                MeasurementRow(
                    index = sample.index,
                    simTimeSec = sample.snapshot.simTime,
                    note = sample.step.title,
                    values = values
                )
            )
            room.completedTaskIds.add(sample.step.id)
            val readingSummary = sample.snapshot.metrics.take(3).joinToString(", ") { "${it.label}: ${it.value} ${it.unit}".trim() }
            room.journal.add(
                0,
                ChangeLogEntry(
                    id = "auto_${lab.id}_${sample.step.id}",
                    simTimeSec = sample.snapshot.simTime,
                    wallTimeMs = now,
                    kind = "AUTO",
                    title = "Автоэтап ${sample.index}/${lab.steps.size}: ${sample.step.title}",
                    detail = "${sample.step.instruction} Показания: $readingSummary"
                )
            )
        }
        room.params.clear()
        room.params.putAll(result.finalParams)
        room.updatedAt = now
        room.journal.add(
            0,
            ChangeLogEntry(
                id = "auto_done_${lab.id}_$now",
                simTimeSec = result.samples.lastOrNull()?.snapshot?.simTime ?: 0.0,
                wallTimeMs = now,
                kind = "AUTO",
                title = "Автосерия завершена: ${lab.steps.size} замера",
                detail = "Вывод: ${lab.expectedConclusion} Все значения получены локальной моделью PhysLab и добавлены в отчёт."
            )
        )

        rooms.add(0, room)
        loadRoomIntoEngine(room, switchToControls = true)
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Автосерия завершена")
            .setMessage(
                "${lab.title}\n\nСохранено измерений: ${result.samples.size}. " +
                    "Они уже находятся в комнате и войдут в текстовый отчёт.\n\nВывод:\n${lab.expectedConclusion}"
            )
            .setPositiveButton("К журналу и отчёту") { _, _ -> switchTab(2) }
            .setNegativeButton("К установке", null)
            .show()
    }

    private fun formatAutoConditions(
        descriptors: Map<String, ParamDescriptor>,
        values: Map<String, Double>
    ): String = values.entries.joinToString("; ") { (key, value) ->
        val desc = descriptors[key]
        if (desc == null) "$key = ${PhysicsEngine.fmt(value, 2)}"
        else {
            val formatted = when (desc.kind) {
                ParamKind.TOGGLE -> if (value >= 0.5) "ВКЛ" else "ВЫКЛ"
                ParamKind.CHOICE -> desc.choices.getOrNull(value.toInt()) ?: value.toInt().toString()
                ParamKind.SLIDER -> "${PhysicsEngine.fmt(value, desc.decimals)} ${desc.unit}".trim()
            }
            "${desc.label}: $formatted"
        }
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
        val spdLabel = if (timeScale == 1.0 || timeScale == 2.0) timeScale.toInt().toString() else timeScale.toString()
        timeSpeedBadge.text = "t = ${PhysicsEngine.fmt(snap.simTime, 2)} с · ${spdLabel}×"

        val useExplain = now < lastExplanationUntilMs && lastExplanationTitle.isNotBlank()
        liveBannerTitle.text = if (useExplain) "💡 $lastExplanationTitle" else "⚡ ${snap.phaseTitle}"
        liveBannerDetail.text = if (useExplain) lastExplanationDetail else snap.phaseDetail

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
            liveProcessCardTitle?.text = snap.phaseTitle
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
