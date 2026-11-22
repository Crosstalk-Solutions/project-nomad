/**
 * After a successful model pull the UI's installed-models list goes stale unless
 * a terminal 100% event is delivered (#1357). In-stream progress broadcasts are
 * throttled to 1x/500ms, so the final 100% chunk can be silently dropped when it
 * lands within the throttle window of the previous broadcast. `_doDownloadModel`
 * therefore emits an unthrottled terminal 100% broadcast on the success path.
 *
 * A Japa spec: OllamaService imports the Adonis logger/transmit at module scope.
 * Run with `node ace test unit`.
 */
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { test } from '@japa/runner'
import axios from 'axios'
import transmit from '@adonisjs/transmit/services/main'
import { OllamaService } from '../../app/services/ollama_service.js'
import { BROADCAST_CHANNELS } from '../../constants/broadcast.js'

const MODEL = 'llama3.1:latest'

/** Build a fake Ollama NDJSON pull stream from raw progress lines. */
function fakePullStream(lines: string[]): Readable {
  const stream = new Readable({ read() {} })
  for (const line of lines) stream.push(Buffer.from(line + '\n'))
  stream.push(null)
  return stream
}

/**
 * OllamaService wired for a successful pull: deps pre-seeded (skip `_initialize`),
 * native backend, model not installed before the pull / installed after.
 */
function serviceWithSuccessfulPull() {
  const service = new OllamaService() as any
  service.openai = {} // truthy → `_ensureDependencies` skips `_initialize()`
  service.baseUrl = 'http://localhost:11434'
  service.isOllamaNative = true

  let getModelsCalls = 0
  service.getModels = async (_includeEmbeddings?: boolean) => {
    getModelsCalls += 1
    // Pre-pull check → not installed; post-pull verification → installed.
    return getModelsCalls >= 2 ? [{ name: MODEL }] : []
  }
  return service
}

test('a successful pull emits a terminal 100% broadcast even when in-stream chunks are throttled', async () => {
  const service = serviceWithSuccessfulPull()

  // Capture every broadcast the service attempts (in-stream + terminal).
  const broadcasts: { percent: number; model: string }[] = []
  const originalBroadcast = service.broadcastDownloadProgress
  service.broadcastDownloadProgress = (model: string, percent: number, _jobId?: string) => {
    broadcasts.push({ model, percent })
  }

  const originalPost = axios.post
  ;(axios as any).post = async () => ({
    // 50% then 100% — the 100% arrives immediately after the 50%, inside the throttle
    // window, so the in-stream 100% is the one the bug dropped.
    data: fakePullStream([
      JSON.stringify({ digest: 'd1', completed: 100, total: 200 }),
      JSON.stringify({ digest: 'd1', completed: 200, total: 200 }),
    ]),
  })

  try {
    const result = await service.downloadModel(MODEL)
    assert.equal(result.success, true)

    const completions = broadcasts.filter((b) => b.percent === 100)
    assert.ok(
      completions.length >= 1,
      `expected a terminal 100% broadcast, got: ${JSON.stringify(broadcasts)}`
    )
    // The last broadcast must be the completion — that is what clients key off.
    const last = broadcasts.at(-1)!
    assert.equal(last.percent, 100)
    assert.equal(last.model, MODEL)
  } finally {
    service.broadcastDownloadProgress = originalBroadcast
    ;(axios as any).post = originalPost
  }
})

test('broadcastDownloadProgress sends the 100% payload on the download channel', async () => {
  const service = new OllamaService() as any

  const sent: { channel: string; payload: any }[] = []
  const originalBroadcast = transmit.broadcast.bind(transmit)
  transmit.broadcast = (channel: string, payload: any) => {
    sent.push({ channel, payload })
  }

  try {
    service.broadcastDownloadProgress(MODEL, 100, 'job-123')

    assert.equal(sent.length, 1)
    const entry = sent[0]!
    assert.equal(entry.channel, BROADCAST_CHANNELS.OLLAMA_MODEL_DOWNLOAD)
    assert.equal(entry.payload.model, MODEL)
    assert.equal(entry.payload.percent, 100)
    assert.equal(entry.payload.jobId, 'job-123')
  } finally {
    transmit.broadcast = originalBroadcast
  }
})
