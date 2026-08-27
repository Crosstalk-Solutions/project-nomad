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
  resolveStructured,
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

// --- resolveStructured -------------------------------------------------------
//
// The reason is what each caller branches on, and the two failure reasons lead to
// opposite behaviour: one runs the legacy prose parser, the other refuses to. A
// wrong reason is the bug Copilot found on #1259, so both directions are pinned.

test('resolve: a parsed value carries no reason', () => {
  assert.deepEqual(resolveStructured('{"title": "Water Purification"}', pickTitle, true), {
    ok: true,
    value: 'Water Purification',
  })
})

test('resolve: constrained + malformed JSON is the model breaking its own grammar', () => {
  // Truncated mid-object by a token cap. The caller must NOT parse this as prose.
  assert.deepEqual(resolveStructured('{"title": "unterminated', pickTitle, true), {
    ok: false,
    reason: 'constrained-parse-failed',
  })
})

test('resolve: unconstrained + malformed JSON leaves the legacy parser in charge', () => {
  assert.deepEqual(resolveStructured('{"title": "unterminated', pickTitle, false), {
    ok: false,
    reason: 'unconstrained',
  })
})

test('resolve: unconstrained + plain prose is the normal compat-backend response', () => {
  assert.deepEqual(resolveStructured('Water Purification Basics', pickTitle, false), {
    ok: false,
    reason: 'unconstrained',
  })
})

test('resolve: constrained + a picker rejection is still a grammar failure', () => {
  // `{"suggestions": []}` is valid JSON and valid against nothing useful — minItems
  // was supposed to prevent it. Parsing the braces as prose would still be wrong.
  assert.deepEqual(resolveStructured('{"suggestions": []}', pickSuggestions, true), {
    ok: false,
    reason: 'constrained-parse-failed',
  })
})

test('resolve: constrained + an empty response fails rather than returning a value', () => {
  assert.deepEqual(resolveStructured('', pickQueries, true), {
    ok: false,
    reason: 'constrained-parse-failed',
  })
})

test('resolve: a throwing picker is a failed parse, not an exception', () => {
  // Same critical-path guarantee as parseStructured — the rewrite runs every turn.
  assert.deepEqual(
    resolveStructured(
      '{"title": "x"}',
      () => {
        throw new Error('boom')
      },
      true
    ),
    { ok: false, reason: 'constrained-parse-failed' }
  )
})

test('resolve: queries keeps the whole array so [0] is the retrieval query', () => {
  const result = resolveStructured('{"queries": ["a", "b"]}', pickQueries, true)
  assert.equal(result.ok, true)
  assert.deepEqual(result.ok && result.value, ['a', 'b'])
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
