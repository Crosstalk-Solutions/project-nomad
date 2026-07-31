import assert from 'node:assert/strict'
import test from 'node:test'
import type { MultipartFile } from '@adonisjs/bodyparser/types'
import sharp from 'sharp'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  attachImagesToLatestUserMessage,
  ChatImageError,
  normalizeChatImages,
} from '../../app/utils/chat_images.js'
import {
  capabilitiesFromOllamaShow,
  installedModelsFromOpenAIResponse,
  resolveModelCapabilities,
  visionCapabilityFromLlamaProps,
} from '../../app/utils/model_capabilities.js'

function uploadedFile(path: string, size: number, name = 'sample.png'): MultipartFile {
  return {
    tmpPath: path,
    size,
    clientName: name,
    isValid: true,
  } as MultipartFile
}

test('normalizes a supported image to a bounded JPEG data URL', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nomad-chat-image-'))
  const path = join(directory, 'sample.png')
  const input = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 3,
      background: '#556b2f',
    },
  })
    .png()
    .toBuffer()
  await writeFile(path, input)

  try {
    const [image] = await normalizeChatImages([uploadedFile(path, input.byteLength)])
    assert.equal(image.name, 'sample.png')
    assert.match(image.dataUrl, /^data:image\/jpeg;base64,/)
    const decoded = Buffer.from(image.dataUrl.split(',')[1], 'base64')
    const metadata = await sharp(decoded).metadata()
    assert.equal(metadata.format, 'jpeg')
    assert.equal(metadata.width, 32)
    assert.equal(metadata.height, 24)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('normalizes image bytes when the filename extension does not match the encoding', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nomad-chat-image-'))
  const path = join(directory, 'mislabeled.png')
  const input = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 3,
      background: '#556b2f',
    },
  })
    .webp()
    .toBuffer()
  await writeFile(path, input)

  try {
    const [image] = await normalizeChatImages([
      uploadedFile(path, input.byteLength, 'mislabeled.png'),
    ])
    assert.equal(image.name, 'mislabeled.png')
    assert.match(image.dataUrl, /^data:image\/jpeg;base64,/)
    const decoded = Buffer.from(image.dataUrl.split(',')[1], 'base64')
    const metadata = await sharp(decoded).metadata()
    assert.equal(metadata.format, 'jpeg')
    assert.equal(metadata.width, 32)
    assert.equal(metadata.height, 24)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('rejects payloads with more than four images', async () => {
  const files = Array.from({ length: 5 }, (_, index) =>
    uploadedFile(`/tmp/image-${index}.png`, 10, `image-${index}.png`)
  )
  await assert.rejects(
    () => normalizeChatImages(files),
    (error: unknown) => {
      assert.ok(error instanceof ChatImageError)
      assert.equal(error.status, 422)
      return true
    }
  )
})

test('attaches images only to the latest user message', () => {
  const messages = [
    { role: 'user' as const, content: 'Earlier question' },
    { role: 'assistant' as const, content: 'Earlier answer' },
    { role: 'user' as const, content: 'What is shown?' },
  ]
  const result = attachImagesToLatestUserMessage(messages, [
    { name: 'sample.webp', dataUrl: 'data:image/webp;base64,AAAA' },
  ])

  assert.equal(result[0].content, 'Earlier question')
  assert.equal(result[1].content, 'Earlier answer')
  assert.deepEqual(result[2], {
    role: 'user',
    content: [
      { type: 'text', text: 'What is shown?' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/webp;base64,AAAA' },
      },
    ],
  })
})

test('detects vision capability from Ollama and llama.cpp metadata', () => {
  assert.deepEqual(capabilitiesFromOllamaShow({ capabilities: ['completion', 'vision'] }), {
    thinking: false,
    vision: 'supported',
  })
  assert.deepEqual(capabilitiesFromOllamaShow({ capabilities: ['completion', 'thinking'] }), {
    thinking: true,
    vision: 'unsupported',
  })
  assert.equal(visionCapabilityFromLlamaProps({ modalities: { vision: true } }), 'supported')
  assert.equal(visionCapabilityFromLlamaProps({ modalities: { vision: false } }), 'unsupported')
  assert.equal(visionCapabilityFromLlamaProps({ modalities: ['text', 'image'] }), 'supported')
  assert.equal(visionCapabilityFromLlamaProps({ model: 'unknown' }), null)
})

test('resolves per-model capabilities advertised by a hybrid router', async () => {
  let showProbeCalls = 0
  let propsProbeCalls = 0
  const probes = {
    ollamaShow: async () => {
      showProbeCalls += 1
      return null
    },
    llamaProps: async () => {
      propsProbeCalls += 1
      return null
    },
  }

  const visionModel = await resolveModelCapabilities(
    { capabilities: ['completion', 'vision', 'tools', 'thinking'] },
    probes
  )
  const textModel = await resolveModelCapabilities(
    { capabilities: ['completion', 'tools', 'thinking'] },
    probes
  )

  assert.deepEqual(visionModel, { thinking: true, vision: 'supported' })
  assert.deepEqual(textModel, { thinking: true, vision: 'unsupported' })
  assert.equal(showProbeCalls, 0)
  assert.equal(propsProbeCalls, 0)
})

test('preserves per-model capabilities from an OpenAI-compatible model list', () => {
  const models = installedModelsFromOpenAIResponse({
    data: [
      {
        id: 'qwen3.6:35b-a3b-hauhau-aggressive',
        capabilities: ['completion', 'vision', 'tools', 'thinking'],
      },
      {
        id: 'qwopus3.6-coder-compat-mtp:27b',
        capabilities: ['completion', 'tools', 'thinking'],
      },
    ],
  })

  assert.deepEqual(models, [
    {
      name: 'qwen3.6:35b-a3b-hauhau-aggressive',
      size: 0,
      capabilities: ['completion', 'vision', 'tools', 'thinking'],
    },
    {
      name: 'qwopus3.6-coder-compat-mtp:27b',
      size: 0,
      capabilities: ['completion', 'tools', 'thinking'],
    },
  ])
})

test('falls back per model from Ollama metadata to llama.cpp properties', async () => {
  let propsProbeCalls = 0
  const ollamaModel = await resolveModelCapabilities(null, {
    ollamaShow: async () => ({ capabilities: ['completion', 'vision'] }),
    llamaProps: async () => {
      propsProbeCalls += 1
      return { modalities: { vision: false } }
    },
  })
  const llamaModel = await resolveModelCapabilities(null, {
    ollamaShow: async () => {
      throw new Error('404')
    },
    llamaProps: async () => {
      propsProbeCalls += 1
      return { modalities: { vision: false } }
    },
  })

  assert.deepEqual(ollamaModel, { thinking: false, vision: 'supported' })
  assert.deepEqual(llamaModel, { thinking: false, vision: 'unsupported' })
  assert.equal(propsProbeCalls, 1)
})

test('classifies the four supported backend capability cases', async () => {
  const backendCases = [
    {
      name: 'Ollama vision',
      advertised: null,
      ollamaShow: async () => ({ capabilities: ['completion', 'vision'] }),
      llamaProps: async () => {
        throw new Error('not used')
      },
      expected: { thinking: false, vision: 'supported' },
    },
    {
      name: 'llama.cpp vision',
      advertised: null,
      ollamaShow: async () => {
        throw new Error('404')
      },
      llamaProps: async () => ({ modalities: { vision: true } }),
      expected: { thinking: false, vision: 'supported' },
    },
    {
      name: 'known text-only',
      advertised: { capabilities: ['completion', 'thinking'] },
      ollamaShow: async () => {
        throw new Error('not used')
      },
      llamaProps: async () => {
        throw new Error('not used')
      },
      expected: { thinking: true, vision: 'unsupported' },
    },
    {
      name: 'unknown OpenAI-compatible',
      advertised: null,
      ollamaShow: async () => {
        throw new Error('404')
      },
      llamaProps: async () => {
        throw new Error('404')
      },
      expected: null,
    },
  ] as const

  for (const backend of backendCases) {
    const actual = await resolveModelCapabilities(backend.advertised, {
      ollamaShow: backend.ollamaShow,
      llamaProps: backend.llamaProps,
    })
    assert.deepEqual(actual, backend.expected, backend.name)
  }
})
