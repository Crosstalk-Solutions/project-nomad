/**
 * Pure helpers for deciding which sampler settings a chat request carries.
 *
 * Kept out of OllamaService for the same reason `context_window.ts` is: every
 * interesting case here is a bad stored value or a model that declares its own
 * parameters, and none of them need Ollama, Docker or MySQL to exercise. The
 * service supplies the facts (what the stored setting says, what /api/show
 * returned); everything here is a function of its arguments.
 */
import { DEFAULT_RESPONSE_STYLE, SAMPLER_PRESETS } from '../../constants/ollama.js'
import type { ResponseStyle, SamplerProfile } from '../../types/ollama.js'

const RESPONSE_STYLES: ResponseStyle[] = ['auto', 'focused', 'creative', 'off']

/**
 * Interpret a stored `ai.responseStyle` value.
 *
 * Unset, empty and unrecognised all mean the default. A corrupt row must not
 * silently drop chat back to unsampled backend defaults, because that is the
 * failure this setting exists to fix and it would be invisible from the UI.
 * `off` is only ever reached by someone choosing it.
 */
export function parseResponseStyle(raw: string | null | undefined): ResponseStyle {
  if (raw === null || raw === undefined) return DEFAULT_RESPONSE_STYLE
  const trimmed = String(raw).trim().toLowerCase()
  if (!trimmed) return DEFAULT_RESPONSE_STYLE
  return (RESPONSE_STYLES as string[]).includes(trimmed)
    ? (trimmed as ResponseStyle)
    : DEFAULT_RESPONSE_STYLE
}

/**
 * Pull sampler values out of the `parameters` string /api/show returns (the
 * modelfile PARAMETER lines, e.g. `temperature                    0.6`).
 *
 * Sibling of `readModelfileNumCtx`, and there for a sharper reason than it: a
 * good number of Ollama library models ship author-tuned samplers (qwen3 sets
 * 0.6/0.95/20, deepseek-r1 sets 0.6), and stamping a generic house profile over
 * those would make exactly the models someone tuned carefully worse. Under the
 * `auto` style these values win, key by key.
 *
 * Repeated PARAMETER lines are legal in a modelfile and the last one wins in
 * Ollama, so the scan does not stop at the first match.
 */
export function readModelfileSamplers(parameters: unknown): SamplerProfile {
  const profile: SamplerProfile = {}
  if (typeof parameters !== 'string') return profile

  const keys: [RegExp, keyof SamplerProfile][] = [
    [/^\s*temperature\s+(-?[\d.]+)\s*$/gm, 'temperature'],
    [/^\s*top_p\s+(-?[\d.]+)\s*$/gm, 'topP'],
    [/^\s*top_k\s+(-?[\d.]+)\s*$/gm, 'topK'],
    [/^\s*min_p\s+(-?[\d.]+)\s*$/gm, 'minP'],
    [/^\s*repeat_penalty\s+(-?[\d.]+)\s*$/gm, 'repeatPenalty'],
  ]

  for (const [pattern, field] of keys) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(parameters)) !== null) {
      const value = Number.parseFloat(match[1])
      if (Number.isFinite(value) && value >= 0) profile[field] = value
    }
  }
  return profile
}

/**
 * The sampler settings to send for one request.
 *
 * `off` sends nothing. `auto` is NOMAD's baseline with the model author's own
 * values layered over it, which in practice means the model keeps its tuned
 * temperature and top_p and gains the min_p it was missing. `focused` and
 * `creative` are explicit user choices and replace the model's values outright,
 * because a style the user picked by name that quietly did nothing on half
 * their models would be worse than not offering it.
 *
 * A model that declares its own `top_p` under `auto` also gets it on the compat
 * transport: an author-set nucleus is a better substitute for the missing min_p
 * than the preset's generic fallback.
 */
export function resolveSamplerProfile(
  style: ResponseStyle,
  modelfileSamplers?: SamplerProfile
): SamplerProfile | undefined {
  if (style === 'off') return undefined

  const preset = SAMPLER_PRESETS[style]
  if (style !== 'auto') return { ...preset }

  const declared = modelfileSamplers ?? {}
  const merged: SamplerProfile = { ...preset, ...declared }
  if (declared.topP !== undefined) merged.compatTopP = declared.topP
  return merged
}

/**
 * Map a profile onto Ollama's native `options` keys.
 *
 * `temperature` is deliberately absent: it is carried on ChatInput itself, so an
 * explicit caller value (eval runs and the grammar-constrained task calls, both
 * of which pin it to 0) keeps beating whatever style the user has chosen.
 */
export function nativeSamplerOptions(profile: SamplerProfile | undefined): Record<string, number> {
  if (!profile) return {}
  const options: Record<string, number> = {}
  if (profile.topP !== undefined) options.top_p = profile.topP
  if (profile.topK !== undefined) options.top_k = profile.topK
  if (profile.minP !== undefined) options.min_p = profile.minP
  if (profile.repeatPenalty !== undefined) options.repeat_penalty = profile.repeatPenalty
  return options
}

/**
 * Map a profile onto the OpenAI-compatible endpoint's params.
 *
 * Only `top_p` survives the trip. min_p, top_k and repeat_penalty have no
 * equivalent there, and presence/frequency_penalty are not stand-ins for
 * repeat_penalty — they accumulate over the whole completion rather than a
 * 64-token window, so borrowing one to fake the other would punish a grounded
 * answer for citing the same identifier twice.
 *
 * `compatTopP` rather than `topP` is the value sent, for the reason documented
 * on the type: the presets set `topP: 1.0` and truncate with min_p, and passing
 * that through unchanged to a backend that drops min_p would leave the raw
 * distribution untruncated, which is worse than the default it replaced.
 */
export function compatSamplerParams(profile: SamplerProfile | undefined): Record<string, number> {
  if (!profile) return {}
  const params: Record<string, number> = {}
  const topP = profile.compatTopP ?? profile.topP
  if (topP !== undefined) params.top_p = topP
  return params
}
