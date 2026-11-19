/**
 * Characterization tests for the prompt-assembly helpers extracted out of
 * OllamaController into RagPipelineService.
 *
 * These lock in the *current* behaviour so any later deliberate change shows up
 * as a failing test rather than a silent shift in answer quality.
 *
 * Token budgeting moved out of this module: the estimate now lives in
 * `token_estimate.spec.ts` and the allocation in `context_budget.spec.ts`. What
 * remains here is model-size tiering and context-block rendering.
 *
 * Pure functions only — no MySQL, Redis, Qdrant, or Ollama needed:
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildContextBlock,
  getContextLimitsForModel,
  type ContextLimitTier,
} from '../../app/utils/rag_prompt.js'
import { SYSTEM_PROMPTS } from '../../constants/ollama.js'

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

// --- SYSTEM_PROMPTS.rag_context (#1437) --------------------------------------
//
// Not a snapshot: the wording is expected to be tuned against eval:generation.
// These pin only the contract, so a later edit cannot quietly bring back the
// instruction that made the model ignore a "use ONLY the knowledge base" request
// and answer from memory without saying so.

const ragPrompt = SYSTEM_PROMPTS.rag_context('[Context 1 — Water]\nboil for 3 minutes')

test('rag_context: wraps the rendered context block', () => {
  assert.ok(ragPrompt.includes('[Knowledge Base Context]\n[Context 1 — Water]\nboil for 3 minutes'))
})

test('rag_context: no longer tells the model to fall back silently', () => {
  assert.doesNotMatch(ragPrompt, /silently/i)
  assert.doesNotMatch(ragPrompt, /do not mention the knowledge base, the context/i)
})

test('rag_context: a gap in the context is named, not papered over', () => {
  assert.match(ragPrompt, /covers only part of the question, say so plainly/)
})

test('rag_context: honours a request to use only the knowledge base', () => {
  assert.match(ragPrompt, /asked you to use only the knowledge base, do not use general knowledge/)
})

test('rag_context: keeps grounded answers and chit-chat free of disclaimers', () => {
  // The reason "silently" was added in the first place: small models hedged on
  // answers the context did support, and remarked on the library in reply to a
  // greeting that leaked past the relevance floor.
  assert.match(ragPrompt, /answer\s+directly and specifically, with no disclaimer/)
  assert.match(ragPrompt, /not asking for information[\s\S]*?do not mention the knowledge base/)
})

test('rag_context: forbids citing a source for what it does not say', () => {
  assert.match(
    ragPrompt,
    /Never cite or name a knowledge base source for something it does not say/
  )
})
