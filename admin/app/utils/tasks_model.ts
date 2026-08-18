import logger from '@adonisjs/core/services/logger'
import KVStore from '#models/kv_store'
import type { OllamaService } from '#services/ollama_service'
import { pickTasksModel } from './misc.js'

/**
 * Resolve the model to use for ancillary work — chat titles, suggestions, and
 * the per-turn retrieval query rewrite.
 *
 * Lifted out of ChatService so the RAG pipeline can use it too. The rewrite is
 * the ancillary call that matters most and was the one still running on the main
 * chat model: it happens on *every* turn, on the critical path, and it sends a
 * completely different prompt. With Ollama's default OLLAMA_NUM_PARALLEL=1 there
 * is a single slot, so that call evicted the chat model's cached prefix every
 * turn and guaranteed a full re-prefill of the conversation. Routing it to a
 * small dedicated model keeps the chat model's KV cache intact.
 *
 * Falls back to `fallback` when the setting is unset (preserving the previous
 * behaviour) or when the configured model is no longer installed. `installed` is
 * passed by callers that already listed models, to avoid a second round-trip.
 */
export async function resolveTasksModel(
  ollamaService: OllamaService,
  fallback: string | null,
  installed?: { name: string }[],
  logPrefix = '[TasksModel]'
): Promise<string | null> {
  let configured: string | null = null
  try {
    configured = await KVStore.getValue('ai.tasksModel')
  } catch (error) {
    logger.error(
      `${logPrefix} Failed to read ai.tasksModel: ${error instanceof Error ? error.message : error}`
    )
    return fallback
  }
  if (!configured?.trim()) {
    return fallback
  }

  let models = installed
  if (!models) {
    try {
      models = await ollamaService.getModels()
    } catch (error) {
      logger.error(
        `${logPrefix} Failed to list models while resolving the tasks model: ${error instanceof Error ? error.message : error}`
      )
      return fallback
    }
  }

  const { model, staleConfigured } = pickTasksModel(
    configured,
    (models ?? []).map((m) => m.name),
    fallback
  )
  if (staleConfigured) {
    logger.warn(
      `${logPrefix} Configured tasks model "${staleConfigured}" is not installed; falling back to "${fallback ?? 'none'}"`
    )
  }
  return model
}
