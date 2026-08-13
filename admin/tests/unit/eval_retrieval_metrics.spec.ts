/**
 * Tests for the retrieval metrics.
 *
 * Expected values are hand-computed from the formulas in the module doc, not
 * captured from a run — a snapshot test of a wrong implementation just freezes
 * the wrong answer. nDCG in particular is easy to get subtly wrong (log base,
 * off-by-one in the rank, what the ideal ranking is normalized against), and a
 * silently wrong metric is worse than no metric.
 *
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  aggregate,
  aggregateByTag,
  describeScores,
  hitRateAtK,
  meanOf,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  scoreCase,
  toDocumentRanking,
  type RetrievalCase,
  type ScoredChunk,
} from '../../app/utils/eval/retrieval_metrics.js'

/** Build a ranked chunk list from doc ids, best first. */
const chunks = (...docIds: Array<string | null>): ScoredChunk[] =>
  docIds.map((docId, i) => ({ docId, score: 1 - i * 0.05, semanticScore: 0.9 - i * 0.05 }))

const close = (actual: number | null, expected: number, msg?: string) => {
  assert.ok(actual !== null, msg ?? 'expected a value, got null')
  assert.ok(Math.abs(actual - expected) < 1e-9, `${msg ?? ''} expected ${expected}, got ${actual}`)
}

// --- document ranking ---------------------------------------------------------

test('document ranking keeps each document at its best rank', () => {
  assert.deepEqual(toDocumentRanking(chunks('a', 'b', 'a', 'c', 'b')), ['a', 'b', 'c'])
})

test('document ranking drops chunks with no resolvable document', () => {
  assert.deepEqual(toDocumentRanking(chunks('a', null, 'b')), ['a', 'b'])
})

// --- recall -------------------------------------------------------------------

test('recall@k finds both documents of a multi-hop question', () => {
  close(recallAtK(chunks('a', 'x', 'b'), ['a', 'b'], 5), 1)
})

test('recall@k is partial when only one required document is in the window', () => {
  // 'b' sits at rank 3, outside k=2. One of two relevant docs found.
  close(recallAtK(chunks('a', 'x', 'b'), ['a', 'b'], 2), 0.5)
})

test('recall@k counts distinct documents, not chunks', () => {
  // Three chunks, all from 'a'. That is one document found, not three.
  close(recallAtK(chunks('a', 'a', 'a'), ['a', 'b'], 5), 0.5)
})

test('recall is null for out-of-corpus cases rather than 0', () => {
  // Scoring these as 0 would drag the mean down for questions that are
  // supposed to retrieve nothing — punishing correct behaviour.
  assert.equal(recallAtK(chunks('x'), [], 5), null)
})

test('recall is 0 when nothing relevant was retrieved', () => {
  close(recallAtK(chunks('x', 'y'), ['a'], 5), 0)
})

// --- hit rate -----------------------------------------------------------------

test('hit rate is 1 when any relevant document appears', () => {
  assert.equal(hitRateAtK(chunks('x', 'a'), ['a', 'b'], 5), 1)
})

test('hit rate and recall diverge on multi-hop, which is the point of having both', () => {
  const retrieved = chunks('a', 'x', 'y')
  assert.equal(hitRateAtK(retrieved, ['a', 'b'], 5), 1)
  close(recallAtK(retrieved, ['a', 'b'], 5), 0.5)
})

test('hit rate respects the k window', () => {
  assert.equal(hitRateAtK(chunks('x', 'y', 'a'), ['a'], 2), 0)
})

// --- precision ----------------------------------------------------------------

test('precision@k is chunk level and deliberately not deduped', () => {
  // Two of four injected chunks are noise, regardless of how many documents
  // they came from — the small model pays for all four.
  close(precisionAtK(chunks('a', 'a', 'x', 'y'), ['a'], 4), 0.5)
})

