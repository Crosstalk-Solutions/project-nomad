import logger from '@adonisjs/core/services/logger'
import KVStore from '#models/kv_store'
import { RAG_MIN_FINAL_SCORE } from '../../constants/ollama.js'
import { parseMinRelevance } from './misc.js'

/**
 * Resolves the user's retrieval relevance floor (`rag.minRelevance`), cached.
 *
 * Read on every chat turn, changed roughly never, so a KV round-trip per turn
 * would be pure overhead on the critical path. Cached at module scope rather
 * than on a service instance: NOMAD's services are `@inject()` but are not
 * registered as singletons, so instance state lives and dies with a single
 * request — which is why ContextWindowService's "memoized for the process
 * lifetime" memo isn't, and why its invalidate() never had a caller to matter to.
 *
 * Belt and braces, mirroring the assistant-name cache in config/inertia.ts: the
 * TTL bounds how stale this can get if an invalidation is ever missed, and
 * SystemService.updateSetting calls invalidateMinRelevanceCache() so the common
 * case takes effect immediately.
 */
const CACHE_TTL_MS = 60_000

let cache: { value: number; expiresAt: number } | null = null

export function invalidateMinRelevanceCache(): void {
  cache = null
}

/** The relevance floor to apply to this turn's retrieval. */
export async function resolveMinFinalScore(): Promise<number> {
  const now = Date.now()
  if (cache && now < cache.expiresAt) return cache.value

  let raw: string | null = null
  try {
    raw = await KVStore.getValue('rag.minRelevance')
  } catch (error) {
    // A KV read failure must not take retrieval out, and must not be cached —
    // fall back to the default and let the next turn try again.
    logger.warn(
      `[RAG] Failed to read rag.minRelevance, using ${RAG_MIN_FINAL_SCORE}: ${error instanceof Error ? error.message : error}`
    )
    return RAG_MIN_FINAL_SCORE
  }

  const value = parseMinRelevance(raw, RAG_MIN_FINAL_SCORE)
  cache = { value, expiresAt: now + CACHE_TTL_MS }
  return value
}
