/**
 * Information-retrieval metrics for the RAG eval harness.
 *
 * Pure functions over ranked results — no I/O, no models, no clock. Everything
 * here is deterministic, which is the point: a change in these numbers is
 * unambiguously a change in the code, never in the weather.
 *
 * ## Two levels of measurement, and why both
 *
 * Retrieval returns *chunks*, but a golden answer lives in a *document*. The
 * two questions we care about are different, so they are measured differently:
 *
 * - **Document level** (recall, MRR, nDCG): "did the answer's document make it
 *   into the context at all, and how near the top?" Chunks are collapsed to
 *   their document, keeping each document's best rank.
 * - **Chunk level** (precision): "how much of what we injected is noise?" This
 *   is deliberately *not* deduped — five chunks from one irrelevant document
 *   cost five slots of a small model's context and should be counted five
 *   times.
 *
 * Reporting only one of these hides a real failure mode in the other.
 */

/** One retrieved chunk, reduced to what scoring needs. */
export type ScoredChunk = {
  /** Corpus document this chunk came from; null if it could not be resolved. */
  docId: string | null
  /** The pipeline's final (post-rerank) score. */
  score: number
  /** The raw pre-rerank cosine score, when available. */
  semanticScore?: number
}

export type RetrievalCase = {
  id: string
  tags: string[]
  /** Ranked chunks, best first, exactly as the pipeline returned them. */
  retrieved: ScoredChunk[]
  /** Documents that genuinely answer the question. */
  relevantDocIds: string[]
  /** True when the right behaviour is to retrieve nothing useful. */
  expectRefusal: boolean
}

/**
 * Collapse a ranked chunk list to a ranked document list, keeping each
 * document's best (earliest) position. Chunks with no resolvable document are
 * dropped — they still occupy a rank in the chunk-level metrics, but they
 * cannot be credited to any document.
 */
export function toDocumentRanking(retrieved: ScoredChunk[]): string[] {
  const seen = new Set<string>()
  const ranking: string[] = []
  for (const chunk of retrieved) {
    if (!chunk.docId || seen.has(chunk.docId)) continue
    seen.add(chunk.docId)
    ranking.push(chunk.docId)
  }
  return ranking
}

/**
 * Fraction of the relevant documents that appear within the top `k` chunks.
 *
 * Returns null when there are no relevant documents (an out-of-corpus case) —
 * recall is undefined there, and returning 0 would drag the mean down for
 * questions that are *supposed* to retrieve nothing.
 */
export function recallAtK(retrieved: ScoredChunk[], relevantDocIds: string[], k: number): number | null {
  if (relevantDocIds.length === 0) return null
  const relevant = new Set(relevantDocIds)
  const found = new Set<string>()
  for (const chunk of retrieved.slice(0, k)) {
    if (chunk.docId && relevant.has(chunk.docId)) found.add(chunk.docId)
  }
  return found.size / relevant.size
}

/**
 * 1 if *any* relevant document appears in the top `k`, else 0.
 *
 * Distinct from recall on multi-hop questions: finding one of two required
 * documents is a hit but only 0.5 recall. Reporting both is what separates
 * "found something" from "found enough to answer".
 */
export function hitRateAtK(retrieved: ScoredChunk[], relevantDocIds: string[], k: number): number | null {
  if (relevantDocIds.length === 0) return null
  const relevant = new Set(relevantDocIds)
  return retrieved.slice(0, k).some((c) => c.docId && relevant.has(c.docId)) ? 1 : 0
}

/**
 * Fraction of the top `k` *chunks* that come from a relevant document.
 *
 * Not deduped, on purpose — this measures context pollution, and a small model
 * drowning in four irrelevant chunks does not care that they share a source.
 * Denominator is min(k, retrieved.length) so a pipeline returning 2 good chunks
 * is not punished for the 3 it correctly declined to return.
 */
export function precisionAtK(retrieved: ScoredChunk[], relevantDocIds: string[], k: number): number | null {
  if (relevantDocIds.length === 0) return null
  const window = retrieved.slice(0, k)
  if (window.length === 0) return 0
  const relevant = new Set(relevantDocIds)
  const hits = window.filter((c) => c.docId && relevant.has(c.docId)).length
  return hits / window.length
}

