import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import os from 'node:os'
import KVStore from '#models/kv_store'
import { OllamaService } from '#services/ollama_service'
import { SystemService } from '#services/system_service'
import {
  UNKNOWN_BACKEND_CONTEXT,
  computeKvBytesPerToken,
  estimateKvBytesPerToken,
  parseParameterBillions,
  parseUserContextCap,
  resolveContextWindow,
  type ContextWindowDecision,
} from '../utils/context_window.js'

/**
 * Decides how large a context window each chat model gets, and then holds that
 * answer still.
 *
 * The "holds it still" part is the whole point. Ollama unloads and reloads a
 * model whenever a request asks for a different `num_ctx` than the loaded
 * instance — so a window that grew with the conversation would stall a turn and
 * throw away the KV cache exactly when the conversation got interesting. The
 * decision is therefore made once per model and memoized for the process
 * lifetime; it is a property of (model, hardware), not of the current prompt.
 *
 * Inputs, in decreasing order of authority:
 *   - the user's cap (`ai.contextWindow`), which can only lower the result
 *   - the model's trained context length, from /api/show `model_info`
 *   - what the hardware can actually afford, from the exact per-token KV cost in
 *     the GGUF metadata against detected VRAM (or a share of system RAM)
 */
@inject()
export class ContextWindowService {
  private decisions: Map<string, Promise<ContextWindowDecision>> = new Map()
  private availableBytes: Promise<number | undefined> | null = null

  constructor(
    private ollamaService: OllamaService,
    private systemService: SystemService
  ) {}

  /**
   * The context window to request for `model`. Memoized — repeat calls within a
   * process return the identical number, which is what keeps the model loaded.
   */
  async windowFor(model: string): Promise<number> {
    return (await this.decisionFor(model)).contextWindow
  }

  async decisionFor(model: string): Promise<ContextWindowDecision> {
    const cached = this.decisions.get(model)
    if (cached) return cached

    const pending = this._resolve(model).catch((error) => {
      logger.warn(
        `[ContextWindow] Falling back to ${UNKNOWN_BACKEND_CONTEXT} for ${model}: ${error instanceof Error ? error.message : error}`
      )
      return { contextWindow: UNKNOWN_BACKEND_CONTEXT, limitedBy: 'default' as const }
    })
    this.decisions.set(model, pending)
    return pending
  }

  private async _resolve(model: string): Promise<ContextWindowDecision> {
    const [info, userCapRaw] = await Promise.all([
      this.ollamaService.getModelInfo(model),
      KVStore.getValue('ai.contextWindow'),
    ])
    const userCap = parseUserContextCap(userCapRaw)

    // No /api/show means a non-Ollama backend, which sets its context at server
    // start and ignores anything we send. Budget against a conservative value so
    // the prompt planner still bounds itself rather than trusting the backend to
    // truncate gracefully — it won't; it will truncate silently.
    if (!info.contextLength && !info.rawModelInfo) {
      const decision: ContextWindowDecision = {
        contextWindow: userCap ?? UNKNOWN_BACKEND_CONTEXT,
        limitedBy: userCap ? 'user' : 'default',
      }
      logger.info(
        `[ContextWindow] ${model}: no model metadata available, budgeting at ${decision.contextWindow}`
      )
      return decision
    }

    const kvBytesPerToken =
      computeKvBytesPerToken(info.rawModelInfo) ??
      estimateKvBytesPerToken(parseParameterBillions(info.parameterSize, model))

    const decision = resolveContextWindow({
      modelMaxCtx: info.contextLength,
      modelfileNumCtx: info.modelfileNumCtx,
      kvBytesPerToken,
      availableBytes: await this._availableBytes(),
      modelBytes: await this._modelBytes(model),
      userCap,
    })

    logger.info(
      `[ContextWindow] ${model}: ${decision.contextWindow} tokens (limited by ${decision.limitedBy}; ` +
        `${(kvBytesPerToken / 1024).toFixed(0)} KiB/token KV` +
        `${decision.affordableTokens !== undefined ? `, ~${decision.affordableTokens} affordable` : ''})`
    )
    return decision
  }

  /**
   * Memory available for inference, in bytes.
   *
   * Prefers the VRAM figure Ollama itself reports at startup — it is the number
   * that actually governs whether a window fits, and it already accounts for
   * whichever device Ollama chose. Falls back to a conservative share of system
   * RAM for CPU-only hosts, which is the low end of the hardware NOMAD targets
   * and precisely where getting this wrong hurts most.
   */
  private async _availableBytes(): Promise<number | undefined> {
    if (!this.availableBytes) {
      this.availableBytes = (async () => {
        try {
          const compute = await this.systemService.getOllamaInferenceComputeFromLogs()
          if (compute && compute.vramMiB > 0) {
            return compute.vramMiB * 1024 * 1024
          }
        } catch (error) {
          logger.debug(
            `[ContextWindow] GPU probe failed, assuming CPU inference: ${error instanceof Error ? error.message : error}`
          )
        }
        // CPU inference shares host RAM with MySQL, Redis, Qdrant and every other
        // container on the box, so claim only a modest slice of it.
        return os.totalmem() * CPU_RAM_SHARE
      })()
    }
    return this.availableBytes
  }

  private async _modelBytes(model: string): Promise<number | undefined> {
    try {
      const models = await this.ollamaService.getModels(true)
      return models.find((m) => m.name === model)?.size || undefined
    } catch {
      return undefined
    }
  }

  /** Drop memoized decisions — call when the backend or the user's cap changes. */
  invalidate(): void {
    this.decisions.clear()
    this.availableBytes = null
  }
}

/**
 * Share of system RAM assumed available for CPU inference. The rest of the NOMAD
 * stack (MySQL, Redis, Qdrant, Kiwix, the admin app itself) lives in the same
 * pool, and a machine that starts swapping is worse than one with a small window.
 */
const CPU_RAM_SHARE = 0.5
