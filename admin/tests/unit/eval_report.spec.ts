/**
 * Tests for baseline diffing and the regression gate.
 *
 * This is the logic that decides whether a pull request is blocked, so the
 * cases below focus on the two ways a gate loses trust: firing on noise, and
 * comparing runs that were never comparable in the first place.
 *
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compareReports,
  DEFAULT_TOLERANCE,
  flattenByK,
  renderComparisonMarkdown,
  type EvalReport,
} from '../../app/utils/eval/report.js'

const report = (
  metrics: Record<string, number | null>,
  over: Partial<EvalReport['meta']> = {}
): EvalReport => ({
  meta: {
    kind: 'retrieval',
    createdAt: '2026-08-12T00:00:00.000Z',
    corpusFingerprint: 'abc123',
    gitSha: 'deadbeef',
    gitBranch: 'dev',
    gitDirty: false,
    nomadVersion: '1.34.0',
    platform: { cpuArchitecture: 'x64', osName: 'Linux', nodeVersion: 'v24' },
    params: {},
    ...over,
  },
  metrics,
  byTag: {},
  cases: [],
})

// --- the comparability veto ------------------------------------------------------

test('refuses to compare across corpus fingerprints', () => {
  // Diffing runs against different corpora would manufacture a regression out
  // of a chunk-size change. Refusing is the correct behaviour.
  const result = compareReports(
    report({ mrr: 0.9 }),
    report({ mrr: 0.5 }, { corpusFingerprint: 'different' })
  )
  assert.equal(result.comparable, false)
  assert.match(result.incomparableReason!, /fingerprint changed/)
  assert.deepEqual(result.regressions, [])
})

test('refuses to compare a retrieval report against a generation report', () => {
  const result = compareReports(report({ mrr: 0.9 }), report({ correctness: 0.9 }, { kind: 'generation' }))
  assert.equal(result.comparable, false)
  assert.match(result.incomparableReason!, /retrieval report against a generation/)
})

test('compares happily when the fingerprints match', () => {
  assert.equal(compareReports(report({ mrr: 0.9 }), report({ mrr: 0.9 })).comparable, true)
})

// --- direction awareness -----------------------------------------------------------

test('a drop in a higher-is-better metric is a regression', () => {
  const r = compareReports(report({ 'recall@5': 0.9 }), report({ 'recall@5': 0.5 }))
  assert.equal(r.regressions.length, 1)
  assert.equal(r.regressions[0].metric, 'recall@5')
})

test('a rise in a lower-is-better metric is a regression', () => {
  // leakageRate going up means the model started narrating retrieval again.
  const r = compareReports(report({ leakageRate: 0.0 }), report({ leakageRate: 0.4 }))
  assert.equal(r.regressions.length, 1)
  assert.equal(r.regressions[0].metric, 'leakageRate')
})

test('a fall in a lower-is-better metric is an improvement, not a regression', () => {
  const r = compareReports(report({ leakageRate: 0.4 }), report({ leakageRate: 0.0 }))
  assert.deepEqual(r.regressions, [])
  assert.equal(r.improvements.length, 1)
})

test('emptyRateOnAnswerable is treated as lower-is-better', () => {
  const r = compareReports(report({ emptyRateOnAnswerable: 0.1 }), report({ emptyRateOnAnswerable: 0.6 }))
  assert.equal(r.regressions.length, 1)
})

test('an unknown metric defaults to higher-is-better rather than being ignored', () => {
  const r = compareReports(report({ somethingNew: 0.9 }), report({ somethingNew: 0.1 }))
  assert.equal(r.regressions.length, 1)
})

// --- the tolerance band ---------------------------------------------------------------

test('a movement inside the tolerance band is neither a regression nor an improvement', () => {
  // A gate that fires on 0.001 gets switched off within a week.
  const r = compareReports(report({ mrr: 0.9 }), report({ mrr: 0.9 - DEFAULT_TOLERANCE / 2 }))
  assert.deepEqual(r.regressions, [])
  assert.deepEqual(r.improvements, [])
})

test('a movement exactly at the tolerance is not yet a regression', () => {
  const r = compareReports(report({ mrr: 0.9 }), report({ mrr: 0.9 - DEFAULT_TOLERANCE }))
  assert.deepEqual(r.regressions, [])
})

test('tolerance is configurable', () => {
  const loose = compareReports(report({ mrr: 0.9 }), report({ mrr: 0.85 }), 0.1)
  const tight = compareReports(report({ mrr: 0.9 }), report({ mrr: 0.85 }), 0.01)
  assert.deepEqual(loose.regressions, [])
  assert.equal(tight.regressions.length, 1)
})

// --- nulls and asymmetric metric sets ---------------------------------------------------

test('a null on either side is never a regression', () => {
  // "not measurable in this run" must not read as "collapsed to zero".
  assert.deepEqual(compareReports(report({ mrr: 0.9 }), report({ mrr: null })).regressions, [])
  assert.deepEqual(compareReports(report({ mrr: null }), report({ mrr: 0.1 })).regressions, [])
})

test('a metric present only in the current report is marked new, not regressed', () => {
  const r = compareReports(report({ mrr: 0.9 }), report({ mrr: 0.9, ndcgNew: 0.1 }))
  const added = r.deltas.find((d) => d.metric === 'ndcgNew')!
  assert.equal(added.onlyIn, 'current')
  assert.equal(added.regressed, false)
})

test('a metric dropped from the current report is marked removed', () => {
  const r = compareReports(report({ mrr: 0.9, gone: 0.5 }), report({ mrr: 0.9 }))
  const removed = r.deltas.find((d) => d.metric === 'gone')!
  assert.equal(removed.onlyIn, 'baseline')
  assert.equal(removed.regressed, false)
})

// --- helpers and rendering -------------------------------------------------------------

test('flattenByK produces name@k keys', () => {
  assert.deepEqual(flattenByK('recall', { 1: 0.5, 5: 0.9 }), { 'recall@1': 0.5, 'recall@5': 0.9 })
})

test('markdown leads with the regression count', () => {
  const r = compareReports(report({ 'recall@5': 0.9 }), report({ 'recall@5': 0.4 }))
  const md = renderComparisonMarkdown('base.json', 'cur.json', r)
  assert.match(md, /## 1 regression\(s\)/)
  assert.match(md, /\*\*REGRESSED\*\*/)
})

test('markdown says so plainly when nothing regressed', () => {
  const md = renderComparisonMarkdown('b.json', 'c.json', compareReports(report({ mrr: 0.9 }), report({ mrr: 0.9 })))
  assert.match(md, /## No regressions/)
})

test('markdown explains an incomparable pair instead of printing an empty table', () => {
  const r = compareReports(report({ mrr: 0.9 }), report({ mrr: 0.9 }, { corpusFingerprint: 'other' }))
  const md = renderComparisonMarkdown('b.json', 'c.json', r)
  assert.match(md, /## Not comparable/)
  assert.match(md, /fingerprint changed/)
})

test('markdown orders the worst regression first', () => {
  const r = compareReports(
    report({ small: 0.9, big: 0.9 }),
    report({ small: 0.85, big: 0.2 })
  )
  const md = renderComparisonMarkdown('b.json', 'c.json', r)
  assert.ok(md.indexOf('| big |') < md.indexOf('| small |'), 'worst regression should come first')
})
