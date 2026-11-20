import logger from '@adonisjs/core/services/logger'
import KVStore from '#models/kv_store'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import {
  REMOTE_PROBE_TIMEOUT_MS,
  ReachabilityCache,
  chooseChatBackend,
  normalizeBaseUrl,
  type AiBackend,
} from '../utils/ai_backend.js'

/**
 * Resolves which inference backend serves the current request: the local
 * `nomad_ollama` container, the remote server in `ai.remoteOllamaUrl`, or —
 * with `ai.remoteFallbackEnabled` on and the remote unreachable — the local
 * container standing in for it.
 *
 * Module scope rather than a service instance, for the reason spelled out in
 * rag_relevance.ts: NOMAD's services are `@inject()` but not singletons, so
 * instance state dies with the request. One chat turn constructs several
 * OllamaService instances (controller, RAG pipeline, context-window resolver);
 * they must all agree on the backend, and a dead remote must not cost each of
 * them its own probe timeout. The reachability verdict is therefore cached here
 * for a short TTL and shared.
 */
const remoteReachability = new ReachabilityCache()
const localReachability = new ReachabilityCache()

/** Whether `baseUrl` answers at all. /v1/models is served by Ollama, LM Studio, llama.cpp and vLLM alike. */
async function probeBackend(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(REMOTE_PROBE_TIMEOUT_MS),
    })
    return response.ok
  } catch {
    return false
  }
}

/** URL of the local Ollama container, ignoring any remote configuration. */
export async function getLocalOllamaUrl(): Promise<string | null> {
  // Imported lazily, as OllamaService did before this module existed:
  // docker_service pulls in most of the app and is not needed until first use.
  const { DockerService } = await import('./docker_service.js')
  const dockerService = new DockerService()
  return normalizeBaseUrl(await dockerService.getLocalServiceURL(SERVICE_NAMES.OLLAMA))
}

export async function isRemoteFallbackEnabled(): Promise<boolean> {
  return (await KVStore.getValue('ai.remoteFallbackEnabled')) === true
}

/**
 * The backend to use right now, or null when there is nothing to talk to.
 *
 * With fallback off this performs no probing and returns exactly what the
 * pre-fallback code did: the remote URL when set, else the local container.
 */
export async function resolveChatBackend(): Promise<AiBackend | null> {
  const remoteUrl = normalizeBaseUrl(await KVStore.getValue('ai.remoteOllamaUrl'))

  if (!remoteUrl) {
    const localUrl = await getLocalOllamaUrl()
    return chooseChatBackend({ remoteUrl: null, localUrl, fallbackEnabled: false })
  }

  // Fallback off: the remote is the backend, full stop. The local container is
  // not even looked up, exactly as before this module existed.
  const fallbackEnabled = await isRemoteFallbackEnabled()
  if (!fallbackEnabled) {
    return chooseChatBackend({ remoteUrl, localUrl: null, fallbackEnabled })
  }

  const localUrl = await getLocalOllamaUrl()
  if (!localUrl) {
    return chooseChatBackend({ remoteUrl, localUrl, fallbackEnabled })
  }

  const remoteReachable = await remoteReachability.check(remoteUrl, probeBackend)
  if (remoteReachable) {
    return chooseChatBackend({ remoteUrl, localUrl, fallbackEnabled, remoteReachable })
  }

  // The remote is down. Only stand in for it if the local container is really
  // there to answer — otherwise the user trades an accurate "remote server
  // unreachable" for a confusing error about a container they may never have installed.
  const localReachable = await localReachability.check(localUrl, probeBackend)
  const backend = chooseChatBackend({
    remoteUrl,
    localUrl: localReachable ? localUrl : null,
    fallbackEnabled,
    remoteReachable,
  })
  if (backend?.kind === 'fallback') {
    logger.info(
      `[AiBackend] Remote AI server ${remoteUrl} is unreachable; using the local Ollama container until it returns.`
    )
  } else {
    logger.warn(
      `[AiBackend] Remote AI server ${remoteUrl} is unreachable and the local Ollama container did not answer either; fallback is not possible.`
    )
  }
  return backend
}

/**
 * Record that a request to the remote failed at the connection level, so the
 * next request falls back immediately instead of waiting out a stale "reachable"
 * verdict. A no-op unless `url` is the currently configured remote.
 */
export function markRemoteUnreachable(url: string): void {
  const normalized = normalizeBaseUrl(url)
  if (normalized) remoteReachability.set(normalized, false)
}

/**
 * Record that the remote just answered, so a fallback ends at once rather than
 * when the cached "unreachable" verdict expires.
 */
export function markRemoteReachable(url: string): void {
  const normalized = normalizeBaseUrl(url)
  if (normalized) remoteReachability.set(normalized, true)
}

/** Forget cached verdicts — call when the remote URL or the fallback switch changes. */
export function invalidateAiBackendCache(): void {
  remoteReachability.clear()
  localReachability.clear()
}
