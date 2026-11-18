package com.xloneroom.physlab.storage

import android.content.Context
import com.xloneroom.physlab.engine.PhysicsEngine
import com.xloneroom.physlab.model.*
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

class RoomRepository(context: Context?) {

    private val prefs = context?.getSharedPreferences("physlab_rooms_v1", Context.MODE_PRIVATE)

    fun loadRooms(): MutableList<LabRoom> {
        val raw = prefs?.getString(KEY_ROOMS, "") ?: ""
        if (raw.isNotBlank()) {
            val parsed = deserializeRooms(raw)
            if (parsed.isNotEmpty()) return parsed
        }
        val starter = createStarterRooms()
        saveRooms(starter, starter.first().id)
        return starter
    }

    fun loadActiveRoomId(rooms: List<LabRoom>): String {
        val saved = prefs?.getString(KEY_ACTIVE_ID, "") ?: ""
        return if (rooms.any { it.id == saved }) saved else rooms.first().id
    }

    fun saveRooms(rooms: List<LabRoom>, activeRoomId: String) {
        prefs ?: return
        prefs.edit()
            .putString(KEY_ROOMS, serializeRooms(rooms))
            .putString(KEY_ACTIVE_ID, activeRoomId)
            .apply()
    }

    fun createStarterRooms(): MutableList<LabRoom> {
        val r1 = createRoom(
            name = "Лаб. №1: Баллистика и воздух",
            studentName = "Ученик",
            goal = "Изучить влияние угла броска и сопротивления воздуха на дальность полёта",
            topic = ExperimentTopic.BALLISTICS
        )
        val r2 = createRoom(
            name = "Лаб. №2: Маятник и резонанс",
            studentName = "Ученик",
            goal = "Проверить формулу Гюйгенса T = 2π√(L/g) и независимость от массы",
            topic = ExperimentTopic.PENDULUM
        )
        return mutableListOf(r1, r2)
    }

    fun createRoom(
        name: String,
        studentName: String,
        goal: String,
        topic: ExperimentTopic
    ): LabRoom {
        val now = System.currentTimeMillis()
        val room = LabRoom(
            id = "room_${UUID.randomUUID().toString().take(8)}",
            name = name.ifBlank { topic.title },
            studentName = studentName.ifBlank { "Ученик" },
            goal = goal.ifBlank { "Наблюдение и анализ физических процессов: ${topic.title}" },
            topic = topic,
            params = topic.defaultParams(),
            createdAt = now,
            updatedAt = now
        )
        room.journal.add(
            0,
            ChangeLogEntry(
                id = "log_${now}",
                simTimeSec = 0.0,
                wallTimeMs = now,
                kind = "ROOM",
                title = "Создана комната «${room.name}»",
                detail = "Тема: ${topic.title} (${topic.branch.title}). Формула: ${topic.mainFormula}"
            )
        )
        return room
    }