test('precision divides by what was actually retrieved, not by k', () => {
  // Returning 2 good chunks should score 1.0, not 0.4 — declining to pad the
  // context with noise is correct behaviour and must not be penalised.
  close(precisionAtK(chunks('a', 'a'), ['a'], 5), 1)
})

test('precision is 0 when nothing was retrieved', () => {
  close(precisionAtK([], ['a'], 5), 0)
})

// --- reciprocal rank ----------------------------------------------------------

test('reciprocal rank is 1 when the first chunk is relevant', () => {
  close(reciprocalRank(chunks('a', 'x'), ['a']), 1)
})

test('reciprocal rank is 1/3 when the first relevant chunk is third', () => {
  close(reciprocalRank(chunks('x', 'y', 'a'), ['a']), 1 / 3)
})

test('reciprocal rank is 0 when nothing relevant was retrieved', () => {
  close(reciprocalRank(chunks('x', 'y'), ['a']), 0)
})

// --- nDCG ---------------------------------------------------------------------

test('nDCG is 1 when the single relevant document ranks first', () => {
  close(ndcgAtK(chunks('a', 'x', 'y'), ['a'], 5), 1)
})

test('nDCG at rank 2 equals 1/log2(3)', () => {
  // DCG  = 1/log2(2+1) = 1/1.58496 = 0.63093
  // IDCG = 1/log2(1+1) = 1
  close(ndcgAtK(chunks('x', 'a'), ['a'], 5), 1 / Math.log2(3))
})

test('nDCG normalizes against the known relevant count, not the retrieved set', () => {
  // One of three required documents, ranked first.
  //   DCG  = 1/log2(2)                          = 1
  //   IDCG = 1/log2(2) + 1/log2(3) + 1/log2(4)  = 1 + 0.63093 + 0.5 = 2.13093
  // Normalizing against the retrieved set instead would report a perfect 1.0
  // for a run that missed two thirds of the answer.
  const idcg = 1 + 1 / Math.log2(3) + 1 / Math.log2(4)
  close(ndcgAtK(chunks('a', 'x', 'y'), ['a', 'b', 'c'], 5), 1 / idcg)
})

test('nDCG punishes ordering even when recall is unchanged', () => {
  // This is the regression nDCG exists to catch: same documents retrieved,
  // pushed down the list, recall identical.
  const good = chunks('a', 'b', 'x', 'y')
  const bad = chunks('x', 'y', 'a', 'b')
  close(recallAtK(good, ['a', 'b'], 5), 1)
  close(recallAtK(bad, ['a', 'b'], 5), 1)
  const nGood = ndcgAtK(good, ['a', 'b'], 5)!
  const nBad = ndcgAtK(bad, ['a', 'b'], 5)!
  assert.equal(nGood, 1)
  assert.ok(nBad < nGood, `expected ${nBad} < ${nGood}`)
})

test('nDCG ideal ranking is capped at k', () => {
  // Three relevant docs but k=1: the best achievable is one hit at rank 1.
  close(ndcgAtK(chunks('a', 'b', 'c'), ['a', 'b', 'c'], 1), 1)
})

test('nDCG collapses duplicate chunks from the same document', () => {
  // Three chunks of 'a' must not be credited as three separate hits.
  const idcg = 1 + 1 / Math.log2(3)
  close(ndcgAtK(chunks('a', 'a', 'a'), ['a', 'b'], 5), 1 / idcg)
})

test('nDCG is 0 when nothing relevant is retrieved', () => {
  close(ndcgAtK(chunks('x', 'y'), ['a'], 5), 0)
})

// --- score distribution ---------------------------------------------------------

test('describeScores reports values that actually occurred', () => {
  const d = describeScores([0.1, 0.2, 0.3, 0.4, 0.5])!
  assert.equal(d.count, 5)
  assert.equal(d.min, 0.1)
  assert.equal(d.max, 0.5)
  assert.equal(d.median, 0.3)
  close(d.mean, 0.3)
  // Nearest-rank, so every reported percentile is a real observation.
  assert.ok([0.1, 0.2, 0.3, 0.4, 0.5].includes(d.p10))
  assert.ok([0.1, 0.2, 0.3, 0.4, 0.5].includes(d.p90))
})

