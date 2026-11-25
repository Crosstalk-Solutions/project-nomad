import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { BodyParserMiddlewareFactory } from '@adonisjs/core/factories/bodyparser'
import { HttpContextFactory, RequestFactory, ResponseFactory } from '@adonisjs/core/factories/http'
import sharp from 'sharp'
import {
  CHAT_IMAGE_UPLOAD_OPTIONS,
  ChatImageError,
  normalizeChatImages,
} from '../../app/utils/chat_images.js'

/**
 * Sends one file through the real multipart parser, with the options
 * OllamaController.chat uses for the `images` field, and then through
 * normalizeChatImages. The parser sets a file's extname and isValid, so this
 * spec uses it rather than hand-built file objects.
 */
async function sendImage(name: string, bytes: Buffer) {
  const directory = await mkdtemp(join(tmpdir(), 'nomad-chat-upload-'))
  const middleware = new BodyParserMiddlewareFactory()
    .merge({
      multipart: {
        autoProcess: true,
        limit: '20mb',
        convertEmptyStringsToNull: true,
        tmpFileName: () => join(directory, randomUUID()),
      },
    })
    .create()

  const server = http.createServer((req, res) => {
    const request = new RequestFactory().merge({ req, res }).create()
    const response = new ResponseFactory().merge({ req, res }).create()
    const ctx = new HttpContextFactory().merge({ request, response }).create()
    middleware
      .handle(ctx, async () => {
        const files = ctx.request.files('images', CHAT_IMAGE_UPLOAD_OPTIONS)
        let status = 200
        let message = 'accepted'
        try {
          const images = await normalizeChatImages(files)
          message = `accepted ${images.length}`
        } catch (error) {
          if (!(error instanceof ChatImageError)) throw error
          status = error.status
          message = error.message
        }
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ message }))
      })
      .catch((error) => {
        // Answer anyway, or fetch waits for a reply that never comes and the run hangs.
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ message: String(error) }))
      })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  try {
    const form = new FormData()
    form.append('images', new File([new Uint8Array(bytes)], name))
    const { port } = server.address() as AddressInfo
    const reply = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10_000),
    })
    const { message } = (await reply.json()) as { message: string }
    return { status: reply.status, message }
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  }
}

const picture = () =>
  sharp({ create: { width: 32, height: 24, channels: 3, background: '#556b2f' } })

test('accepts an image whatever the case of its file extension', async () => {
  const jpeg = await picture().jpeg().toBuffer()
  const png = await picture().png().toBuffer()
  const webp = await picture().webp().toBuffer()
  const named: Array<[string, Buffer]> = [
    ['IMG_0001.jpg', jpeg],
    ['IMG_0001.JPG', jpeg],
    ['IMG_0001.Jpeg', jpeg],
    ['Screenshot.PNG', png],
    ['PIC.WEBP', webp],
  ]

  for (const [name, bytes] of named) {
    const result = await sendImage(name, bytes)
    assert.equal(result.status, 200, `${name}: ${result.message}`)
    assert.equal(result.message, 'accepted 1', name)
  }
})

test('refuses what is not a JPEG, PNG or WebP', async () => {
  const jpeg = await picture().jpeg().toBuffer()
  const gif = await picture().gif().toBuffer()

  const text = Buffer.from('this is not an image')
  const refused: Array<[string, Buffer, number, string]> = [
    // The parser reads the type from the bytes when the extension is a lower-case
    // one it knows, such as jpg, so this GIF arrives as "gif".
    ['photo.jpg', gif, 422, 'a GIF named .jpg'],
    // A name outside the list is refused even when the bytes are a JPEG.
    ['photo.txt', jpeg, 422, 'a JPEG named .txt'],
    // The parser does not read the bytes behind an upper-case name, so sharp decides.
    ['photo.JPG', gif, 415, 'a GIF named .JPG'],
    ['notes.JPG', text, 422, 'text named .JPG'],
  ]

  for (const [name, bytes, status, what] of refused) {
    const result = await sendImage(name, bytes)
    assert.equal(result.status, status, `${what}: ${result.message}`)
  }
})

test('refuses a file whose type the parser could not read', async () => {
  // Text behind a lower-case name is read from its bytes and not recognized, so the
  // parser leaves extname unset.
  const result = await sendImage('notes.jpg', Buffer.from('this is not an image'))
  assert.equal(result.status, 422)
  assert.match(result.message, /not a valid image upload/)
})
