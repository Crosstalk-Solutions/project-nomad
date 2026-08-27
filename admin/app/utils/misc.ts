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