test('describeScores returns null for an empty sample', () => {
  assert.equal(describeScores([]), null)
})

test('meanOf ignores nulls and returns null when everything is null', () => {
  close(meanOf([1, null, 3]), 2)
  assert.equal(meanOf([null, null]), null)
})

// --- aggregation ----------------------------------------------------------------

const mkCase = (over: Partial<RetrievalCase>): RetrievalCase => ({
  id: 'c',
  tags: [],
  retrieved: chunks('a'),
  relevantDocIds: ['a'],
  expectRefusal: false,
  ...over,
})

test('aggregate separates answerable cases from refusal cases', () => {
  const cases = [
    mkCase({ id: 'q1', retrieved: chunks('a'), relevantDocIds: ['a'] }),
    mkCase({ id: 'q2', retrieved: [], relevantDocIds: [], expectRefusal: true }),
  ]
  const results = cases.map((c) => scoreCase(c))
  const agg = aggregate(cases, results)
  assert.equal(agg.cases, 2)
  assert.equal(agg.answerable, 1)
  // The refusal case contributes null to recall, so the mean is over q1 alone.
  close(agg.recall[5], 1)
})

test('empty rate on answerable questions surfaces an over-tight threshold', () => {
  const cases = [
    mkCase({ id: 'q1', retrieved: [] }),
    mkCase({ id: 'q2', retrieved: chunks('a') }),
  ]
  const agg = aggregate(cases, cases.map((c) => scoreCase(c)))
  close(agg.emptyRateOnAnswerable, 0.5)
})

test('non-empty rate on refusal questions surfaces an over-loose threshold', () => {
  const cases = [
    mkCase({ id: 'r1', retrieved: chunks('x'), relevantDocIds: [], expectRefusal: true }),
    mkCase({ id: 'r2', retrieved: [], relevantDocIds: [], expectRefusal: true }),
  ]
  const agg = aggregate(cases, cases.map((c) => scoreCase(c)))
  close(agg.nonEmptyRateOnRefusal, 0.5)
})

test('score distributions split relevant from irrelevant chunks', () => {
  const cases = [mkCase({ retrieved: chunks('a', 'x', 'y'), relevantDocIds: ['a'] })]
  const agg = aggregate(cases, cases.map((c) => scoreCase(c)))
  assert.equal(agg.relevantScores!.count, 1)
  assert.equal(agg.irrelevantScores!.count, 2)
  // The relevant chunk ranked first, so it should score above the noise.
  assert.ok(agg.relevantScores!.median > agg.irrelevantScores!.median)
})

test('refusal cases contribute only to the irrelevant score population', () => {
  const cases = [mkCase({ retrieved: chunks('x', 'y'), relevantDocIds: [], expectRefusal: true })]
  const agg = aggregate(cases, cases.map((c) => scoreCase(c)))
  assert.equal(agg.relevantScores, null)
  assert.equal(agg.irrelevantScores!.count, 2)
})

test('per-tag aggregation slices the same cases without recomputing them wrong', () => {
  const cases = [
    mkCase({ id: 'q1', tags: ['single-hop'], retrieved: chunks('a'), relevantDocIds: ['a'] }),
    mkCase({ id: 'q2', tags: ['multi-hop'], retrieved: chunks('a'), relevantDocIds: ['a', 'b'] }),
  ]
  const byTag = aggregateByTag(cases, cases.map((c) => scoreCase(c)))
  close(byTag['single-hop'].recall[5], 1)
  close(byTag['multi-hop'].recall[5], 0.5)
  assert.equal(byTag['single-hop'].cases, 1)
})
