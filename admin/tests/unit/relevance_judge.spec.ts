/**
 * The pure half of the retrieval relevance check (#1341).
 *
 * What these lock in: the setting stays off unless someone deliberately turned
 * it on, a verdict is only ever read from a well-formed object, and the judge
 * reads the part of a long chunk that is about the question rather than
 * whatever happens to come first.
 *
 * Pure functions only — no MySQL, Redis, Qdrant, or Ollama needed:
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildJudgeInput,
  excerptFor,
  isRelevanceCheckEnabled,
  pickOnTopic,
} from '../../app/utils/relevance_judge.js'

test('relevance check: off unless explicitly on', () => {
  assert.equal(isRelevanceCheckEnabled(true), true)
  assert.equal(isRelevanceCheckEnabled('true'), true)
  // Unset, cleared, or anything odd must not start costing a model call per turn.
  for (const raw of [null, undefined, false, 'false', '', 'on', 'auto', 1]) {
    assert.equal(isRelevanceCheckEnabled(raw), false, `expected ${JSON.stringify(raw)} to read as off`)
  }
})

test('relevance check: a verdict is read only from a boolean on_topic', () => {
  assert.equal(pickOnTopic({ on_topic: true }), true)
  assert.equal(pickOnTopic({ on_topic: false }), false)
  // A string "false" is truthy; treating it as a verdict would keep chunks the
  // model rejected. Anything that isn't a real boolean is no verdict at all.
  assert.equal(pickOnTopic({ on_topic: 'false' }), null)
  assert.equal(pickOnTopic({}), null)
  assert.equal(pickOnTopic(null), null)
})

test('excerpt: a short passage is passed through whole', () => {
  assert.equal(excerptFor('Boil   water\nfor one minute.', 'boil water', 100), 'Boil water for one minute.')
})

test('excerpt: a long passage is cut to the window about the question', () => {
  // The answer sits at the end of a long chunk. Taking the start would show the
  // judge only filler, and it would rightly say the passage is off-topic.
  const filler = 'Lorem ipsum dolor sit amet. '.repeat(40)
  const text = `${filler}A counterpoise for a two meter handheld is a wire about 19 inches long.`
  const excerpt = excerptFor(text, 'How long should a counterpoise be?', 200)

  assert.match(excerpt, /counterpoise for a two meter handheld/)
  assert.ok(excerpt.length <= 202, 'excerpt must stay within the window plus ellipses')
  assert.ok(excerpt.startsWith('…'), 'a window that skips the start says so')
})

test('excerpt: with no term in the passage, falls back to the start', () => {
  const text = 'x'.repeat(500)
  assert.equal(excerptFor(text, 'unrelated question', 100), 'x'.repeat(100) + '…')
})

test('judge input: question first, then each passage under its key and title', () => {
  const input = buildJudgeInput('  What is declination? ', [
    { text: 'The angle between true and magnetic north.', title: 'Map and Compass' },
    { text: 'Unrelated text.' },
  ])

  assert.equal(
    input,
    'Question: What is declination?\n\n' +
      'p1 (from "Map and Compass"):\nThe angle between true and magnetic north.\n\n' +
      'p2:\nUnrelated text.'
  )
})
