/**
 * Tests for golden-set parsing, validation, and the corpus fingerprint.
 *
 * The validation here is the difference between "the eval scored 0.62" and "the
 * eval scored 0.62 because a golden had a typo'd doc id and could never match".
 * Every failure mode below is one that would otherwise be silent.
 *
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  assertGoldensMatchCorpus,
  computeCorpusFingerprint,
  GoldenSetError,
  parseGoldens,
} from '../../app/utils/eval/golden_set.js'

const line = (obj: Record<string, unknown>) =>
  JSON.stringify({
    id: 'x',
    query: 'q?',
    relevantDocIds: ['doc-a'],
    mustInclude: [],
    mustNotInclude: [],
    expectRefusal: false,
    tags: [],
    ...obj,
  })

/**
 * Deterministic stand-in for sha256. Returns 64 hex chars like the real thing,
 * so the truncation behaviour under test is the behaviour that ships — a short
 * fake would make the length assertion vacuous.
 */
const fakeHash = (s: string) => {
  let a = 0x811c9dc5
  const out: string[] = []
  for (let round = 0; round < 8; round++) {
    for (const ch of s) a = Math.imul(a ^ ch.charCodeAt(0), 0x01000193) >>> 0
    a = (a ^ round) >>> 0
    out.push(a.toString(16).padStart(8, '0'))
  }
  return out.join('')
}

// --- parsing -----------------------------------------------------------------

test('parses a well-formed golden', () => {
  const [g] = parseGoldens(line({ id: 'water-01', query: 'How long?', tags: ['numeric'] }))
  assert.equal(g.id, 'water-01')
  assert.equal(g.query, 'How long?')
  assert.deepEqual(g.tags, ['numeric'])
  assert.deepEqual(g.turns, [])
})

test('skips blank lines and // comments', () => {
  const jsonl = ['', '// a note', line({ id: 'a' }), '   ', line({ id: 'b' })].join('\n')
  assert.equal(parseGoldens(jsonl).length, 2)
})

test('rejects duplicate ids', () => {
  const jsonl = [line({ id: 'dup' }), line({ id: 'dup' })].join('\n')
  assert.throws(() => parseGoldens(jsonl), /duplicate id "dup"/)
})

test('rejects malformed JSON with the line number', () => {
  assert.throws(() => parseGoldens('{not json'), /goldens:1: not valid JSON/)
})

test('rejects a missing query', () => {
  assert.throws(() => parseGoldens(JSON.stringify({ id: 'a', relevantDocIds: ['d'] })), /missing "query"/)
})

test('rejects an empty query', () => {
  assert.throws(() => parseGoldens(line({ query: '   ' })), /"query" must be a non-empty string/)
})

// --- the two contradictions that would silently score wrong -------------------

test('rejects a refusal case that also lists relevant documents', () => {
  // One of the two is wrong, and either way the case is scored against a
  // contradiction. Better to fail at load than to quietly grade nonsense.
  assert.throws(
    () => parseGoldens(line({ expectRefusal: true, relevantDocIds: ['doc-a'] })),
    /expects a refusal but also lists relevant documents/
  )
})

test('rejects a non-refusal case with no relevant documents', () => {
  assert.throws(
    () => parseGoldens(line({ expectRefusal: false, relevantDocIds: [] })),
    /can never be scored/
  )
})

test('accepts a refusal case with no relevant documents', () => {
  const [g] = parseGoldens(line({ expectRefusal: true, relevantDocIds: [] }))
  assert.equal(g.expectRefusal, true)
  assert.deepEqual(g.relevantDocIds, [])
})

// --- regex validation ---------------------------------------------------------

test('compiles mustInclude patterns at load so a bad regex fails immediately', () => {
  assert.throws(() => parseGoldens(line({ mustInclude: ['(unclosed'] })), /invalid regex/)
})

test('compiles mustNotInclude patterns too', () => {
  assert.throws(() => parseGoldens(line({ mustNotInclude: ['[z-a]'] })), /invalid regex/)
})

test('accepts alternation, which is how one entry covers "3 minutes" and "three minutes"', () => {
  const [g] = parseGoldens(line({ mustInclude: [String.raw`\b(3|three) minutes?`] }))
  assert.match('boil for three minutes', new RegExp(g.mustInclude[0], 'i'))
  assert.match('boil for 3 minutes', new RegExp(g.mustInclude[0], 'i'))
})

// --- turns --------------------------------------------------------------------

