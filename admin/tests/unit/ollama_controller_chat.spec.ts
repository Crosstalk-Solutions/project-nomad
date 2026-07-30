import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
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
    {
      hasDocuments: async () => false,
      searchSimilarDocuments: async () => [],
    } as any,
    { getSystemPrompt: async () => null } as any
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
  assert.match(event.message, /could not verify image support/i)
  assert.match(event.message, /verify.*vision/i)
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
    {
      hasDocuments: async () => false,
      searchSimilarDocuments: async () => [],
    } as any,
    {
      getSystemPrompt: async () => {
        throw new Error('NOMAD.md storage unavailable')
      },
    } as any
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
    {
      hasDocuments: async () => false,
      searchSimilarDocuments: async () => [],
    } as any,
    { getSystemPrompt: async () => null } as any
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
