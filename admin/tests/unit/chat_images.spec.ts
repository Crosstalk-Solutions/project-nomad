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

test('normalizes a supported image to a bounded WebP data URL', async () => {
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
    assert.match(image.dataUrl, /^data:image\/webp;base64,/)
    const decoded = Buffer.from(image.dataUrl.split(',')[1], 'base64')
    const metadata = await sharp(decoded).metadata()
    assert.equal(metadata.format, 'webp')
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