/**
 * Reciprocal of the rank of the first relevant chunk (1-indexed); 0 if none.
 * Averaged over cases this is MRR.
 */
export function reciprocalRank(retrieved: ScoredChunk[], relevantDocIds: string[]): number | null {
  if (relevantDocIds.length === 0) return null
  const relevant = new Set(relevantDocIds)
  const idx = retrieved.findIndex((c) => c.docId && relevant.has(c.docId))
  return idx === -1 ? 0 : 1 / (idx + 1)
}

/**
 * Normalized discounted cumulative gain at `k`, over the **document** ranking,
 * with binary gain.
 *
 *   DCG@k  = Σ_{i=1..k}  rel_i / log2(i + 1)
 *   IDCG@k = Σ_{i=1..min(R, k)}  1 / log2(i + 1)        where R = |relevant|
 *   nDCG@k = DCG@k / IDCG@k
 *
 * The ideal ranking is defined against the *known* number of relevant documents
 * rather than against however many happened to be retrieved. That distinction
 * matters: normalizing against the retrieved set would score a run that found
 * one of three required documents, and ranked it first, as a perfect 1.0.
 *
 * This is the metric that catches "right documents, wrong order" — a reranking
 * regression that leaves recall untouched while pushing the answer to position
 * five, where a 1B model with a 2-result budget will never see it.
 */
export function ndcgAtK(retrieved: ScoredChunk[], relevantDocIds: string[], k: number): number | null {
  if (relevantDocIds.length === 0) return null
  const relevant = new Set(relevantDocIds)
  const docRanking = toDocumentRanking(retrieved).slice(0, k)

  let dcg = 0
  docRanking.forEach((docId, i) => {
    if (relevant.has(docId)) dcg += 1 / Math.log2(i + 2) // i is 0-indexed, so rank = i + 1
  })

  let idcg = 0
  for (let i = 0; i < Math.min(relevant.size, k); i++) {
    idcg += 1 / Math.log2(i + 2)
  }

  return idcg === 0 ? 0 : dcg / idcg
}

/**
 * Score separation: the gap between what relevant and irrelevant chunks score.
 *
 * This is how the similarity threshold gets calibrated with evidence instead of
 * intuition. If the relevant p10 sits below the irrelevant p90, no threshold
 * can cleanly separate them and the honest conclusion is that the *retriever*
 * needs work, not the cutoff.
 */
export type ScoreDistribution = {
  count: number
  min: number
  p10: number
  median: number
  p90: number
  max: number
  mean: number
}

export function describeScores(scores: number[]): ScoreDistribution | null {
  if (scores.length === 0) return null
  const sorted = [...scores].sort((a, b) => a - b)
  const pct = (p: number) => {
    // Nearest-rank percentile: no interpolation, so a reported value is always
    // a value that actually occurred.
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
    return sorted[idx]
  }
  return {
    count: sorted.length,
    min: sorted[0],
    p10: pct(10),
    median: pct(50),
    p90: pct(90),
    max: sorted[sorted.length - 1],
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
  }
}

/** Mean over the entries that are actually defined; null if none are. */
export function meanOf(values: Array<number | null>): number | null {
  const defined = values.filter((v): v is number => v !== null)
  if (defined.length === 0) return null
  return defined.reduce((a, b) => a + b, 0) / defined.length
}

export type RetrievalCaseResult = {
  id: string
  tags: string[]
  retrievedCount: number
  relevantDocIds: string[]
  retrievedDocIds: string[]
  expectRefusal: boolean
  recall: Record<number, number | null>
  hitRate: Record<number, number | null>
  precision: Record<number, number | null>
  ndcg: Record<number, number | null>
  reciprocalRank: number | null
  /** True when this case retrieved nothing at all. */
  empty: boolean
}

export type RetrievalAggregate = {
  cases: number
  /** Cases with at least one relevant document (i.e. excluding refusal cases). */
  answerable: number
  recall: Record<number, number | null>
  hitRate: Record<number, number | null>
  precision: Record<number, number | null>
  ndcg: Record<number, number | null>
  mrr: number | null
  /**
   * Fraction of *answerable* questions that retrieved nothing. A non-zero value
   * means the score threshold is filtering out real answers.
   */
  emptyRateOnAnswerable: number | null
  /**
   * Fraction of *out-of-corpus* questions that retrieved something anyway. This
   * is the other half of the threshold trade-off: context handed to the model
   * for a question the corpus cannot answer is exactly what produces a
   * confident, wrong reply.
   */
  nonEmptyRateOnRefusal: number | null
  relevantScores: ScoreDistribution | null
  irrelevantScores: ScoreDistribution | null
}