    fun buildLabReportText(room: LabRoom, snapshot: TelemetrySnapshot): String {
        val df = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault())
        val sb = StringBuilder()
        sb.appendLine("==========================================")
        sb.appendLine("ОТЧЁТ ПО ЛАБОРАТОРНОЙ РАБОТЕ (PhysLab)")
        sb.appendLine("==========================================")
        sb.appendLine("Комната: ${room.name}")
        sb.appendLine("Тема: ${room.topic.title} (${room.topic.branch.title})")
        sb.appendLine("Ученик: ${room.studentName}")
        sb.appendLine("Цель работы: ${room.goal}")
        sb.appendLine("Дата: ${df.format(Date())}")
        sb.appendLine("Основная формула: ${room.topic.mainFormula}")
        val autoCompletion = room.journal.firstOrNull { it.kind == "AUTO" && it.title.startsWith("Автосерия завершена") }
        if (autoCompletion != null) {
            sb.appendLine("Режим выполнения: автоматическая серия PhysLab (локальный расчёт модели)")
            sb.appendLine(autoCompletion.detail)
        }
        sb.appendLine()
        sb.appendLine("--- 1. Текущие параметры установки ---")
        for (d in room.topic.descriptors()) {
            val v = room.params[d.key] ?: d.defaultValue
            val valStr = when (d.kind) {
                ParamKind.TOGGLE -> if (v >= 0.5) "ВКЛ" else "ВЫКЛ"
                ParamKind.CHOICE -> d.choices.getOrNull(v.toInt()) ?: v.toInt().toString()
                ParamKind.SLIDER -> "${PhysicsEngine.fmt(v, d.decimals)} ${d.unit}".trim()
            }
            sb.appendLine("• ${d.label}: $valStr")
        }
        sb.appendLine()
        sb.appendLine("--- 2. Текущие показания приборов (t = ${PhysicsEngine.fmt(snapshot.simTime, 2)} с) ---")
        sb.appendLine("Фаза: ${snapshot.phaseTitle}")
        sb.appendLine("Описание: ${snapshot.phaseDetail}")
        for (m in snapshot.metrics) {
            sb.appendLine("• ${m.label}: ${m.value} ${m.unit}".trim())
        }
        sb.appendLine()
        sb.appendLine("--- 3. Таблица зафиксированных замеров (${room.measurements.size}) ---")
        if (room.measurements.isEmpty()) {
            sb.appendLine("Замеры не фиксировались.")
        } else {
            for (row in room.measurements) {
                val vals = row.values.entries.joinToString("; ") { "${it.key}=${it.value}" }
                sb.appendLine("#${row.index} [t=${PhysicsEngine.fmt(row.simTimeSec, 2)}с] ${row.note}: $vals")
            }
        }
        sb.appendLine()
        sb.appendLine("--- 4. Журнал изменений и объяснений (${room.journal.size}) ---")
        val timeFmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
        for (entry in room.journal.take(40)) {
            sb.appendLine("[${timeFmt.format(Date(entry.wallTimeMs))} | t=${PhysicsEngine.fmt(entry.simTimeSec, 1)}с] ${entry.title}")
            sb.appendLine("   ${entry.detail}")
        }
        return sb.toString()
    }

    companion object {
        private const val KEY_ROOMS = "rooms_json"
        private const val KEY_ACTIVE_ID = "active_room_id"

        fun serializeRooms(rooms: List<LabRoom>): String {
            val arr = JSONArray()
            for (r in rooms) {
                val obj = JSONObject()
                obj.put("id", r.id)
                obj.put("name", r.name)
                obj.put("studentName", r.studentName)
                obj.put("goal", r.goal)
                obj.put("topic", r.topic.id)
                obj.put("createdAt", r.createdAt)
                obj.put("updatedAt", r.updatedAt)

                val pObj = JSONObject()
                for ((k, v) in r.params) pObj.put(k, v)
                obj.put("params", pObj)

                val tasksArr = JSONArray()
                for (t in r.completedTaskIds) tasksArr.put(t)
                obj.put("completedTaskIds", tasksArr)

                val mArr = JSONArray()
                for (m in r.measurements) {
                    val mObj = JSONObject()
                    mObj.put("index", m.index)
                    mObj.put("simTimeSec", m.simTimeSec)
                    mObj.put("note", m.note)
                    val vObj = JSONObject()
                    for ((k, v) in m.values) vObj.put(k, v)
                    mObj.put("values", vObj)
                    mArr.put(mObj)
                }
                obj.put("measurements", mArr)

                val jArr = JSONArray()
                for (j in r.journal.take(80)) {
                    val jObj = JSONObject()
                    jObj.put("id", j.id)
                    jObj.put("simTimeSec", j.simTimeSec)
                    jObj.put("wallTimeMs", j.wallTimeMs)
                    jObj.put("kind", j.kind)
                    jObj.put("title", j.title)
                    jObj.put("detail", j.detail)
                    jArr.put(jObj)
                }
                obj.put("journal", jArr)
                arr.put(obj)
            }
            return arr.toString()
        }

        fun deserializeRooms(json: String): MutableList<LabRoom> {
            val out = mutableListOf<LabRoom>()
            try {
                val arr = JSONArray(json)
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    val topicId = o.optString("topic", "ballistics")
                    val topic = ExperimentTopic.entries.find { it.id == topicId } ?: ExperimentTopic.BALLISTICS
                    val params = topic.defaultParams()
                    val pObj = o.optJSONObject("params")
                    if (pObj != null) {
                        val keys = pObj.keys()
                        while (keys.hasNext()) {
                            val k = keys.next()
                            params[k] = pObj.optDouble(k, params[k] ?: 0.0)
                        }
                    }
                    val tasks = mutableSetOf<String>()
                    val tArr = o.optJSONArray("completedTaskIds")
                    if (tArr != null) {
                        for (ti in 0 until tArr.length()) tasks.add(tArr.getString(ti))
                    }
                    val measurements = mutableListOf<MeasurementRow>()
                    val mArr = o.optJSONArray("measurements")
                    if (mArr != null) {
                        for (mi in 0 until mArr.length()) {
                            val mo = mArr.getJSONObject(mi)
                            val vals = linkedMapOf<String, String>()
                            val vo = mo.optJSONObject("values")
                            if (vo != null) {
                                val vKeys = vo.keys()
                                while (vKeys.hasNext()) {
                                    val vk = vKeys.next()
                                    vals[vk] = vo.optString(vk, "")
                                }
                            }
                            measurements.add(
                                MeasurementRow(
                                    index = mo.optInt("index", mi + 1),
                                    simTimeSec = mo.optDouble("simTimeSec", 0.0),
                                    note = mo.optString("note", ""),
                                    values = vals
                                )
                            )
                        }
                    }
                    val journal = mutableListOf<ChangeLogEntry>()
                    val jArr = o.optJSONArray("journal")
                    if (jArr != null) {
                        for (ji in 0 until jArr.length()) {
                            val jo = jArr.getJSONObject(ji)
                            journal.add(
                                ChangeLogEntry(
                                    id = jo.optString("id", "log_$ji"),
                                    simTimeSec = jo.optDouble("simTimeSec", 0.0),
                                    wallTimeMs = jo.optLong("wallTimeMs", System.currentTimeMillis()),
                                    kind = jo.optString("kind", "PARAM"),
                                    title = jo.optString("title", ""),
                                    detail = jo.optString("detail", "")
                                )
                            )
                        }
                    }
                    out.add(
                        LabRoom(
                            id = o.optString("id", "room_$i"),
                            name = o.optString("name", topic.title),
                            studentName = o.optString("studentName", "Ученик"),
                            goal = o.optString("goal", ""),
                            topic = topic,
                            params = params,
                            completedTaskIds = tasks,
                            measurements = measurements,
                            journal = journal,
                            createdAt = o.optLong("createdAt", System.currentTimeMillis()),
                            updatedAt = o.optLong("updatedAt", System.currentTimeMillis())
                        )
                    )
                }
            } catch (_: Exception) {
                return mutableListOf()
            }
            return out
        }
    }
}
