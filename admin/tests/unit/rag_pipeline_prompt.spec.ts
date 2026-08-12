/**
 * Characterization tests for the prompt-assembly helpers extracted out of
 * OllamaController into RagPipelineService.
 *
 * These lock in the *current* behaviour, quirks included, so the extraction is
 * provably a no-op and so any later deliberate change to context budgeting or
 * the num_ctx ladder shows up as a failing test rather than a silent shift in
 * answer quality.
 *
 * Pure functions only — no MySQL, Redis, Qdrant, or Ollama needed:
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildContextBlock,
  deriveNumCtx,
  getContextLimitsForModel,
  NUM_CTX_TRIGGER_TOKENS,
  PROMPT_CHARS_PER_TOKEN,
  trimToContextBudget,
  type ContextLimitTier,
} from '../../app/utils/rag_prompt.js'

/** Mirrors RAG_CONTEXT_LIMITS in constants/ollama.ts. Passed in explicitly so
 *  these tests need no AdonisJS-flavoured imports, per the kb_ratio_lookup
 *  precedent — and so a change to the shipped tiers shows up here as a
 *  deliberate edit rather than a silently-passing test. */
const TIERS: ContextLimitTier[] = [
  { maxParams: 3, maxResults: 2, maxTokens: 1000 },
  { maxParams: 8, maxResults: 4, maxTokens: 2500 },
  { maxParams: Infinity, maxResults: 5, maxTokens: 0 },
]

const limits = (model: string) => getContextLimitsForModel(model, TIERS)

const chunk = (text: string, metadata: Record<string, any> = {}) => ({
  text,
  score: 0.5,
  metadata,
})

// --- getContextLimitsForModel ------------------------------------------------

test('context limits: 1-3B models get the tightest budget', () => {
  assert.deepEqual(limits('llama3.2:1b'), { maxResults: 2, maxTokens: 1000 })
  assert.deepEqual(limits('qwen2.5:3b'), { maxResults: 2, maxTokens: 1000 })
})

test('context limits: fractional sizes parse correctly', () => {
  // "1.5b" must read as 1.5, not 1 or 15 — it decides which tier the model lands in.
  assert.deepEqual(limits('qwen2.5:1.5b'), { maxResults: 2, maxTokens: 1000 })
})

test('context limits: 4-8B tier', () => {
  assert.deepEqual(limits('llama3.1:8b'), { maxResults: 4, maxTokens: 2500 })
})

test('context limits: 13B+ is uncapped', () => {
  assert.deepEqual(limits('llama2:70b'), { maxResults: 5, maxTokens: 0 })
})

test('context limits: unparseable model name is assumed to be 8B', () => {
  // Documented quirk, not an endorsement: "phi3" has no size token, so it is
  // handed the 4-8B budget regardless of what it actually is.
  assert.deepEqual(limits('phi3'), { maxResults: 4, maxTokens: 2500 })
})

test('context limits: quantization suffixes do not confuse the size parse', () => {
  assert.deepEqual(limits('llama3.1:8b-text-q4_1'), {
    maxResults: 4,
    maxTokens: 2500,
  })
})

// --- trimToContextBudget -----------------------------------------------------

test('trim: caps the number of results', () => {
  const docs = [chunk('a'), chunk('b'), chunk('c'), chunk('d')]
  const out = trimToContextBudget(docs, { maxResults: 2, maxTokens: 0 })
  assert.equal(out.length, 2)
  assert.deepEqual(
    out.map((d: { text: string }) => d.text),
    ['a', 'b']
  )
})

test('trim: maxTokens of 0 means uncapped', () => {
  const docs = [chunk('x'.repeat(50_000)), chunk('y'.repeat(50_000))]
  const out = trimToContextBudget(docs, { maxResults: 5, maxTokens: 0 })
  assert.equal(out.length, 2)
})

test('trim: the top result survives even when it alone blows the budget', () => {
  // This is the guard that stops a small model from getting *no* context at all
  // when the single best chunk happens to be enormous.
  const huge = chunk('x'.repeat(100_000))
  const out = trimToContextBudget([huge, chunk('small')], { maxResults: 5, maxTokens: 1000 })
  assert.equal(out.length, 1)
  assert.equal(out[0].text.length, 100_000)
})

