/**
 * Interpretation of the `rag.minRelevance` setting.
 *
 * Every case that matters here is a value that should never have been stored —
 * a cleared row, a hand-edited string, a half-written migration. The rule these
 * lock in is that none of them may silently switch the relevance floor *off*:
 * losing the setting has to mean "use the recommended default", because the
 * failure is invisible (irrelevant passages quietly return to every answer)
 * rather than loud. The one value that does turn it off is an explicit 0, and
 * that has to keep working — it is a real choice offered in the UI.
 *
 * Pure functions only — no MySQL, Redis, Qdrant, or Ollama needed:
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyRelevanceFloor, parseMinRelevance } from '../../app/utils/misc.js'

const DEFAULT = 0.6

test('min relevance: an unset setting uses the recommended default', () => {
  assert.equal(parseMinRelevance(null, DEFAULT), DEFAULT)
  assert.equal(parseMinRelevance(undefined, DEFAULT), DEFAULT)
})

test('min relevance: empty, whitespace and "auto" all count as unset', () => {
  // SystemService.updateSetting clears the row on an empty string, but a value
  // written before that behaviour (or by hand) must not read as 0.
  assert.equal(parseMinRelevance('', DEFAULT), DEFAULT)
  assert.equal(parseMinRelevance('   ', DEFAULT), DEFAULT)
  assert.equal(parseMinRelevance('auto', DEFAULT), DEFAULT)
})

test('min relevance: an unparseable value uses the default rather than disabling the floor', () => {
  assert.equal(parseMinRelevance('balanced', DEFAULT), DEFAULT)
  assert.equal(parseMinRelevance('NaN', DEFAULT), DEFAULT)
  assert.equal(parseMinRelevance('0.6.1', DEFAULT), DEFAULT)
})

test('min relevance: an explicit 0 turns the floor off and is not treated as unset', () => {
  assert.equal(parseMinRelevance('0', DEFAULT), 0)
  assert.equal(parseMinRelevance('0.0', DEFAULT), 0)
})

test('min relevance: a valid value is used as written', () => {
  assert.equal(parseMinRelevance('0.5', DEFAULT), 0.5)
  assert.equal(parseMinRelevance('0.68', DEFAULT), 0.68)
  assert.equal(parseMinRelevance(' 0.55 ', DEFAULT), 0.55)
  assert.equal(parseMinRelevance('1', DEFAULT), 1)
})

test('min relevance: out-of-range values clamp instead of being rejected', () => {
  // The validator rejects these at the API, so reaching here means the row was
  // written some other way. Clamping keeps retrieval working on a value that is
  // at least meaningful, where a raw -5 would floor nothing and a raw 40 would
  // floor everything.
  assert.equal(parseMinRelevance('-5', DEFAULT), 0)
  assert.equal(parseMinRelevance('40', DEFAULT), 1)
})

const ranked = (...scores: number[]) => scores.map((finalScore, i) => ({ finalScore, id: `c${i}` }))

test('relevance floor: keeps chunks at or above the floor', () => {
  // Boundary inclusive: a chunk scoring exactly the floor is on the right side
  // of it. The presets are round numbers, so this edge is reachable.
  const { survivors, belowFloor } = applyRelevanceFloor(ranked(0.8, 0.6, 0.59), 0.6)
  assert.deepEqual(survivors.map((s) => s.id), ['c0', 'c1'])
  assert.equal(belowFloor, 1)
})

test('relevance floor: nothing clearing it returns an empty list, not the best of a bad set', () => {
  // The whole point of the item. Retrieval declining is what lets the prompt
  // stop asking a 3B model to silently judge relevance for us.
  const { survivors, belowFloor } = applyRelevanceFloor(ranked(0.55, 0.5, 0.42), 0.6)
  assert.deepEqual(survivors, [])
  assert.equal(belowFloor, 3)
})

test('relevance floor: a floor of 0 is a pass-through', () => {
  // The "Off" preset, and the default for callers that predate the parameter.
  const results = ranked(0.9, 0.1)
  const { survivors, belowFloor } = applyRelevanceFloor(results, 0)
  assert.equal(survivors, results)
  assert.equal(belowFloor, 0)
})

test('relevance floor: an empty candidate list stays empty and reports nothing dropped', () => {
  // "The knowledge base had no match above the Qdrant threshold" and "the floor
  // rejected everything" are different states, and the retrieval-status UX needs
  // to tell them apart — so an empty input must not report phantom drops.
  const { survivors, belowFloor } = applyRelevanceFloor(ranked(), 0.6)
  assert.deepEqual(survivors, [])
  assert.equal(belowFloor, 0)
})
