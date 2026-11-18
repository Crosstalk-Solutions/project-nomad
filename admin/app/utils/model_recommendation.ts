/**
 * Pure helpers for choosing which catalog models to recommend (#1477).
 *
 * The Easy Setup wizard used to offer the three most-pulled catalog models with
 * their first tag, whatever the hardware — so an 8 GB box could be offered a
 * model that never loads, or swaps until it is unusable, during first setup when
 * the user has no way to know better. Recommendation is now a function of the
 * same memory budget the context-window resolver uses.
 *
 * Kept out of OllamaService so it runs under bare `node --test`; the service
 * supplies the catalog (already ranked) and the budget.
 */
import type { NomadOllamaModel, NomadOllamaModelTag } from '../../types/ollama.js'
import {
  MEMORY_SAFETY_FRACTION,
  UNKNOWN_BACKEND_CONTEXT,
  estimateKvBytesPerToken,
  parseParameterBillions,
} from './context_window.js'

/** How many models the recommended list shows. */
export const RECOMMENDED_MODEL_COUNT = 3

/**
 * Tokens of KV cache to reserve on top of the weights when deciding whether a
 * tag fits. A model that only fits with a 0-token window is not a usable
 * recommendation; 8k is the modest window NOMAD falls back to when it knows
 * nothing else, so reserving for it means "fits" also means "can hold a real
 * conversation".
 */
export const RECOMMENDATION_CONTEXT_TOKENS = UNKNOWN_BACKEND_CONTEXT

/**
 * Parse a catalog tag size ("4.7GB", "5.1 GB", "622MB") into bytes.
 *
 * The catalog mirrors ollama.com, which formats sizes in decimal units, so a GB
 * here is 10^9 bytes. Returns undefined for anything unparseable — an empty
 * string, a missing field, or a unit we don't recognise — so the caller can
 * tell "unknown" apart from "small".
 */
export function parseTagSizeBytes(size: string | null | undefined): number | undefined {
  if (typeof size !== 'string') return undefined
  const match = size.trim().match(/^([\d.]+)\s*(KB|MB|GB|TB)$/i)
  if (!match) return undefined
  const value = Number.parseFloat(match[1])
  if (!Number.isFinite(value) || value <= 0) return undefined
  const multiplier = { KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }[
    match[2].toUpperCase() as 'KB' | 'MB' | 'GB' | 'TB'
  ]
  return value * multiplier
}

/**
 * Bytes a tag needs to be usable: its weights plus a KV cache for
 * RECOMMENDATION_CONTEXT_TOKENS. The per-token KV cost is estimated from the
 * parameter count in the tag name, using the same deliberately pessimistic
 * table the context-window resolver falls back to (an unknown size is budgeted
 * as an 8B model).
 */
export function requiredBytesForTag(sizeBytes: number, tagName: string): number {
  const kvPerToken = estimateKvBytesPerToken(parseParameterBillions(undefined, tagName))
  return sizeBytes + kvPerToken * RECOMMENDATION_CONTEXT_TOKENS
}

/**
 * Whether a tag is one of Ollama's default builds — `latest` or a bare size like
 * `8b`, `0.6b`, `e4b`, `8x7b` — rather than an explicit quantization variant
 * (`8b-instruct-q8_0`, `8b-text-q4_1`, `fp16`, ...).
 *
 * The catalog lists every variant. Picking "the largest tag that fits" across
 * all of them would recommend an fp16 8B on a 24 GB card (a 16 GB download that
 * runs slower than a q4 of a bigger model) or a base `-text-` model that cannot
 * chat. The default builds are the instruct models at Ollama's chosen
 * quantization, so "largest default tag that fits" means "biggest parameter
 * count that fits", which is what a user means by it.
 */
export function isDefaultTag(tagName: string): boolean {
  const suffix = tagName.includes(':') ? tagName.slice(tagName.indexOf(':') + 1) : 'latest'
  return suffix === 'latest' || /^[a-z]?\d+(\.\d+)?(x\d+(\.\d+)?)?[bm]$/i.test(suffix)
}

export type ModelRecommendationResult = {
  models: NomadOllamaModel[]
  /** True when a budget was known and no candidate model had a tag that fits it. */
  noneFit: boolean
}

/**
 * Choose up to `count` recommended models from a catalog already ranked best
 * first (by pulls), each carrying exactly one tag — the one to recommend.
 *
 * With no budget (remote Ollama, probe failed) this is the old behaviour: the
 * first `count` models with their first tag. With a budget, each model gets the
 * largest tag whose weights plus KV reserve fit in `budgetBytes *
 * MEMORY_SAFETY_FRACTION` (the same safety margin the context resolver applies),
 * preferring Ollama's default builds; models with nothing that fits are skipped
 * and the next-ranked model takes their place.
 *
 * Tags with an unknown size are treated as not known to fit, but only when the
 * model has at least one tag whose size *is* known. A model whose catalog entry
 * carries no usable sizes at all keeps its first tag, as before — dropping it
 * would empty the list whenever the catalog omits sizes, which is worse than not
 * filtering.
 */
export function selectRecommendedModels(
  rankedModels: NomadOllamaModel[],
  budgetBytes: number | undefined,
  count: number = RECOMMENDED_MODEL_COUNT
): ModelRecommendationResult {
  const firstTagOnly = (model: NomadOllamaModel): NomadOllamaModel => ({
    ...model,
    tags: model.tags && model.tags.length > 0 ? [model.tags[0]] : [],
  })

  if (!budgetBytes || !Number.isFinite(budgetBytes) || budgetBytes <= 0) {
    return { models: rankedModels.slice(0, count).map(firstTagOnly), noneFit: false }
  }

  const usable = budgetBytes * MEMORY_SAFETY_FRACTION
  const chosen: NomadOllamaModel[] = []

  for (const model of rankedModels) {
    if (chosen.length >= count) break
    const tags = model.tags ?? []
    const sized = tags
      .map((tag) => ({ tag, bytes: parseTagSizeBytes(tag.size) }))
      .filter((t): t is { tag: NomadOllamaModelTag; bytes: number } => t.bytes !== undefined)

    if (sized.length === 0) {
      chosen.push(firstTagOnly(model))
      continue
    }

    const fitting = sized.filter((t) => requiredBytesForTag(t.bytes, t.tag.name) <= usable)
    if (fitting.length === 0) continue

    const defaults = fitting.filter((t) => isDefaultTag(t.tag.name))
    const pool = defaults.length > 0 ? defaults : fitting
    // Largest first; on a tie prefer an explicit size tag over `latest`, so the
    // UI says what is actually being downloaded.
    const best = pool.reduce((a, b) => {
      if (b.bytes !== a.bytes) return b.bytes > a.bytes ? b : a
      return a.tag.name.endsWith(':latest') && !b.tag.name.endsWith(':latest') ? b : a
    })
    chosen.push({ ...model, tags: [best.tag] })
  }

  return { models: chosen, noneFit: chosen.length === 0 && rankedModels.length > 0 }
}
