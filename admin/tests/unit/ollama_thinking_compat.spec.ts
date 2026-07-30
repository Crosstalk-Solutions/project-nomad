import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { OllamaService } from '../../app/services/ollama_service.js'

type CompletionCall = {
  params: Record<string, unknown>
  options: { signal?: AbortSignal } | undefined
}

function serviceWithCompletion(result: unknown) {
  const calls: CompletionCall[] = []
  const service = new OllamaService()

  Object.assign(service as any, {
    openai: {
      chat: {
        completions: {
          create: async (params: Record<string, unknown>, options?: { signal?: AbortSignal }) => {
            calls.push({ params, options })
            return result
          },
        },
      },
    },
  })

  return { service, calls }
}

async function* completionStream(chunks: unknown[]) {
  yield* chunks
}

test('chat normalizes reasoning from an OpenAI-compatible response', async () => {
  const { service } = serviceWithCompletion({
    model: 'qwen3.5:4b',
    choices: [
      {
        message: {
          content: 'NOMAD works',
          reasoning: 'I should answer with exactly two words.',
        },
      },
    ],
  })

  const response = await service.chat({
    model: 'qwen3.5:4b',
    messages: [{ role: 'user', content: 'Reply with exactly two words.' }],
  })

  assert.deepEqual(response, {
    message: {
      content: 'NOMAD works',
      thinking: 'I should answer with exactly two words.',
    },
    done: true,
    model: 'qwen3.5:4b',
  })
})

test('chat keeps native thinking compatibility when reasoning is absent', async () => {
  const { service } = serviceWithCompletion({
    model: 'native-thinking-model',
    choices: [
      {
        message: {
          content: 'done',
          thinking: 'native thought',
        },
      },
    ],
  })

  const response = await service.chat({
    model: 'native-thinking-model',
    messages: [{ role: 'user', content: 'test' }],
  })

  assert.equal(response.message.thinking, 'native thought')
})

test('chat disables reasoning only for a thinking-capable model and forwards abort signal', async () => {
  const abortController = new AbortController()
  const { service, calls } = serviceWithCompletion({
    model: 'qwen3.5:4b',
    choices: [{ message: { content: 'answer' } }],
  })

  await service.chat({
    model: 'qwen3.5:4b',
    messages: [{ role: 'user', content: 'test' }],
    think: false,
    thinkingCapable: true,
    signal: abortController.signal,
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].params.reasoning_effort, 'none')
  assert.equal('think' in calls[0].params, false)
  assert.equal(calls[0].options?.signal, abortController.signal)
})

test('chat omits Ollama reasoning controls for a non-thinking backend', async () => {
  const { service, calls } = serviceWithCompletion({
    model: 'openai-compatible-model',
    choices: [{ message: { content: 'answer' } }],
  })

  await service.chat({
    model: 'openai-compatible-model',
    messages: [{ role: 'user', content: 'test' }],
    think: false,
    thinkingCapable: false,
  })

  assert.equal('reasoning_effort' in calls[0].params, false)
  assert.equal('think' in calls[0].params, false)
})

test('chatStream exposes reasoning deltas and reports completion', async () => {
  const upstream = completionStream([
    {
      choices: [
        {
          delta: { content: '', reasoning: 'Thinking' },
          finish_reason: null,
        },
      ],
    },
    {
      choices: [
        {
          delta: { content: 'NOMAD works' },
          finish_reason: 'stop',
        },
      ],
    },
  ])
  const { service } = serviceWithCompletion(upstream)

  const stream = await service.chatStream({
    model: 'qwen3.5:4b',
    messages: [{ role: 'user', content: 'Reply with exactly two words.' }],
  })
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)

  assert.deepEqual(chunks, [
    {
      message: { content: '', thinking: 'Thinking' },
      done: false,
    },
    {
      message: { content: 'NOMAD works', thinking: '' },
      done: true,
    },
  ])
})

test('chatStream maps medium thinking to reasoning_effort and forwards abort signal', async () => {
  const abortController = new AbortController()
  const { service, calls } = serviceWithCompletion(completionStream([]))

  const stream = await service.chatStream({
    model: 'gpt-oss:20b',
    messages: [{ role: 'user', content: 'test' }],
    think: 'medium',
    thinkingCapable: true,
    signal: abortController.signal,
  })
  for await (const chunk of stream) {
    // Empty upstream stream.
    void chunk
  }

  assert.equal(calls[0].params.reasoning_effort, 'medium')
  assert.equal(calls[0].options?.signal, abortController.signal)
})
