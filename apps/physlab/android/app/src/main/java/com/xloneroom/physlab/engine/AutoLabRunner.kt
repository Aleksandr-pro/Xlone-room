package com.xloneroom.physlab.engine

import com.xloneroom.physlab.model.AutoLabStep
import com.xloneroom.physlab.model.AutoLabWork
import com.xloneroom.physlab.model.TelemetrySnapshot
import kotlin.math.roundToInt

/**
 * Executes a prepared senior-school lab series entirely on-device.
 *
 * This deliberately uses the same [PhysicsEngine] as the interactive scene rather than
 * storing canned numbers. Each step starts from its declared experimental conditions,
 * advances the numerical model, then captures the real instrument snapshot.
 */
data class AutoLabSample(
    val index: Int,
    val step: AutoLabStep,
    val params: MutableMap<String, Double>,
    val snapshot: TelemetrySnapshot
)

data class AutoLabRunResult(
    val samples: List<AutoLabSample>,
    val finalParams: MutableMap<String, Double>
)

object AutoLabRunner {
    private const val DT = 0.02

    fun run(lab: AutoLabWork): AutoLabRunResult {
        val engine = PhysicsEngine(lab.topic)
        val samples = mutableListOf<AutoLabSample>()
        var finalParams = lab.topic.defaultParams()

        lab.steps.forEachIndexed { index, step ->
            val params = lab.topic.defaultParams().apply { putAll(step.params) }
            engine.reset(lab.topic, params)
            val ticks = (step.durationSec / DT).roundToInt().coerceAtLeast(1)
            repeat(ticks) { engine.step(DT, params) }

            samples += AutoLabSample(
                index = index + 1,
                step = step,
                params = params.toMutableMap(),
                snapshot = engine.captureTelemetry(params)
            )
            finalParams = params
        }

        return AutoLabRunResult(samples = samples, finalParams = finalParams)
    }
}
