/**
 * Tolerant JSON extraction for the constrained ancillary calls.
 *
 * The grammar makes the happy path boring; what these lock in is the *fallback*
 * behaviour, because `parseStructured` runs on every backend, including the ones
 * where `format` was never applied. Returning null is what selects a caller's
 * old string parser, so a wrong null and a wrong non-null are both bugs.
 *
 * Pure functions only — no MySQL, Redis, Qdrant, or Ollama needed:
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  QUERIES_SCHEMA,
  SUGGESTIONS_SCHEMA,
  TITLE_SCHEMA,
  parseStructured,
  pickQueries,
  pickSuggestions,
  pickTitle,
} from '../../app/utils/structured_output.js'

// --- parseStructured: extraction ---------------------------------------------

test('parses a clean object', () => {
  assert.equal(parseStructured('{"title": "Water Purification"}', pickTitle), 'Water Purification')
})

test('parses through a ```json fence', () => {
  const raw = '```json\n{"title": "Gentoo Install"}\n```'
  assert.equal(parseStructured(raw, pickTitle), 'Gentoo Install')
})

test('parses past leading prose and trailing commentary', () => {
  const raw = 'Sure, here you go:\n{"title": "Meat Curing"}\nHope that helps!'
  assert.equal(parseStructured(raw, pickTitle), 'Meat Curing')
})

test('nested objects survive the outermost-brace span', () => {
  const raw = '{"title": "A", "meta": {"b": 1}}'
  assert.equal(parseStructured(raw, pickTitle), 'A')
})

test('malformed JSON returns null', () => {
  assert.equal(parseStructured('{"title": "unterminated', pickTitle), null)
})

test('no braces at all returns null', () => {
  assert.equal(parseStructured('Water Purification Basics', pickTitle), null)
})

test('empty input returns null', () => {
  assert.equal(parseStructured('', pickTitle), null)
})

test('a bare JSON array is not an object', () => {
  // `[{"title": "x"}]` — the brace span parses, but the top level must be an object.
  assert.equal(parseStructured('["a", "b"]', pickTitle), null)
})

test('a throwing picker is caught, not propagated', () => {
  // This is on the chat critical path via the rewrite; it must never throw.
  assert.equal(
    parseStructured('{"title": "x"}', () => {
      throw new Error('boom')
    }),
    null
  )
})

// --- pickTitle ---------------------------------------------------------------

test('title: wrong type is rejected rather than stringified', () => {
  assert.equal(parseStructured('{"title": 42}', pickTitle), null)
})

test('title: whitespace-only is rejected', () => {
  assert.equal(parseStructured('{"title": "   "}', pickTitle), null)
})

test('title: missing key is rejected', () => {
  assert.equal(parseStructured('{"name": "x"}', pickTitle), null)
})

test('title: extra keys are tolerated', () => {
  assert.equal(parseStructured('{"title": "x", "confidence": 0.9}', pickTitle), 'x')
})

// --- pickSuggestions ---------------------------------------------------------

test('suggestions: three strings come back trimmed', () => {
  const raw = '{"suggestions": [" How Do I Purify Water? ", "B", "C"]}'
  assert.deepEqual(parseStructured(raw, pickSuggestions), ['How Do I Purify Water?', 'B', 'C'])
})

test('suggestions: an over-long array is sliced to three', () => {
  const raw = '{"suggestions": ["A", "B", "C", "D", "E"]}'
  assert.deepEqual(parseStructured(raw, pickSuggestions), ['A', 'B', 'C'])
})

test('suggestions: non-string entries are dropped, not coerced', () => {
  assert.deepEqual(parseStructured('{"suggestions": ["A", 7, null, "B"]}', pickSuggestions), [
    'A',
    'B',
  ])
})

test('suggestions: an empty array is null so the text parser runs', () => {
  assert.equal(parseStructured('{"suggestions": []}', pickSuggestions), null)
})

test('suggestions: an array of only blanks is null', () => {
  assert.equal(parseStructured('{"suggestions": ["", "  "]}', pickSuggestions), null)
})

test('suggestions: a string instead of an array is null', () => {
  assert.equal(parseStructured('{"suggestions": "A, B, C"}', pickSuggestions), null)
})

// --- pickQueries -------------------------------------------------------------

test('queries: the first entry is the one retrieval uses', () => {
  const raw = '{"queries": ["Is internet required to install Gentoo Linux?"]}'
  assert.deepEqual(parseStructured(raw, pickQueries), [
    'Is internet required to install Gentoo Linux?',
  ])
})

test('queries: extra paraphrases are kept for future multi-query fusion', () => {
  const raw = '{"queries": ["a", "b", "c"]}'
  assert.deepEqual(parseStructured(raw, pickQueries), ['a', 'b', 'c'])
})

test('queries: a leading blank is dropped so [0] is never empty', () => {
  // An empty query would be embedded and quietly poison retrieval for the turn.
  assert.deepEqual(parseStructured('{"queries": ["  ", "real query"]}', pickQueries), [
    'real query',
  ])
})

test('queries: an empty array is null so the raw message is used', () => {
  assert.equal(parseStructured('{"queries": []}', pickQueries), null)
})

// --- schemas -----------------------------------------------------------------

test('every schema marks its key required and forbids extra properties', () => {
  // Without `required`, GBNF happily lets a small model emit `{}`.
  for (const [schema, key] of [
    [TITLE_SCHEMA, 'title'],
    [SUGGESTIONS_SCHEMA, 'suggestions'],
    [QUERIES_SCHEMA, 'queries'],
  ] as const) {
    assert.deepEqual(schema.required, [key])
    assert.equal(schema.additionalProperties, false)
    assert.equal(schema.type, 'object')
  }
})

test('the suggestions schema pins the count at exactly three', () => {
  assert.equal(SUGGESTIONS_SCHEMA.properties.suggestions.minItems, 3)
  assert.equal(SUGGESTIONS_SCHEMA.properties.suggestions.maxItems, 3)
})