export const DEFAULT_K_VALUES = [1, 3, 5, 10]

export function scoreCase(c: RetrievalCase, kValues: number[] = DEFAULT_K_VALUES): RetrievalCaseResult {
  const byK = <T>(fn: (k: number) => T): Record<number, T> =>
    Object.fromEntries(kValues.map((k) => [k, fn(k)]))

  return {
    id: c.id,
    tags: c.tags,
    retrievedCount: c.retrieved.length,
    relevantDocIds: c.relevantDocIds,
    retrievedDocIds: toDocumentRanking(c.retrieved),
    expectRefusal: c.expectRefusal,
    recall: byK((k) => recallAtK(c.retrieved, c.relevantDocIds, k)),
    hitRate: byK((k) => hitRateAtK(c.retrieved, c.relevantDocIds, k)),
    precision: byK((k) => precisionAtK(c.retrieved, c.relevantDocIds, k)),
    ndcg: byK((k) => ndcgAtK(c.retrieved, c.relevantDocIds, k)),
    reciprocalRank: reciprocalRank(c.retrieved, c.relevantDocIds),
    empty: c.retrieved.length === 0,
  }
}

export function aggregate(
  cases: RetrievalCase[],
  results: RetrievalCaseResult[],
  kValues: number[] = DEFAULT_K_VALUES
): RetrievalAggregate {
  const answerable = results.filter((r) => !r.expectRefusal)
  const refusals = results.filter((r) => r.expectRefusal)

  const byK = (pick: (r: RetrievalCaseResult, k: number) => number | null): Record<number, number | null> =>
    Object.fromEntries(kValues.map((k) => [k, meanOf(results.map((r) => pick(r, k)))]))

  // Split every retrieved chunk's score by whether its document was relevant.
  // Refusal cases contribute only to the irrelevant side — by definition
  // nothing they retrieve is relevant, and that is precisely the population a
  // threshold needs to exclude.
  const relevantScores: number[] = []
  const irrelevantScores: number[] = []
  for (const c of cases) {
    const relevant = new Set(c.relevantDocIds)
    for (const chunk of c.retrieved) {
      const bucket = chunk.docId && relevant.has(chunk.docId) ? relevantScores : irrelevantScores
      bucket.push(chunk.semanticScore ?? chunk.score)
    }
  }

  return {
    cases: results.length,
    answerable: answerable.length,
    recall: byK((r, k) => r.recall[k]),
    hitRate: byK((r, k) => r.hitRate[k]),
    precision: byK((r, k) => r.precision[k]),
    ndcg: byK((r, k) => r.ndcg[k]),
    mrr: meanOf(results.map((r) => r.reciprocalRank)),
    emptyRateOnAnswerable:
      answerable.length === 0 ? null : answerable.filter((r) => r.empty).length / answerable.length,
    nonEmptyRateOnRefusal:
      refusals.length === 0 ? null : refusals.filter((r) => !r.empty).length / refusals.length,
    relevantScores: describeScores(relevantScores),
    irrelevantScores: describeScores(irrelevantScores),
  }
}

/** Aggregate restricted to cases carrying a given tag, for per-slice reporting. */
export function aggregateByTag(
  cases: RetrievalCase[],
  results: RetrievalCaseResult[],
  kValues: number[] = DEFAULT_K_VALUES
): Record<string, RetrievalAggregate> {
  const tags = new Set(results.flatMap((r) => r.tags))
  const byId = new Map(cases.map((c) => [c.id, c]))
  const out: Record<string, RetrievalAggregate> = {}
  for (const tag of [...tags].sort()) {
    const tagged = results.filter((r) => r.tags.includes(tag))
    out[tag] = aggregate(
      tagged.map((r) => byId.get(r.id)!).filter(Boolean),
      tagged,
      kValues
    )
  }
  return out
}
