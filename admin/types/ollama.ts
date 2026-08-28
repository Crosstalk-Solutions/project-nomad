export type NomadOllamaModel = {
  id: string
  name: string
  description: string
  estimated_pulls: string
  model_last_updated: string
  first_seen: string
  tags: NomadOllamaModelTag[]
}

export type NomadOllamaModelTag = {
  name: string
  size: string
  context: string
  input: string
  cloud: boolean
  thinking: boolean
}

export type NomadOllamaModelAPIResponse = {
  success: boolean
  message: string
  models: NomadOllamaModel[]
}

export type OllamaChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type OllamaChatRequest = {
  model: string
  messages: OllamaChatMessage[]
  stream?: boolean
  sessionId?: number
  // Effective thinking preference for this request (per-model override or global default).
  think?: boolean
  collection?: string
}

export type OllamaChatResponse = {
  model: string
  created_at: string
  message: {
    role: string
    content: string
  }
  done: boolean
}

export type NomadInstalledModel = {
  name: string
  size: number
  digest?: string
  details?: Record<string, any>
  // Whether the model supports "thinking" (set by the installed-models endpoint enrichment).
  thinking?: boolean
}

export type NomadChatResponse = {
  message: { content: string; thinking?: string }
  done: boolean
  model: string
}

/**
 * The four sampler profiles offered as "Response Style" in Settings > Models.
 *
 * `auto` is the default and the only one that defers to the model: a value the
 * model author baked into their modelfile wins over NOMAD's baseline, key by
 * key. `focused` and `creative` are deliberate user overrides and replace those
 * values wholesale. `off` sends no sampler settings at all, reproducing the
 * pre-setting behaviour and giving a bug report somewhere clean to start.
 */
export type ResponseStyle = 'auto' | 'focused' | 'creative' | 'off'

/**
 * Resolved sampler settings for one chat request.
 *
 * Every field is optional because "unset" is meaningful: it means the backend
 * (or the model's own modelfile) decides, which is exactly what `off` wants and
 * what a missing key under `auto` falls back to.
 */
export type SamplerProfile = {
  temperature?: number
  /**
   * Nucleus cut for the native transport. The presets leave this at 1.0 and let
   * min_p do the truncating: min_p is relative to the top token's probability,
   * so it tightens on a confident distribution and loosens on an uncertain one,
   * where a fixed nucleus does neither. Stacking both mostly means the weaker
   * cut never fires.
   */
  topP?: number
  topK?: number
  /** The lever this whole setting exists for. Ollama's default is 0 (disabled). */
  minP?: number
  repeatPenalty?: number
  /**
   * `top_p` to send on the OpenAI-compatible transport, which has no min_p.
   *
   * Without this the compat path would inherit `topP: 1.0` from a profile whose
   * truncation lives entirely in min_p, and end up sampling the raw distribution
   * — strictly worse than the 0.9 Ollama's /v1 endpoint defaults to. So the
   * compat path substitutes a real nucleus value instead of dropping to nothing.
   */
  compatTopP?: number
}
