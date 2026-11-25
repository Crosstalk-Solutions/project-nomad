/**
 * Tests for normalizeOpenAiMessages — the rewrite that makes NOMAD's
 * multi-system-message prompt satisfy the Qwen-family Jinja invariant (at most
 * one system message, and it first) that strict OpenAI-compatible GGUF backends
 * enforce. Pure function, no app boot:
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js'
import { normalizeOpenAiMessages } from '../../app/utils/message_normalization.js'

const sys = (content: string): ChatCompletionMessageParam => ({ role: 'system', content })
const user = (content: string): ChatCompletionMessageParam => ({ role: 'user', content })
const assistant = (content: string): ChatCompletionMessageParam => ({ role: 'assistant', content })

const roles = (messages: ChatCompletionMessageParam[]) => messages.map((m) => m.role)

test('no-op: a single leading system with no trailing system is returned unchanged', () => {
  const input = [sys('rules'), user('q1'), assistant('a1'), user('q2')]
  assert.equal(normalizeOpenAiMessages(input), input, 'reference identity on the well-formed path')
})

test('no-op: empty array', () => {
  const input: ChatCompletionMessageParam[] = []
  assert.deepEqual(normalizeOpenAiMessages(input), [])
})

test('no-op: no system message at all', () => {
  const input = [user('q1'), assistant('a1'), user('q2')]
  assert.equal(normalizeOpenAiMessages(input), input)
})

test('multiple leading systems collapse into one at index 0, order preserved', () => {
  const out = normalizeOpenAiMessages([
    sys('NOMAD.md instructions'),
    sys('Formatting rules'),
    user('q1'),
    assistant('a1'),
    user('q2'),
  ])
  assert.equal(out[0].role, 'system')
  assert.equal(out[0].content, 'NOMAD.md instructions\n\nFormatting rules')
  assert.deepEqual(roles(out), ['system', 'user', 'assistant', 'user'])
})

test('a trailing system (RAG block) is relocated into the last user message', () => {
  const out = normalizeOpenAiMessages([
    sys('rules'),
    user('earlier question'),
    assistant('earlier answer'),
    sys('RAG CONTEXT'),
    user('current question'),
  ])
  assert.deepEqual(roles(out), ['system', 'user', 'assistant', 'user'])
  assert.ok(!out.slice(1).some((m) => m.role === 'system'), 'no system message after index 0')
  const last = out[out.length - 1]
  assert.equal(last.role, 'user')
  assert.ok(
    (last.content as string).startsWith('RAG CONTEXT\n\ncurrent question'),
    `context should be prepended to the question, got: ${(last.content as string).slice(0, 40)}`
  )
})

test('a trailing system merges into a multimodal user message, preserving image parts', () => {
  const out = normalizeOpenAiMessages([
    sys('rules'),
    user('earlier'),
    sys('RAG CONTEXT'),
    {
      role: 'user',
      content: [
        { type: 'text', text: 'what is this?' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } },
      ],
    },
  ])
  const last = out[out.length - 1]
  assert.equal(last.role, 'user')
  const parts = last.content as Array<{ type: string; text?: string }>
  assert.equal(parts[0].type, 'text')
  assert.ok(parts[0].text!.startsWith('RAG CONTEXT\n\nwhat is this?'))
  assert.equal(parts[1].type, 'image_url')
})

test('a trailing system with no leading system does not invent a front system message', () => {
  const out = normalizeOpenAiMessages([user('earlier'), sys('RAG CONTEXT'), user('current')])
  assert.notEqual(out[0].role, 'system', 'no front system message should be created')
  const last = out[out.length - 1]
  assert.ok((last.content as string).startsWith('RAG CONTEXT\n\ncurrent'))
})

test('normalisation is idempotent', () => {
  const once = normalizeOpenAiMessages([
    sys('A'),
    sys('B'),
    user('q1'),
    assistant('a1'),
    sys('RAG'),
    user('q2'),
  ])
  const twice = normalizeOpenAiMessages(once)
  assert.deepEqual(twice, once)
})

test('a null assistant content (tool-call turn) does not break relocation', () => {
  const out = normalizeOpenAiMessages([
    sys('rules'),
    user('q1'),
    assistant(''), // stand-in: real assistant turns with tool_calls carry content: null
    sys('RAG CONTEXT'),
    user('q2'),
  ])
  assert.deepEqual(roles(out), ['system', 'user', 'assistant', 'user'])
  assert.ok((out[out.length - 1].content as string).startsWith('RAG CONTEXT\n\nq2'))
})

test('the Qwen invariant holds: exactly one system message and it is first', () => {
  // The shape the pipeline actually produces with tail placement, elision and a
  // retrieved block, normalised.
  const out = normalizeOpenAiMessages([
    sys('NOMAD.md'),
    sys('formatting'),
    sys('[Earlier messages omitted]'),
    user('q1'),
    assistant('a1'),
    user('q2'),
    assistant('a2'),
    sys('RAG CONTEXT'),
    user('current question'),
  ])
  const systemCount = out.filter((m) => m.role === 'system').length
  assert.equal(systemCount, 1)
  assert.equal(out[0].role, 'system')
})
