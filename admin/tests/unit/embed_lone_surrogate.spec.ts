/**
 * Chunk boundaries and the embed char caps cut by UTF-16 code unit, so an
 * emoji split across a boundary leaves a lone high or low surrogate in one
 * of the pieces. Lone surrogates cannot be encoded as well-formed JSON, and
 * strict JSON parsers (Python's `json` module — the usual implementation
 * language of OpenAI-compatible gateways) reject the request body with a
 * 400 ("no low surrogate in string"), failing the entire embed call.
 *
 * Pure-function spec: runs under the plain-node runner (npm run test:unit).
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { stripLoneSurrogates } from '../../app/utils/surrogates.js'

test('strips a lone high surrogate left by a code-unit cut', () => {
  const cut = 'ok' + '\uD83D' // high half of a thumbs-up, split from its low half
  assert.equal(stripLoneSurrogates(cut), 'ok')
})

test('keeps complete surrogate pairs intact', () => {
  assert.equal(stripLoneSurrogates('thumbs up: \uD83D\uDC4D'), 'thumbs up: \uD83D\uDC4D')
})

test('strips a lone low surrogate', () => {
  assert.equal(stripLoneSurrogates('x\uDC00'), 'x')
})

test('handles a cap() slice that ends mid-pair', () => {
  const s = 'a\uD83D\uDC4Db' // 'a' + thumbs-up + 'b'
  const sliced = s.slice(0, 2) // cap cut: ends with the high surrogate
  assert.equal(stripLoneSurrogates(sliced), 'a')
})

test('leaves BMP text untouched', () => {
  assert.equal(
    stripLoneSurrogates('plain ascii and éaccented text'),
    'plain ascii and éaccented text'
  )
})
