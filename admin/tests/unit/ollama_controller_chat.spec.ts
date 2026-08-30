/**
 * Controller-level vision behaviour (#1176).
 *
 * A Japa spec, not a plain `node:test` file: it constructs OllamaController,
 * which imports '@adonisjs/core/services/logger' at module scope and therefore
 * needs a booted app. Run with `node ace test unit`, not `npm run test:unit` --
 * the latter is the plain-runner path used by the pure-function specs.
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'
import sharp from 'sharp'
import OllamaController from '../../app/controllers/ollama_controller.js'

class FakeSseResponse extends EventEmitter {
  chunks: string[] = []
  ended = false

  setHeader() {}
  flushHeaders() {}
  write(chunk: string) {
    this.chunks.push(chunk)
  }
  end() {
    this.ended = true
  }
}

test('unknown backend image rejection returns actionable compatibility details over SSE', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nomad-controller-image-'))
  const imagePath = join(directory, 'sample.png')
  const image = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: '#556b2f',
    },
  })
    .png()
    .toBuffer()
  await writeFile(imagePath, image)

  const rawResponse = new FakeSseResponse()
  const payload = {
    model: 'openai-compatible-model',
    messages: [{ role: 'user', content: 'What is shown?' }],
    stream: true,
  }
  const request = {
    files: () => [
      {
        tmpPath: imagePath,
        size: image.byteLength,
        clientName: 'sample.png',
        isValid: true,
      },
    ],
    input: (name: string, fallback?: unknown) =>
      name === 'payload' ? JSON.stringify(payload) : fallback,
  }
  const response = {
    response: rawResponse,
    status: () => response,
    send: () => undefined,
  }
  const ollamaService = {
    getModelCapabilities: async () => ({ thinking: false, vision: 'unknown' as const }),
    chatStream: async () => {
      throw new Error('The upstream backend rejected image_url content.')
    },
  }
  const controller = new OllamaController(
    {} as any,
    {} as any,
    ollamaService as any,
    // dev moved prompt assembly, NOMAD.md injection and retrieval into
    // RagPipelineService after this test was written. The stub returns the
    // messages untouched so these cases still exercise only the vision paths.
    {
      buildPrompt: async (messages: unknown) => ({
        messages,
        numCtx: undefined,
        numPredict: undefined,
        retrieved: [],
        injected: [],
      }),
    } as any,
    {
      hasDocuments: async () => false,
      searchSimilarDocuments: async () => [],
    } as any,
    { record: async () => undefined } as any
  )

  try {
    await controller.chat({ request, response } as any)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }

  assert.equal(rawResponse.ended, true)
  assert.equal(rawResponse.chunks.length, 1)
  const event = JSON.parse(rawResponse.chunks[0].replace(/^data: /, '').trim())
  assert.equal(event.error, true)
  assert.match(event.message, /cannot confirm/i)
  assert.match(event.message, /supports images/i)
  assert.doesNotMatch(event.message, /backend|metadata|projector/i)
})

test('unknown backend image rejection returns actionable compatibility details without streaming', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nomad-controller-image-'))
  const imagePath = join(directory, 'sample.png')
  const image = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: '#556b2f',
    },
  })
    .png()
    .toBuffer()
  await writeFile(imagePath, image)

  const payload = {
    model: 'openai-compatible-model',
    messages: [{ role: 'user', content: 'What is shown?' }],
    stream: false,
  }
  const request = {
    files: () => [
      {
        tmpPath: imagePath,
        size: image.byteLength,
        clientName: 'sample.png',
        isValid: true,
      },
    ],
    input: (name: string, fallback?: unknown) =>
      name === 'payload' ? JSON.stringify(payload) : fallback,
  }
  let statusCode: number | undefined
  let responseBody: unknown
  const response = {
    response: new FakeSseResponse(),
    status: (code: number) => {
      statusCode = code
      return response
    },
    send: (body: unknown) => {
      responseBody = body
      return body
    },
  }
  const ollamaService = {
    getModelCapabilities: async () => ({ thinking: false, vision: 'unknown' as const }),
    chat: async () => {
      throw new Error('The upstream backend rejected image_url content.')
    },
  }
  const controller = new OllamaController(
    {} as any,
    {} as any,
    ollamaService as any,
    // dev moved prompt assembly, NOMAD.md injection and retrieval into
    // RagPipelineService after this test was written. The stub returns the
    // messages untouched so these cases still exercise only the vision paths.
    {
      buildPrompt: async (messages: unknown) => ({
        messages,
        numCtx: undefined,
        numPredict: undefined,
        retrieved: [],
        injected: [],
      }),
    } as any,
    {
      hasDocuments: async () => false,
      searchSimilarDocuments: async () => [],
    } as any,
    { record: async () => undefined } as any
  )

  try {
    await controller.chat({ request, response } as any)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }

  assert.equal(statusCode, 422)
  assert.match((responseBody as { message: string }).message, /cannot confirm/i)
  assert.match((responseBody as { message: string }).message, /supports images/i)
  assert.doesNotMatch(
    (responseBody as { message: string }).message,
    /backend|metadata|projector/i
  )
})

test('unknown backend image requests do not mislabel preprocessing failures as incompatibility', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nomad-controller-image-'))
  const imagePath = join(directory, 'sample.png')
  const image = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: '#556b2f',
    },
  })
    .png()
    .toBuffer()
  await writeFile(imagePath, image)

  const rawResponse = new FakeSseResponse()
  const payload = {
    model: 'openai-compatible-model',
    messages: [{ role: 'user', content: 'What is shown?' }],
    stream: true,
  }
  const request = {
    files: () => [
      {
        tmpPath: imagePath,
        size: image.byteLength,
        clientName: 'sample.png',
        isValid: true,
      },
    ],
    input: (name: string, fallback?: unknown) =>
      name === 'payload' ? JSON.stringify(payload) : fallback,
  }
  const response = {
    response: rawResponse,
    status: () => response,
    send: () => undefined,
  }
  let inferenceCalled = false
  const ollamaService = {
    getModelCapabilities: async () => ({ thinking: false, vision: 'unknown' as const }),
    chatStream: async () => {
      inferenceCalled = true
      throw new Error('Inference should not be reached')
    },
  }
  const controller = new OllamaController(
    {} as any,
    {} as any,
    ollamaService as any,
    // Prompt assembly (NOMAD.md included) now lives in RagPipelineService, so
    // that is where this failure originates. The assertion is unchanged and is
    // the one that matters: a failure before inference must not reach the model,
    // and must still close the stream with a single error event.
    {
      buildPrompt: async () => {
        throw new Error('Prompt assembly unavailable')
      },
    } as any,
    {
      hasDocuments: async () => false,
      searchSimilarDocuments: async () => [],
    } as any,
    { record: async () => undefined } as any
  )

  try {
    await controller.chat({ request, response } as any)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }

  assert.equal(inferenceCalled, false)
  assert.equal(rawResponse.ended, true)
  assert.equal(rawResponse.chunks.length, 1)
  const event = JSON.parse(rawResponse.chunks[0].replace(/^data: /, '').trim())
  assert.deepEqual(event, { error: true })
})

test('text-only JSON chat preserves long histories through the controller boundary', async () => {
  const messages = Array.from({ length: 201 }, (_, index) => ({
    role: 'user' as const,
    content: `Message ${index}`,
  }))
  const payload = {
    model: 'known-text-model',
    messages,
    stream: false,
  }
  const request = {
    files: () => [],
    input: (name: string, fallback?: unknown) =>
      name === 'collection' ? 'A'.repeat(500) : fallback,
    validateUsing: (schema: { validate(value: unknown): Promise<unknown> }) =>
      schema.validate(payload),
  }
  const response = {
    response: new FakeSseResponse(),
    status: () => response,
    send: () => undefined,
  }
  let upstreamMessages: unknown[] = []
  const ollamaService = {
    getModelCapabilities: async () => ({ thinking: false, vision: 'unsupported' as const }),
    chat: async (chatRequest: { messages: unknown[] }) => {
      upstreamMessages = chatRequest.messages
      return {
        message: { content: 'Text response' },
        done: true,
        model: 'known-text-model',
      }
    },
  }
  const controller = new OllamaController(
    {} as any,
    {} as any,
    ollamaService as any,
    // dev moved prompt assembly, NOMAD.md injection and retrieval into
    // RagPipelineService after this test was written. The stub returns the
    // messages untouched so these cases still exercise only the vision paths.
    {
      buildPrompt: async (messages: unknown) => ({
        messages,
        numCtx: undefined,
        numPredict: undefined,
        retrieved: [],
        injected: [],
      }),
    } as any,
    {
      hasDocuments: async () => false,
      searchSimilarDocuments: async () => [],
    } as any,
    { record: async () => undefined } as any
  )

  const result = await controller.chat({ request, response } as any)

  assert.ok(result)
  assert.equal(result.message.content, 'Text response')
  assert.equal(upstreamMessages.length, 202)
  assert.deepEqual(upstreamMessages.slice(1), messages)
  assert.ok(
    upstreamMessages.every(
      (message) => typeof (message as { content?: unknown }).content === 'string'
    )
  )
})
