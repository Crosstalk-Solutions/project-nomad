import { EMBEDDING_MODEL_NAME, EMBEDDING_MODELS } from '../../constants/ollama.js'

export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
}

export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Resolve the knowledge-base embedding model from the `rag.embeddingModel`
 * setting. An unset or unknown value falls back to the default model, so an
 * unset setting leaves prior behaviour untouched.
 */
export function pickEmbeddingModel(configured: string | null | undefined) {
  const trimmed = configured?.trim()
  const name = trimmed && Object.hasOwn(EMBEDDING_MODELS, trimmed) ? trimmed : EMBEDDING_MODEL_NAME
  return { name, ...EMBEDDING_MODELS[name] }
}

/**
 * True for a model in EMBEDDING_MODELS, whose names don't all contain "embed"
 * (bge-m3). Keeps them out of chat model lists. Any tag of a listed model
 * counts (bge-m3:567m), as does the listed name itself.
 */
export function isEmbeddingModelName(model: string): boolean {
  return Object.hasOwn(EMBEDDING_MODELS, model) || Object.hasOwn(EMBEDDING_MODELS, model.split(':')[0])
}

/**
 * Whether an installed Ollama model (`installed`) can stand in for `wanted`.
 * nomic-embed-text has always been accepted under any tag; other models must
 * match exactly or as `:latest`, because other tags of the same family can be
 * different models entirely (qwen3-embedding:8b is 4096-wide, :0.6b is 1024).
 */
export function isInstalledTagOf(installed: string, wanted: string): boolean {
  const name = installed.toLowerCase()
  if (wanted === EMBEDDING_MODEL_NAME) return name.includes('nomic-embed-text')
  return name === wanted || name === `${wanted}:latest`
}

/**
 * Decide which model runs an ancillary AI task (chat titles, chat suggestions).
 *
 * `configured` is the user's `ai.tasksModel` setting. It only wins when the
 * model is still installed — a model can be deleted from /settings/models long
 * after it was picked here, and a request for a missing model 404s. In every
 * other case the caller's existing `fallback` applies, so an unset setting
 * leaves prior behaviour untouched.
 */
export function pickTasksModel(
  configured: string | null | undefined,
  installedNames: string[],
  fallback: string | null
): { model: string | null; staleConfigured: string | null } {
  const trimmed = configured?.trim()
  if (!trimmed) {
    return { model: fallback, staleConfigured: null }
  }
  if (installedNames.includes(trimmed)) {
    return { model: trimmed, staleConfigured: null }
  }
  return { model: fallback, staleConfigured: trimmed }
}

export function parseBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lower = value.toLowerCase()
    return lower === 'true' || lower === '1'
  }
  if (typeof value === 'number') {
    return value === 1
  }
  return false
}

/**
 * Interpret a stored `rag.minRelevance` value as a retrieval relevance floor.
 *
 * Pure, and separate from the cached KV read in rag_relevance.ts, for the same
 * reason pickTasksModel is separate from resolveTasksModel: every interesting
 * case here is a bad or absent value, and none of them need a database.
 *
 * Unset, empty, 'auto' and unparseable all mean "use the recommended default" —
 * a corrupt row must not silently disable filtering. An explicit 0 is different:
 * it is a real choice, and it turns the floor off.
 */
export function parseMinRelevance(raw: string | null | undefined, fallback: number): number {
  if (raw === null || raw === undefined) return fallback
  const trimmed = String(raw).trim()
  if (trimmed === '' || trimmed === 'auto') return fallback
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(1, Math.max(0, parsed))
}

/**
 * Apply the retrieval relevance floor to a reranked candidate list.
 *
 * Pure, and called from RagService.searchSimilarDocuments between reranking and
 * the source-diversity penalty. The ordering is the interesting part: the floor
 * is a judgement about *relevance*, and the reranked score is where that
 * judgement is best informed. Diversity is about *redundancy* — it multiplies by
 * 0.85^n per repeated source — so flooring afterwards would drop the fourth
 * chunk of the one document that actually answers the question and blame a knob
 * labelled "relevance" for it.
 *
 * An empty result is a real answer, not a failure: it means nothing retrieved
 * was relevant enough, and the caller should inject no context block at all
 * rather than hand the model passages it has to be talked out of using.
 */
export function applyRelevanceFloor<T extends { finalScore: number }>(
  results: T[],
  minFinalScore: number
): { survivors: T[]; belowFloor: number } {
  if (!(minFinalScore > 0)) return { survivors: results, belowFloor: 0 }
  const survivors = results.filter((r) => r.finalScore >= minFinalScore)
  return { survivors, belowFloor: results.length - survivors.length }
}
