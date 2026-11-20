import { AsyncLocalStorage } from 'node:async_hooks'
import logger from '@adonisjs/core/services/logger'
import KVStore from '#models/kv_store'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import {
  REMOTE_PROBE_TIMEOUT_MS,
  ReachabilityCache,
  chooseChatBackend,
  chooseEmbeddingBackend,
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

/**
 * Marks the current request as one that must not leave this machine (a
 * local-only chat). Async-local rather than a parameter because the backend is
 * chosen deep inside OllamaService, by several independently constructed
 * instances, none of which the controller can hand an argument to. Everything
 * awaited after enterLocalOnlyScope() — retrieval, the context-window resolver,
 * the chat call, the fire-and-forget title generation — inherits the mark.
 */
const localOnlyScope = new AsyncLocalStorage<{ localOnly: true }>()

export function enterLocalOnlyScope(): void {
  localOnlyScope.enterWith({ localOnly: true })
}

/** Run `fn` as a local-only request. For callers that have a closure to wrap. */
export function runLocalOnly<T>(fn: () => Promise<T>): Promise<T> {
  return localOnlyScope.run({ localOnly: true }, fn)
}

export function isLocalOnlyScope(): boolean {
  return localOnlyScope.getStore()?.localOnly === true
}

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

export async function isLocalEmbeddingsEnabled(): Promise<boolean> {
  return (await KVStore.getValue('rag.localEmbeddings')) === true
}

/**
 * Whether the local Ollama container has a job to do while a remote server is
 * configured: standing in when the remote is unreachable, or doing the
 * knowledge base's embedding. Either one means it must not be stopped.
 */
export async function shouldKeepLocalOllamaRunning(): Promise<boolean> {
  return (await isRemoteFallbackEnabled()) || (await isLocalEmbeddingsEnabled())
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

  // A local-only request never reaches the remote, and nothing below may
  // override that — not reachability, not the fallback switch.
  if (isLocalOnlyScope()) {
    const localUrl = await getLocalOllamaUrl()
    const backend = chooseChatBackend({
      remoteUrl,
      localUrl,
      fallbackEnabled: false,
      localOnly: true,
    })
    if (!backend) {
      logger.warn(
        '[AiBackend] Local-only request, but no local Ollama container is installed; refusing to use the remote AI server.'
      )
    }
    return backend
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
 * The backend that embeds knowledge-base text: the local container when
 * `rag.localEmbeddings` is on and a remote server is configured, otherwise
 * whatever chat uses. Null when local embedding is required but there is no
 * local container — see chooseEmbeddingBackend for why that is not a fallthrough.
 */
export async function resolveEmbeddingBackend(): Promise<AiBackend | null> {
  const remoteUrl = normalizeBaseUrl(await KVStore.getValue('ai.remoteOllamaUrl'))
  const localEmbeddings = remoteUrl ? await isLocalEmbeddingsEnabled() : false
  if (!remoteUrl || !localEmbeddings) {
    return resolveChatBackend()
  }
  const choice = chooseEmbeddingBackend({
    remoteUrl,
    localUrl: await getLocalOllamaUrl(),
    localEmbeddings,
  })
  if (choice.source === 'local') {
    return { kind: 'local', baseUrl: choice.baseUrl, forcedLocal: true }
  }
  logger.warn(
    '[AiBackend] rag.localEmbeddings is on, but no local Ollama container is installed; knowledge-base text will not be sent to the remote AI server instead.'
  )
  return null
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
