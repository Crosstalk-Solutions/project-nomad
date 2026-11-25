/**
 * Pure helpers for deciding which inference backend serves a request.
 *
 * NOMAD historically had exactly one backend: the local `nomad_ollama`
 * container, or — when `ai.remoteOllamaUrl` is set — a remote server instead.
 * A remote server that is switched off, asleep or out of range therefore took
 * the AI Assistant down with it, even on a host perfectly able to answer by
 * itself. These helpers add a third outcome: the remote is configured but
 * unreachable, so the local container stands in until it comes back.
 *
 * Kept free of KVStore, Docker and HTTP so they run under bare `node --test`,
 * the same convention as `context_window.ts`. The service supplies the facts;
 * everything here is a function of its arguments.
 */

/**
 * - `local`: no remote server configured; the local container is the backend.
 * - `remote`: a remote server is configured and in use.
 * - `fallback`: a remote server is configured but unreachable, and the local
 *   container is standing in for it.
 */
export type AiBackendKind = 'local' | 'remote' | 'fallback'

export type AiBackend = {
  kind: AiBackendKind
  /** Base URL with no trailing slash. */
  baseUrl: string
}

/** How long a reachability answer is trusted before the remote is probed again. */
export const REMOTE_REACHABILITY_TTL_MS = 15_000

/** Probe timeout. Short: every chat turn behind a dead remote waits this long at most once per TTL. */
export const REMOTE_PROBE_TIMEOUT_MS = 2_500

export function normalizeBaseUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim().replace(/\/+$/, '')
  return trimmed === '' ? null : trimmed
}

export type ChooseBackendInputs = {
  /** `ai.remoteOllamaUrl`, if configured. */
  remoteUrl: string | null | undefined
  /** URL of the local Ollama container, if one is installed. */
  localUrl: string | null | undefined
  /** `ai.remoteFallbackEnabled`. */
  fallbackEnabled: boolean
  /**
   * Whether the remote answered its last probe. `undefined` means "not probed",
   * which is treated as reachable: without fallback enabled nobody probes, and
   * the remote is simply used as it always was.
   */
  remoteReachable?: boolean
}

/**
 * Pick the backend for a request. Returns null only when there is nothing to
 * talk to at all (no remote configured and no local container installed).
 *
 * The remote always wins while it is reachable — that is what "automatic
 * return" means: no state to reset, the next request after the remote comes
 * back simply sees `remoteReachable: true` again.
 */
export function chooseChatBackend(inputs: ChooseBackendInputs): AiBackend | null {
  const remoteUrl = normalizeBaseUrl(inputs.remoteUrl)
  const localUrl = normalizeBaseUrl(inputs.localUrl)

  if (!remoteUrl) {
    return localUrl ? { kind: 'local', baseUrl: localUrl } : null
  }

  const remoteDown = inputs.remoteReachable === false
  if (remoteDown && inputs.fallbackEnabled && localUrl) {
    return { kind: 'fallback', baseUrl: localUrl }
  }

  // Remote reachable, or unreachable with nothing to fall back to: keep using
  // it, so the failure the user sees names the server they configured.
  return { kind: 'remote', baseUrl: remoteUrl }
}

/**
 * Which model answers while the local container stands in for the remote.
 *
 * The two machines hold different models — the point of a remote server is
 * usually that it runs something this host cannot. So the model the user picked
 * may not exist locally:
 *
 *   1. the requested model, when it is installed locally too;
 *   2. otherwise the configured stand-in (`ai.remoteFallbackModel`), when that
 *      is installed locally;
 *   3. otherwise the requested model unchanged, so the backend's own "model not
 *      found" error surfaces rather than a silent swap to something arbitrary.
 */
export function pickFallbackModel(inputs: {
  requested: string
  localModels: string[]
  standIn: string | null | undefined
}): { model: string; substituted: boolean } {
  const { requested, localModels } = inputs
  if (localModels.includes(requested)) {
    return { model: requested, substituted: false }
  }
  const standIn = typeof inputs.standIn === 'string' ? inputs.standIn.trim() : ''
  if (standIn && localModels.includes(standIn)) {
    return { model: standIn, substituted: standIn !== requested }
  }
  return { model: requested, substituted: false }
}

/**
 * Remembers whether the remote answered recently, so a dead remote costs one
 * probe timeout per TTL rather than one per request — and so that a remote that
 * comes back is noticed within one TTL without anyone resetting anything.
 *
 * Keyed by URL: changing `ai.remoteOllamaUrl` must not inherit the previous
 * server's verdict.
 */
export class ReachabilityCache {
  private entry: { url: string; reachable: boolean; expiresAt: number } | null = null
  private inFlight: { url: string; promise: Promise<boolean> } | null = null

  constructor(
    private ttlMs: number = REMOTE_REACHABILITY_TTL_MS,
    private now: () => number = Date.now
  ) {}

  /** Cached verdict for `url`, or undefined when there is none or it has expired. */
  peek(url: string): boolean | undefined {
    if (!this.entry || this.entry.url !== url) return undefined
    if (this.now() >= this.entry.expiresAt) return undefined
    return this.entry.reachable
  }

  set(url: string, reachable: boolean): void {
    this.entry = { url, reachable, expiresAt: this.now() + this.ttlMs }
  }

  /**
   * Cached verdict if fresh, otherwise run `probe` once. Concurrent callers for
   * the same URL share a single probe.
   */
  async check(url: string, probe: (url: string) => Promise<boolean>): Promise<boolean> {
    const cached = this.peek(url)
    if (cached !== undefined) return cached
    if (this.inFlight && this.inFlight.url === url) return this.inFlight.promise

    const promise = (async () => {
      let reachable = false
      try {
        reachable = await probe(url)
      } catch {
        reachable = false
      }
      this.set(url, reachable)
      return reachable
    })()
    this.inFlight = { url, promise }
    try {
      return await promise
    } finally {
      if (this.inFlight?.promise === promise) this.inFlight = null
    }
  }

  clear(): void {
    this.entry = null
    this.inFlight = null
  }
}

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
])

/**
 * Whether an error means "could not reach the server" as opposed to "the server
 * answered with an error". Only the former says anything about reachability: a
 * 404 for a missing model or a 500 from a bad request comes from a live server.
 *
 * Walks `cause` because fetch (undici) wraps the socket error in a TypeError
 * ("fetch failed"), and the OpenAI and Ollama SDKs wrap that again.
 */
export function isConnectionError(error: unknown): boolean {
  let current: any = error
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current.code === 'string' && CONNECTION_ERROR_CODES.has(current.code)) return true
    // axios: a request was made but no response arrived.
    if (current.isAxiosError === true && current.response === undefined) return true
    // OpenAI SDK connection failures.
    const name = typeof current.name === 'string' ? current.name : ''
    if (name === 'APIConnectionError' || name === 'APIConnectionTimeoutError') return true
    if (current instanceof TypeError && current.message === 'fetch failed') return true
    current = current.cause
  }
  return false
}

/** One-line explanation shown under an answer the stand-in produced. */
export function fallbackNoticeMessage(inputs: {
  requestedModel: string
  answeredBy: string
  substituted: boolean
}): string {
  return inputs.substituted
    ? `The remote AI server could not be reached, so this reply came from "${inputs.answeredBy}" on this machine instead of "${inputs.requestedModel}".`
    : `The remote AI server could not be reached, so this reply came from "${inputs.answeredBy}" on this machine.`
}
