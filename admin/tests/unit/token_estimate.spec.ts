import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONVERSATION_OVERHEAD_TOKENS,
  ESTIMATE_SAFETY_MARGIN,
  MAX_CALIBRATION_RATIO,
  MIN_CALIBRATION_RATIO,
  PER_MESSAGE_OVERHEAD_TOKENS,
  clampRatio,
  estimateMessagesTokens,
  estimateTokens,
  estimateTokensConservative,
  updateEwma,
} from '../../app/utils/token_estimate.js'

/**
 * The accuracy claim these guard is not "the estimate is correct" — it can't be,
 * without the model's own vocabulary. It is "the estimate tracks a real
 * tokenizer closely enough, and consistently enough per model, that a single
 * learned factor fixes the rest".
 *
 * REAL_COUNTS below are actual `prompt_eval_count` values recorded from
 * llama3:8b via /api/chat, so the regression bounds mean something. Re-record
 * them (single user message, num_predict:1) if the fixtures ever change.
 */
const FIXTURES = {
  prose:
    'Water purification in an emergency comes down to three reliable options. Boiling is the most dependable: bring water to a rolling boil for one full minute, or three minutes above 6,500 feet of elevation. Chemical treatment with unscented household bleach works when fuel is scarce; add eight drops per gallon, stir, and wait thirty minutes. Filtration removes protozoa and bacteria but not viruses, so pair it with one of the other two methods when the source is questionable.',
  markdown_table:
    '| Method | Time | Removes | Notes |\n|---|---|---|---|\n| Boiling | 1 min | Bacteria, viruses, protozoa | Needs fuel |\n| Bleach | 30 min | Bacteria, viruses | 8 drops/gal |\n| Filter (0.2um) | Instant | Bacteria, protozoa | Not viruses |\n| UV (SteriPEN) | 90 sec | All | Needs batteries, clear water |\n| Distillation | 1 hr | Everything incl. salts | Slow, fuel-heavy |',
  json: '{"model":"llama3:8b","messages":[{"role":"system","content":"You are helpful."}],"options":{"num_ctx":8192,"num_predict":512,"temperature":0.7,"seed":42},"keep_alive":"10m","stream":true}',
  list: '- Boil water for one minute\n- Store in food-grade containers\n- Rotate stock every six months\n- Label every container with a fill date\n- Keep two weeks minimum per person\n- One gallon per person per day\n- Add extra for pets and sanitation',
}

/** Measured prompt_eval_count from llama3:8b for a single user message. */
const REAL_COUNTS: Record<keyof typeof FIXTURES, number> = {
  prose: 108,
  markdown_table: 127,
  json: 67,
  list: 64,
}

test('estimate stays within 20% of real token counts on varied content', () => {
  for (const [name, text] of Object.entries(FIXTURES)) {
    const real = REAL_COUNTS[name as keyof typeof FIXTURES]
    const estimated = estimateMessagesTokens([{ role: 'user', content: text }])
    const error = Math.abs(estimated - real) / real
    assert.ok(
      error < 0.2,
      `${name}: estimated ${estimated} vs real ${real} (${(error * 100).toFixed(1)}% error)`
    )
  }
})

test('beats a fixed chars-per-token divisor on average', () => {
  // The specific failure of a fixed divisor is that it cannot be right for both
  // prose (~4 chars/token) and structured text (~2.5). Tuning it for one breaks
  // the other, and structured text is what overflows windows.
  let segmenterError = 0
  let divisorError = 0
  for (const [name, text] of Object.entries(FIXTURES)) {
    const real = REAL_COUNTS[name as keyof typeof FIXTURES]
    segmenterError += Math.abs(estimateMessagesTokens([{ role: 'user', content: text }]) - real) / real
    divisorError += Math.abs(Math.ceil(text.length / 3.5) - real) / real
  }
  assert.ok(
    segmenterError < divisorError,
    `segmenter total error ${segmenterError.toFixed(3)} should beat chars/3.5 ${divisorError.toFixed(3)}`
  )
})

test('structured text costs more per character than prose', () => {
  // The property that makes a fixed divisor wrong, asserted directly.
  const prosePerChar = estimateTokens(FIXTURES.prose) / FIXTURES.prose.length
  const jsonPerChar = estimateTokens(FIXTURES.json) / FIXTURES.json.length
  assert.ok(jsonPerChar > prosePerChar, 'JSON should estimate more tokens per character than prose')
})

test('empty and whitespace input', () => {
  assert.equal(estimateTokens(''), 0)
  assert.equal(estimateMessagesTokens([]), 0)
  assert.ok(estimateTokens('   ') >= 1)
})

test('newlines are counted, not swallowed', () => {
  assert.ok(estimateTokens('a\nb\nc') > estimateTokens('a b c'))
})

test('long words are split into multiple tokens', () => {
  // A 40-char identifier is several BPE pieces, not one.
  assert.ok(estimateTokens('supercalifragilisticexpialidocious') > 3)
})

test('CJK characters cost roughly a token each', () => {
  const text = '緊急時の水の浄化'
  const estimated = estimateTokens(text)
  assert.ok(estimated >= text.length, `expected >= ${text.length} tokens, got ${estimated}`)
})

test('message overhead scales with message count', () => {
  const one = estimateMessagesTokens([{ role: 'user', content: 'hello' }])
  const three = estimateMessagesTokens([
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hello' },
    { role: 'user', content: 'hello' },
  ])
  assert.equal(three - one, 2 * (estimateTokens('hello') + PER_MESSAGE_OVERHEAD_TOKENS))
  assert.ok(one > estimateTokens('hello') + CONVERSATION_OVERHEAD_TOKENS)
})

test('calibration ratio scales the estimate', () => {
  const base = estimateTokens(FIXTURES.prose)
  const scaled = estimateTokens(FIXTURES.prose, 1.25)
  assert.equal(scaled, Math.ceil(base * 1.25))
})

test('conservative estimate never under-reports', () => {
  const base = estimateTokens(FIXTURES.prose)
  assert.ok(estimateTokensConservative(FIXTURES.prose) >= base)
  assert.equal(estimateTokensConservative(FIXTURES.prose), Math.ceil(base * ESTIMATE_SAFETY_MARGIN))
})

test('EWMA seeds from the first observation then damps', () => {
  assert.equal(updateEwma(null, 1.3), 1.3)
  // A single outlier must nudge, not redefine.
  const after = updateEwma(1.0, 2.0, 0.25)
  assert.equal(after, 1.25)
  assert.ok(after < 2.0)
})

test('ratio clamping rejects nonsense', () => {
  assert.equal(clampRatio(Number.NaN), 1)
  assert.equal(clampRatio(0), 1)
  assert.equal(clampRatio(-3), 1)
  assert.equal(clampRatio(99), MAX_CALIBRATION_RATIO)
  assert.equal(clampRatio(0.01), MIN_CALIBRATION_RATIO)
  // The real measured factors must survive clamping untouched.
  assert.equal(clampRatio(1.26), 1.26)
  assert.equal(clampRatio(1.02), 1.02)
})
