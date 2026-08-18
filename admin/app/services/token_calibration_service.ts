import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import KVStore from '#models/kv_store'
import { clampRatio, updateEwma } from '../utils/token_estimate.js'

/**
 * Learns, per model, how far the token estimator is off — and corrects it.
 *
 * The estimator in `token_estimate.ts` cannot tokenize exactly (no vocabulary,
 * no tokenize endpoint, offline appliance). But every chat response already
 * carries the exact answer: Ollama reports `prompt_eval_count`, the true token
 * count of the prompt we just sent. That is free ground truth on every single
 * turn, and before this it was thrown away.
 *
 * So: record what we estimated, compare it to what the backend actually counted,
 * and fold `actual / estimated` into a per-model EWMA. The budget planner
 * multiplies by that factor from then on. Measured convergence is a couple of
 * turns, and it matters — Qwen tokenizes ~26% finer than Llama on the same text,
 * which no single global constant can absorb.
 *
 * Persisted as one JSON blob (`ai.tokenRatios`) rather than a key per model,
 * because KVStoreKey is a closed union. The data is pure cache: deleting the row
 * costs nothing but a short re-learn.
 */
@inject()
export class TokenCalibrationService {
  /** Model name -> learned correction factor. Authoritative once loaded. */
  private ratios: Map<string, number> = new Map()
  private loaded: Promise<void> | null = null
  /** Last persisted value per model, so we only write when the ratio really moved. */
  private persisted: Map<string, number> = new Map()

  /**
   * A ratio has to move by more than this before it earns a database write.
   * Once converged the factor barely twitches, and a row update per chat turn
   * would be pure noise on a machine that may be running from an SD card.
   */
  private static PERSIST_THRESHOLD = 0.02

  private async _load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = (async () => {
        try {
          const raw = await KVStore.getValue('ai.tokenRatios')
          if (!raw) return
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') {
            for (const [model, value] of Object.entries(parsed)) {
              if (typeof value === 'number' && Number.isFinite(value)) {
                const clamped = clampRatio(value)
                this.ratios.set(model, clamped)
                this.persisted.set(model, clamped)
              }
            }
          }
        } catch (error) {
          // Corrupt or hand-edited JSON. This is a cache; start over rather than
          // failing a chat request over it.
          logger.warn(
            `[TokenCalibration] Could not read stored ratios, starting fresh: ${error instanceof Error ? error.message : error}`
          )
        }
      })()
    }
    return this.loaded
  }

  /**
   * The correction factor to apply when estimating for `model`.
   * Returns 1 for a model we've never seen — an uncalibrated estimate, which is
   * still materially better than a fixed chars-per-token divisor.
   */
  async ratioFor(model: string): Promise<number> {
    await this._load()
    return this.ratios.get(model) ?? 1
  }

  /**
   * Record one observation.
   *
   * `estimatedTokens` must be the *uncalibrated* estimate for exactly the
   * messages that were sent — otherwise the factor gets applied twice and the
   * EWMA chases its own tail.
   */
  async record(model: string, estimatedTokens: number, actualTokens: number | undefined): Promise<void> {
    if (!actualTokens || !estimatedTokens || estimatedTokens <= 0 || actualTokens <= 0) return
    // Tiny prompts are dominated by chat-template overhead and teach us little
    // about how this model tokenizes real content.
    if (actualTokens < 32) return

    await this._load()

    const observed = clampRatio(actualTokens / estimatedTokens)
    const previous = this.ratios.get(model) ?? null
    const next = clampRatio(updateEwma(previous, observed))
    this.ratios.set(model, next)

    logger.debug(
      `[TokenCalibration] ${model}: estimated ${estimatedTokens}, actual ${actualTokens} ` +
        `(observed ${observed.toFixed(3)}, ratio ${next.toFixed(3)})`
    )

    const lastWritten = this.persisted.get(model)
    if (lastWritten === undefined || Math.abs(next - lastWritten) > TokenCalibrationService.PERSIST_THRESHOLD) {
      await this._persist(model, next)
    }
  }

  private async _persist(model: string, ratio: number): Promise<void> {
    try {
      const blob: Record<string, number> = {}
      for (const [name, value] of this.ratios) blob[name] = Number(value.toFixed(4))
      await KVStore.setValue('ai.tokenRatios', JSON.stringify(blob))
      this.persisted.set(model, ratio)
    } catch (error) {
      // Calibration is an optimization. Losing a write means a slightly worse
      // estimate next boot, never a failed chat.
      logger.warn(
        `[TokenCalibration] Failed to persist ratios: ${error instanceof Error ? error.message : error}`
      )
    }
  }
}
