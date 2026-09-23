/**
 * The stop reason has to survive chunk normalization (#1342).
 *
 * Both transports used to rebuild each chunk as {message, done, usage}, which
 * dropped Ollama's done_reason and OpenAI's finish_reason. A reply cut off by
 * num_predict then looked exactly like one that finished.
 *
 * A Japa spec: OllamaService imports the Adonis logger at module scope. Run with
 * `node ace test unit`.
 */
import assert from 'node:assert/strict'
import { test } from '@japa/runner'
import { OllamaService } from '../../app/services/ollama_service.js'

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of iterable) out.push(item)
  return out
}

function fakeNativeIterator(chunks: any[]) {
  return {
    abort() {},
    async *[Symbol.asyncIterator]() {
      yield* chunks
    },
  }
}

function serviceWithNative(chunks: any[], response?: any) {
  const service = new OllamaService() as any
  service.ollama = {
    chat: async (req: { stream: boolean }) => (req.stream ? fakeNativeIterator(chunks) : response),
  }
  return service
}

function serviceWithCompat(chunks: any[], response?: any) {
  const service = new OllamaService() as any
  service.openai = {
    chat: {
      completions: {
        create: async (params: { stream: boolean }) =>
          params.stream
            ? (async function* () {
                yield* chunks
              })()
            : response,
      },
    },
  }
  return service
}

const request = { model: 'm', messages: [{ role: 'user', content: 'hi' }], numPredict: 16 }

test('native stream forwards done_reason on the final chunk', async () => {
  const service = serviceWithNative([
    { message: { content: 'Alternate Between' }, done: false },
    { message: { content: ' Annuals' }, done: true, done_reason: 'length', eval_count: 16 },
  ])
  const chunks = await collect<any>(await service._chatStreamNative(request))
  assert.equal(chunks[0].done_reason, undefined)
  assert.equal(chunks.at(-1).done, true)
  assert.equal(chunks.at(-1).done_reason, 'length')
  assert.equal(chunks.at(-1).usage.completionTokens, 16)
})

test('compat stream maps finish_reason to done_reason', async () => {
  const service = serviceWithCompat([
    { choices: [{ delta: { content: 'egg' }, finish_reason: null }] },
    { choices: [{ delta: { content: '' }, finish_reason: 'length' }] },
    { choices: [], usage: { prompt_tokens: 10, completion_tokens: 16 } },
  ])
  const chunks = await collect<any>(await service._chatStreamCompat(request))
  assert.equal(chunks[0].done_reason, undefined)
  assert.equal(chunks[1].done, true)
  assert.equal(chunks[1].done_reason, 'length')
})

test('non-streaming native and compat responses carry done_reason', async () => {
  const native = serviceWithNative([], {
    model: 'm',
    message: { content: 'cut' },
    done: true,
    done_reason: 'length',
  })
  assert.equal((await native._chatNative(request)).done_reason, 'length')

  const compat = serviceWithCompat([], {
    model: 'm',
    choices: [{ message: { content: 'done' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  })
  assert.equal((await compat._chatCompat(request)).done_reason, 'stop')
})
