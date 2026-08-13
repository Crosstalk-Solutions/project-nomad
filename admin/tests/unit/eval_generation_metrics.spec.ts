/**
 * Tests for the deterministic answer scorers.
 *
 * The refusal and leakage detectors are regex families, and a regex family is
 * only as good as the phrasings it was tested against — so the cases below are
 * real model phrasings, including the near-misses that must NOT trip them.
 * A false positive on leakage would flag a perfectly good answer as a prompt
 * regression, which is the fastest way to make people ignore the harness.
 *
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  detectLeakage,
  detectRefusal,
  extractNumbers,
  hasThinkTagLeak,
  isMarkdownFormatted,
  matchPatterns,
  numericGroundedness,
  scoreAnswer,
  summarizeNumeric,
  summarizeRepeats,
} from '../../app/utils/eval/generation_metrics.js'

// --- refusal detection ---------------------------------------------------------

const REFUSALS = [
  "I don't know the answer to that.",
  'I do not have that information.',
  "I'm not able to answer that question.",
  'I am unable to determine that.',
  "I couldn't find anything about that.",
  'There is no information available on that topic.',
  'That is not mentioned anywhere.',
  'The documentation does not specify a warranty period.',
  "That isn't covered here.",
  "I'd need more detail to answer that.",
]

for (const [i, text] of REFUSALS.entries()) {
  test(`detects refusal phrasing #${i + 1}: ${text.slice(0, 40)}`, () => {
    assert.equal(detectRefusal(text), true)
  })
}

const NON_REFUSALS = [
  'Boil the water for three minutes above 6,500 feet.',
  'A tourniquet goes 2 to 3 inches above the wound.',
  // "not" appears, but the answer is substantive — must not trip the detector.
  'Do not use ice on a burn; cool it under running water for 20 minutes.',
  'Water bath canning is not suitable for green beans, so use a pressure canner.',
  'You know the water is safe once it has held a rolling boil.',
]

for (const [i, text] of NON_REFUSALS.entries()) {
  test(`does not misread a substantive answer as a refusal #${i + 1}`, () => {
    assert.equal(detectRefusal(text), false, `false positive on: ${text}`)
  })
}

// --- leakage detection -----------------------------------------------------------

const LEAKS = [
  'According to the context, boil for three minutes.',
  'Based on the provided context, use 8 drops per gallon.',
  'Context 1 describes the boiling procedure.',
  'The knowledge base does not cover that.',
  'The retrieved documents mention a 500 hour interval.',
  "The context doesn't address your question.",
  'I found no relevant context for this.',
  'From the search results, the pressure is 10 psi.',
]

for (const [i, text] of LEAKS.entries()) {
  test(`detects retrieval narration #${i + 1}`, () => {
    assert.ok(detectLeakage(text).length > 0, `missed leakage in: ${text}`)
  })
}

const CLEAN = [
  'Boil the water for three minutes.',
  'The TR-88 has a rated flow of 4.5 litres per minute.',
  // "context" used in an ordinary sense, not as retrieval narration.
  'In a wilderness context, a tourniquet is the priority.',
  'Store one gallon per person per day.',
]

for (const [i, text] of CLEAN.entries()) {
  test(`does not flag a clean answer as leakage #${i + 1}`, () => {
    assert.deepEqual(detectLeakage(text), [], `false positive on: ${text}`)
  })
}

// --- think tags -------------------------------------------------------------------

test('detects surviving reasoning tags', () => {
  assert.equal(hasThinkTagLeak('<think>hmm</think>The answer is 3 minutes.'), true)
  assert.equal(hasThinkTagLeak('<thinking>x</thinking> answer'), true)
})

test('does not flag ordinary prose containing the word think', () => {
  assert.equal(hasThinkTagLeak('I think you should boil it longer.'), false)
})

// --- markdown ---------------------------------------------------------------------

test('recognises common markdown structures', () => {
  assert.equal(isMarkdownFormatted('## Heading\n\ntext'), true)
  assert.equal(isMarkdownFormatted('- one\n- two'), true)
  assert.equal(isMarkdownFormatted('1. first'), true)
  assert.equal(isMarkdownFormatted('use **bold** here'), true)
  assert.equal(isMarkdownFormatted('| a | b |'), true)
})

test('flags an answer with no formatting at all', () => {
  assert.equal(isMarkdownFormatted('Just a plain sentence with no structure.'), false)
})

// --- numbers and grounding ----------------------------------------------------------

test('extracts and normalizes numbers', () => {
  assert.deepEqual(extractNumbers('2,000cc and 300cc'), ['2000', '300'])
})

test('treats 2,000 and 2000 as the same number', () => {
  const { score, ungrounded } = numericGroundedness('Use a 2,000cc absorber.', 'Use a 2000cc absorber.')
  assert.equal(score, 1)
  assert.deepEqual(ungrounded, [])
})

test('flags a number the context does not support', () => {
  // The classic fabrication: a plausible figure that appears nowhere.
  const { score, ungrounded } = numericGroundedness(
    'Replace the diaphragm every 250 hours.',
    'Replace the EPDM diaphragm every 500 operating hours.'
  )
  assert.equal(score, 0)
  assert.deepEqual(ungrounded, ['250'])
})

test('scores partial grounding', () => {
  const { score } = numericGroundedness('Boil 3 minutes above 9000 feet.', 'Boil 3 minutes above 6500 feet.')
  // 3 is excluded as a small integer; 9000 is claimed and unsupported.
  assert.equal(score, 0)
})

test('ignores small integers, which appear incidentally in any prose', () => {
  // "3 layers" and "step 2" would otherwise dominate the score with noise.
  const { score } = numericGroundedness('There are 3 layers and 2 rules.', 'Wear a base, mid, and shell layer.')
  assert.equal(score, null)
})

test('returns null when the answer makes no numeric claims', () => {
  const { score } = numericGroundedness('Cool the burn under running water.', 'Cool for twenty minutes.')
  assert.equal(score, null)
})

test('grounding is null, not 1.0, for qualitative answers', () => {
  // Folding these in as perfect would quietly inflate the aggregate.
  assert.equal(numericGroundedness('Use a pressure canner.', 'context').score, null)
})

// --- pattern matching -----------------------------------------------------------------

test('matchPatterns reports both sides', () => {
  const { matched, missed } = matchPatterns('boil for three minutes', [
    String.raw`\b(3|three) minutes?`,
    'never appears',
  ])
  assert.equal(matched.length, 1)
  assert.deepEqual(missed, ['never appears'])
})

test('pattern matching is case insensitive', () => {
  assert.equal(matchPatterns('BOIL FOR 3 MINUTES', ['3 minutes']).matched.length, 1)
})

// --- scoreAnswer ------------------------------------------------------------------------

test('a correct answer passes every assertion', () => {
  const s = scoreAnswer({
    answer: 'Boil the water for **3 minutes** above 6,500 feet.',
    context: 'boil for 3 minutes above 6,500 feet',
    mustInclude: [String.raw`\b(3|three) minutes?`],
    mustNotInclude: ['distill'],
    expectRefusal: false,
  })
  assert.equal(s.correct, true)
  assert.deepEqual(s.missedRequired, [])
  assert.deepEqual(s.hitForbidden, [])
  assert.equal(s.refusalCorrect, true)
  assert.deepEqual(s.leakage, [])
})

test('a forbidden phrase fails the case even when the required one matched', () => {
  const s = scoreAnswer({
    answer: 'Boil for 3 minutes, or distill it.',
    context: 'boil for 3 minutes',
    mustInclude: ['3 minutes'],
    mustNotInclude: ['distill'],
    expectRefusal: false,
  })
  assert.equal(s.correct, false)
  assert.deepEqual(s.hitForbidden, ['distill'])
})

test('declining an out-of-corpus question is scored correct', () => {
  const s = scoreAnswer({
    answer: "I don't have information about the warranty period.",
    context: '',
    mustInclude: [],
    mustNotInclude: [],
    expectRefusal: true,
  })
  assert.equal(s.refused, true)
  assert.equal(s.refusalCorrect, true)
})

test('inventing an answer to an out-of-corpus question is scored incorrect', () => {
  // This is the failure that matters most: a confident, fabricated reply.
  const s = scoreAnswer({
    answer: 'The TR-88 carries a 2 year warranty.',
    context: '',
    mustInclude: [],
    mustNotInclude: [],
    expectRefusal: true,
  })
  assert.equal(s.refused, false)
  assert.equal(s.refusalCorrect, false)
})

test('hedging on an answerable question is scored incorrect', () => {
  // The exact regression that started NOMAD's RAG work: the model has good
  // context and hedges anyway.
  const s = scoreAnswer({
    answer: "I couldn't find specific context, but generally you boil water.",
    context: 'boil for 3 minutes',
    mustInclude: [],
    mustNotInclude: [],
    expectRefusal: false,
  })
  assert.equal(s.refusalCorrect, false)
  assert.ok(s.leakage.length > 0, 'should also flag the retrieval narration')
})

// --- repeat aggregation --------------------------------------------------------------------

test('all-pass is stable', () => {
  const s = summarizeRepeats([true, true, true])
  assert.equal(s.passRate, 1)
  assert.equal(s.unstable, false)
})

test('all-fail is stable', () => {
  assert.equal(summarizeRepeats([false, false, false]).unstable, false)
})

test('a mixed outcome is flagged unstable and kept out of gating', () => {
  const s = summarizeRepeats([true, false, true])
  assert.equal(s.passes, 2)
  assert.ok(Math.abs(s.passRate - 2 / 3) < 1e-9)
  assert.equal(s.unstable, true)
})

test('a single repeat is never called unstable', () => {
  assert.equal(summarizeRepeats([true]).unstable, false)
  assert.equal(summarizeRepeats([false]).unstable, false)
})

test('numeric summary reports mean and stddev', () => {
  const s = summarizeNumeric([1, 1, 1])!
  assert.equal(s.mean, 1)
  assert.equal(s.stddev, 0)
  assert.equal(s.n, 3)
})

test('numeric summary ignores nulls', () => {
  const s = summarizeNumeric([1, null, 3])!
  assert.equal(s.mean, 2)
  assert.equal(s.n, 2)
})

test('numeric summary is null when there is nothing to summarize', () => {
  assert.equal(summarizeNumeric([null, null]), null)
})

test('stddev is non-zero when runs disagree, which is the noise warning', () => {
  const s = summarizeNumeric([0, 1])!
  assert.equal(s.mean, 0.5)
  assert.equal(s.stddev, 0.5)
})