test('trim: drops later results once the character cap is exceeded', () => {
  const capChars = 1000 * PROMPT_CHARS_PER_TOKEN // 3500
  const docs = [chunk('a'.repeat(1000)), chunk('b'.repeat(1000)), chunk('c'.repeat(3000))]
  const out = trimToContextBudget(docs, { maxResults: 5, maxTokens: 1000 })
  // Running totals: 1000 (kept, idx 0), 2000 (<= 3500, kept), 5000 (> 3500, dropped).
  assert.deepEqual(
    out.map((d: { text: string }) => d.text[0]),
    ['a', 'b']
  )
  assert.ok(capChars === 3500)
})

test('trim: the count cap is applied before the token cap', () => {
  const docs = [chunk('a'), chunk('b'), chunk('c')]
  const out = trimToContextBudget(docs, { maxResults: 1, maxTokens: 1000 })
  assert.equal(out.length, 1)
})

// --- buildContextBlock -------------------------------------------------------

test('context block: numbers each chunk from 1', () => {
  const out = buildContextBlock([chunk('first'), chunk('second')])
  assert.equal(out, '[Context 1]\nfirst\n\n[Context 2]\nsecond')
})

test('context block: labels with full_title when present', () => {
  const out = buildContextBlock([chunk('body', { full_title: 'Water - Boiling' })])
  assert.equal(out, '[Context 1 — Water - Boiling]\nbody')
})

test('context block: falls back to article_title', () => {
  const out = buildContextBlock([chunk('body', { article_title: 'Water' })])
  assert.equal(out, '[Context 1 — Water]\nbody')
})

test('context block: full_title wins over article_title', () => {
  const out = buildContextBlock([chunk('body', { full_title: 'A - B', article_title: 'A' })])
  assert.equal(out, '[Context 1 — A - B]\nbody')
})

test('context block: never leaks the relevance score to the model', () => {
  // Deliberate: nomic cosine scores for genuinely relevant passages sit around
  // 0.4-0.6, and showing the model "42%" primes it to distrust correct context.
  const out = buildContextBlock([chunk('body', { source: 'f.md', semantic_score: 0.42 })])
  assert.ok(!out.includes('0.42'))
  assert.ok(!out.includes('42'))
})

// --- deriveNumCtx ------------------------------------------------------------

const sys = (chars: number) => ({ role: 'system' as const, content: 'x'.repeat(chars) })

test('numCtx: unset below the trigger, so the backend default applies', () => {
  // Ollama's default is a silent 2048. Below the trigger we deliberately say
  // nothing — a known risk, captured here so a future fix is a visible change.
  assert.equal(deriveNumCtx([sys(100)]), undefined)
})

test('numCtx: exactly at the trigger is still unset (strict greater-than)', () => {
  const chars = NUM_CTX_TRIGGER_TOKENS * PROMPT_CHARS_PER_TOKEN // 10500 -> exactly 3000 tokens
  assert.equal(deriveNumCtx([sys(chars)]), undefined)
})

test('numCtx: one character past the trigger steps onto the ladder', () => {
  const chars = NUM_CTX_TRIGGER_TOKENS * PROMPT_CHARS_PER_TOKEN + 1
  assert.equal(deriveNumCtx([sys(chars)]), 8192)
})

test('numCtx: climbs the ladder as the system prompt grows', () => {
  // ~7000 tokens of system prompt + 2048 headroom = 9048 -> next rung is 16384.
  assert.equal(deriveNumCtx([sys(7000 * PROMPT_CHARS_PER_TOKEN)]), 16384)
})

test('numCtx: saturates at the top of the ladder rather than failing', () => {
  assert.equal(deriveNumCtx([sys(1_000_000)]), 65536)
})

test('numCtx: only system messages count toward the budget', () => {
  const messages = [sys(100), { role: 'user' as const, content: 'y'.repeat(1_000_000) }]
  assert.equal(deriveNumCtx(messages), undefined)
})

test('numCtx: system messages are summed, not measured individually', () => {
  const half = (NUM_CTX_TRIGGER_TOKENS * PROMPT_CHARS_PER_TOKEN) / 2 + 10
  assert.equal(deriveNumCtx([sys(half), sys(half)]), 8192)
})