test('accepts multi-turn history', () => {
  const [g] = parseGoldens(
    line({ turns: [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'reply' }] })
  )
  assert.equal(g.turns.length, 2)
})

test('rejects a turn with a bogus role', () => {
  assert.throws(() => parseGoldens(line({ turns: [{ role: 'system', content: 'x' }] })), /"turns" must be/)
})

test('rejects an empty golden file rather than silently reporting a perfect score', () => {
  assert.throws(() => parseGoldens('\n\n// only comments\n'), /no goldens found/)
})

// --- corpus cross-check --------------------------------------------------------

test('accepts goldens whose documents all exist', () => {
  const goldens = parseGoldens(line({ relevantDocIds: ['doc-a', 'doc-b'] }))
  assert.doesNotThrow(() => assertGoldensMatchCorpus(goldens, ['doc-a', 'doc-b', 'doc-c']))
})

test('rejects a golden pointing at a document that is not in the corpus', () => {
  // A typo'd doc id makes recall unhittable for that question forever, and the
  // only symptom is a slightly lower score. This is the check that catches it.
  const goldens = parseGoldens(line({ relevantDocIds: ['doc-typo'] }))
  assert.throws(
    () => assertGoldensMatchCorpus(goldens, ['doc-a']),
    (err: unknown) => err instanceof GoldenSetError && /doc-typo/.test((err as Error).message)
  )
})

// --- fingerprint ----------------------------------------------------------------

const inputs = (over: Record<string, unknown> = {}) => ({
  documents: new Map([
    ['a', 'alpha'],
    ['b', 'beta'],
  ]),
  chunkTokens: 1500,
  chunkOverlapTokens: 150,
  charToTokenRatio: 2,
  embeddingModel: 'nomic-embed-text:v1.5',
  embeddingDimension: 768,
  ...over,
})

test('fingerprint is stable across runs', () => {
  assert.equal(computeCorpusFingerprint(inputs(), fakeHash), computeCorpusFingerprint(inputs(), fakeHash))
})

test('fingerprint ignores document insertion order', () => {
  const reversed = inputs({
    documents: new Map([
      ['b', 'beta'],
      ['a', 'alpha'],
    ]),
  })
  assert.equal(computeCorpusFingerprint(inputs(), fakeHash), computeCorpusFingerprint(reversed, fakeHash))
})

test('fingerprint changes when a document changes', () => {
  const edited = inputs({ documents: new Map([['a', 'alpha!'], ['b', 'beta']]) })
  assert.notEqual(computeCorpusFingerprint(inputs(), fakeHash), computeCorpusFingerprint(edited, fakeHash))
})

test('fingerprint changes when a document is added', () => {
  const added = inputs({ documents: new Map([['a', 'alpha'], ['b', 'beta'], ['c', 'gamma']]) })
  assert.notEqual(computeCorpusFingerprint(inputs(), fakeHash), computeCorpusFingerprint(added, fakeHash))
})

test('fingerprint changes when the chunk size changes', () => {
  // This is the one that matters most: re-chunking invalidates every prior
  // score, and the fingerprint is what stops us comparing across the change.
  assert.notEqual(
    computeCorpusFingerprint(inputs(), fakeHash),
    computeCorpusFingerprint(inputs({ chunkTokens: 512 }), fakeHash)
  )
})

test('fingerprint changes when the token-estimate ratio changes', () => {
  // CHAR_TO_TOKEN_RATIO feeds the chunker as a character count, so changing it
  // silently re-chunks the corpus. It must be in the fingerprint.
  assert.notEqual(
    computeCorpusFingerprint(inputs(), fakeHash),
    computeCorpusFingerprint(inputs({ charToTokenRatio: 3 }), fakeHash)
  )
})

test('fingerprint changes when the embedding model changes', () => {
  assert.notEqual(
    computeCorpusFingerprint(inputs(), fakeHash),
    computeCorpusFingerprint(inputs({ embeddingModel: 'mxbai-embed-large' }), fakeHash)
  )
})

test('fingerprint is short enough to paste into a filename', () => {
  assert.equal(computeCorpusFingerprint(inputs(), fakeHash).length, 16)
})

test('document contents cannot collide by concatenation', () => {
  // Naive joining lets {a: "xy", b: ""} hash the same as {a: "x", b: "y"}.
  const one = inputs({ documents: new Map([['a', 'xy'], ['b', '']]) })
  const two = inputs({ documents: new Map([['a', 'x'], ['b', 'y']]) })
  assert.notEqual(computeCorpusFingerprint(one, fakeHash), computeCorpusFingerprint(two, fakeHash))
})
