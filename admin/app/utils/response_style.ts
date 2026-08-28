import logger from '@adonisjs/core/services/logger'
import KVStore from '#models/kv_store'
import { DEFAULT_RESPONSE_STYLE } from '../../constants/ollama.js'
import type { ResponseStyle } from '../../types/ollama.js'
import { parseResponseStyle } from './sampler.js'

/**
 * Resolves the user's Response Style (`ai.responseStyle`), cached.
 *
 * Same shape and same reasoning as the relevance-floor cache next door: read on
 * every chat turn, changed roughly never, and NOMAD's services are `@inject()`
 * but not registered as singletons, so caching on a service instance would give
 * a cache that lives and dies inside one request.
 *
 * The TTL bounds how stale this gets if an invalidation is ever missed;
 * SystemService.updateSetting calls invalidateResponseStyleCache() so the common
 * case takes effect on the next turn rather than a minute later.
 */
const CACHE_TTL_MS = 60_000

let cache: { value: ResponseStyle; expiresAt: number } | null = null

export function invalidateResponseStyleCache(): void {
  cache = null
}

/** The response style to sample this turn under. */
export async function resolveResponseStyle(): Promise<ResponseStyle> {
  const now = Date.now()
  if (cache && now < cache.expiresAt) return cache.value

  let raw: string | null = null
  try {
    raw = await KVStore.getValue('ai.responseStyle')
  } catch (error) {
    // A KV read failure must not take chat out, and must not be cached — fall
    // back to the default and let the next turn try again.
    logger.warn(
      `[Ollama] Failed to read ai.responseStyle, using ${DEFAULT_RESPONSE_STYLE}: ${error instanceof Error ? error.message : error}`
    )
    return DEFAULT_RESPONSE_STYLE
  }

  const value = parseResponseStyle(raw)
  cache = { value, expiresAt: now + CACHE_TTL_MS }
  return value
}
