import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ReachabilityCache,
  chooseChatBackend,
  chooseEmbeddingBackend,
  fallbackNoticeMessage,
  isConnectionError,
  localOnlyNoticeMessage,
  mayUsePrivateDocuments,
  normalizeBaseUrl,
  pickFallbackModel,
} from '../../app/utils/ai_backend.js'

const REMOTE = 'http://tower.lan:11434'
const LOCAL = 'http://nomad_ollama:11434'

test('normalizeBaseUrl trims whitespace and trailing slashes, and rejects blanks', () => {
  assert.equal(normalizeBaseUrl(' http://a:1/ '), 'http://a:1')
  assert.equal(normalizeBaseUrl('http://a:1///'), 'http://a:1')
  assert.equal(normalizeBaseUrl(''), null)
  assert.equal(normalizeBaseUrl('   '), null)
  assert.equal(normalizeBaseUrl(null), null)
  assert.equal(normalizeBaseUrl(undefined), null)
})

test('with no remote configured the local container is the backend', () => {
  assert.deepEqual(
    chooseChatBackend({ remoteUrl: null, localUrl: LOCAL, fallbackEnabled: false }),
    { kind: 'local', baseUrl: LOCAL }
  )
  // The fallback switch means nothing without a remote to fall back from.
  assert.deepEqual(chooseChatBackend({ remoteUrl: '', localUrl: LOCAL, fallbackEnabled: true }), {
    kind: 'local',
    baseUrl: LOCAL,
  })
})

test('nothing configured and nothing installed yields no backend', () => {
  assert.equal(chooseChatBackend({ remoteUrl: null, localUrl: null, fallbackEnabled: true }), null)
})

test('a reachable remote is always used', () => {
  for (const fallbackEnabled of [true, false]) {
    assert.deepEqual(
      chooseChatBackend({
        remoteUrl: `${REMOTE}/`,
        localUrl: LOCAL,
        fallbackEnabled,
        remoteReachable: true,
      }),
      { kind: 'remote', baseUrl: REMOTE }
    )
  }
})

test('an unprobed remote is treated as reachable (the pre-fallback behaviour)', () => {
  assert.deepEqual(
    chooseChatBackend({ remoteUrl: REMOTE, localUrl: LOCAL, fallbackEnabled: false }),
    { kind: 'remote', baseUrl: REMOTE }
  )
})

test('an unreachable remote falls back to the local container when enabled', () => {
  assert.deepEqual(
    chooseChatBackend({
      remoteUrl: REMOTE,
      localUrl: LOCAL,
      fallbackEnabled: true,
      remoteReachable: false,
    }),
    { kind: 'fallback', baseUrl: LOCAL }
  )
})

test('an unreachable remote is still used when fallback is off or there is no local container', () => {
  // Off: behaviour is exactly what it was before this feature existed.
  assert.deepEqual(
    chooseChatBackend({
      remoteUrl: REMOTE,
      localUrl: LOCAL,
      fallbackEnabled: false,
      remoteReachable: false,
    }),
    { kind: 'remote', baseUrl: REMOTE }
  )
  // On, but nothing local to fall back to: the error should name the remote.
  assert.deepEqual(
    chooseChatBackend({
      remoteUrl: REMOTE,
      localUrl: null,
      fallbackEnabled: true,
      remoteReachable: false,
    }),
    { kind: 'remote', baseUrl: REMOTE }
  )
})

test('the remote is used again as soon as it is reachable — no state to reset', () => {
  const inputs = { remoteUrl: REMOTE, localUrl: LOCAL, fallbackEnabled: true }
  assert.equal(chooseChatBackend({ ...inputs, remoteReachable: false })?.kind, 'fallback')
  assert.equal(chooseChatBackend({ ...inputs, remoteReachable: true })?.kind, 'remote')
})

test('fallback keeps the requested model when this machine has it too', () => {
  assert.deepEqual(
    pickFallbackModel({
      requested: 'qwen3:8b',
      localModels: ['qwen3:8b', 'phi4:14b'],
      standIn: 'phi4:14b',
    }),
    { model: 'qwen3:8b', substituted: false }
  )
})

test('fallback swaps in the stand-in when the requested model is remote-only', () => {
  assert.deepEqual(
    pickFallbackModel({
      requested: 'qwen3.8:27b',
      localModels: ['phi4:14b', 'nomic-embed-text:v1.5'],
      standIn: ' phi4:14b ',
    }),
    { model: 'phi4:14b', substituted: true }
  )
})

test('fallback never swaps to a stand-in that is not installed locally', () => {
  // No stand-in configured, or one that was since deleted: pass the request
  // through so the backend reports the missing model instead of NOMAD guessing.
  for (const standIn of [null, undefined, '', 'gone:1b']) {
    assert.deepEqual(
      pickFallbackModel({ requested: 'qwen3.8:27b', localModels: ['phi4:14b'], standIn }),
      { model: 'qwen3.8:27b', substituted: false }
    )
  }
})

test('reachability is cached for the TTL and re-probed after it', async () => {
  let now = 1_000
  let probes = 0
  let up = false
  const cache = new ReachabilityCache(15_000, () => now)
  const probe = async () => {
    probes++
    return up
  }

  assert.equal(await cache.check(REMOTE, probe), false)
  assert.equal(await cache.check(REMOTE, probe), false)
  assert.equal(probes, 1, 'a dead remote costs one probe per TTL, not one per request')

  // The remote comes back, but the verdict is still fresh.
  up = true
  now += 14_999
  assert.equal(await cache.check(REMOTE, probe), false)
  assert.equal(probes, 1)

  // TTL elapsed: the next request notices by itself.
  now += 1
  assert.equal(await cache.check(REMOTE, probe), true)
  assert.equal(probes, 2)
})

test('a probe that throws counts as unreachable', async () => {
  const cache = new ReachabilityCache()
  assert.equal(
    await cache.check(REMOTE, async () => {
      throw new Error('boom')
    }),
    false
  )
  assert.equal(cache.peek(REMOTE), false)
})

test('concurrent checks share one probe', async () => {
  let probes = 0
  let release: (value: boolean) => void = () => {}
  const cache = new ReachabilityCache()
  const probe = () =>
    new Promise<boolean>((resolve) => {
      probes++
      release = resolve
    })

  const a = cache.check(REMOTE, probe)
  const b = cache.check(REMOTE, probe)
  release(true)
  assert.deepEqual(await Promise.all([a, b]), [true, true])
  assert.equal(probes, 1)
})

test('a verdict for one URL is never reused for another', async () => {
  const cache = new ReachabilityCache()
  cache.set(REMOTE, false)
  assert.equal(cache.peek('http://other:11434'), undefined)
  assert.equal(await cache.check('http://other:11434', async () => true), true)
  // Only one entry is kept: the newer URL replaced the older verdict.
  assert.equal(cache.peek(REMOTE), undefined)
})

test('set() overrides a fresh verdict, and clear() forgets it', () => {
  const cache = new ReachabilityCache()
  cache.set(REMOTE, true)
  cache.set(REMOTE, false)
  assert.equal(cache.peek(REMOTE), false)
  cache.clear()
  assert.equal(cache.peek(REMOTE), undefined)
})

test('isConnectionError recognises socket-level failures, including wrapped ones', () => {
  assert.equal(isConnectionError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })), true)
  assert.equal(isConnectionError(Object.assign(new Error('x'), { code: 'EHOSTUNREACH' })), true)
  // fetch/undici: TypeError('fetch failed') with the socket error as its cause.
  const fetchFailed = new TypeError('fetch failed')
  ;(fetchFailed as any).cause = Object.assign(new Error('connect'), { code: 'ECONNREFUSED' })
  assert.equal(isConnectionError(fetchFailed), true)
  assert.equal(isConnectionError(new TypeError('fetch failed')), true)
  // SDK wrappers.
  const sdk = new Error('Connection error.')
  sdk.name = 'APIConnectionError'
  assert.equal(isConnectionError(sdk), true)
  const wrapped = new Error('outer')
  ;(wrapped as any).cause = fetchFailed
  assert.equal(isConnectionError(wrapped), true)
  // axios with no response.
  assert.equal(isConnectionError({ isAxiosError: true, response: undefined }), true)
})

test('isConnectionError ignores errors a live server sent back', () => {
  assert.equal(isConnectionError({ isAxiosError: true, response: { status: 404 } }), false)
  assert.equal(
    isConnectionError(Object.assign(new Error('model not found'), { status: 404 })),
    false
  )
  assert.equal(isConnectionError(new Error('anything else')), false)
  assert.equal(isConnectionError(new TypeError('x is not a function')), false)
  assert.equal(isConnectionError(undefined), false)
  assert.equal(isConnectionError(null), false)
})

test('the fallback notice names both models only when a swap happened', () => {
  const swapped = fallbackNoticeMessage({
    requestedModel: 'qwen3.8:27b',
    answeredBy: 'phi4:14b',
    substituted: true,
  })
  assert.match(swapped, /phi4:14b/)
  assert.match(swapped, /qwen3\.8:27b/)

  const same = fallbackNoticeMessage({
    requestedModel: 'phi4:14b',
    answeredBy: 'phi4:14b',
    substituted: false,
  })
  assert.match(same, /phi4:14b/)
  assert.doesNotMatch(same, /instead of/)
})

// ---------------------------------------------------------------------------
// Privacy: local-only chats, local embedding, private documents.
// ---------------------------------------------------------------------------

test('a local-only request is pinned to the local container even with the remote up', () => {
  for (const remoteReachable of [true, false, undefined]) {
    for (const fallbackEnabled of [true, false]) {
      assert.deepEqual(
        chooseChatBackend({
          remoteUrl: REMOTE,
          localUrl: LOCAL,
          fallbackEnabled,
          remoteReachable,
          localOnly: true,
        }),
        { kind: 'local', baseUrl: LOCAL, forcedLocal: true }
      )
    }
  }
})

test('a local-only request with no local container gets no backend, never the remote', () => {
  // Fail closed. The one outcome that must be impossible is `kind: 'remote'`.
  for (const remoteReachable of [true, false, undefined]) {
    assert.equal(
      chooseChatBackend({
        remoteUrl: REMOTE,
        localUrl: null,
        fallbackEnabled: true,
        remoteReachable,
        localOnly: true,
      }),
      null
    )
  }
})

test('local-only changes nothing when no remote is configured', () => {
  assert.deepEqual(
    chooseChatBackend({
      remoteUrl: null,
      localUrl: LOCAL,
      fallbackEnabled: false,
      localOnly: true,
    }),
    { kind: 'local', baseUrl: LOCAL }
  )
})

test('embedding follows chat unless local embedding is on with a remote configured', () => {
  assert.deepEqual(
    chooseEmbeddingBackend({ remoteUrl: REMOTE, localUrl: LOCAL, localEmbeddings: false }),
    { source: 'chat' }
  )
  // No remote: there is only one backend, so the switch has nothing to separate.
  assert.deepEqual(
    chooseEmbeddingBackend({ remoteUrl: null, localUrl: LOCAL, localEmbeddings: true }),
    { source: 'chat' }
  )
  assert.deepEqual(
    chooseEmbeddingBackend({ remoteUrl: REMOTE, localUrl: `${LOCAL}/`, localEmbeddings: true }),
    { source: 'local', baseUrl: LOCAL }
  )
})

test('local embedding with no local container is unavailable, never the remote', () => {
  // The regression this guards: an indexing job quietly shipping a document to
  // the remote server because the local container was not installed.
  for (const localUrl of [null, undefined, '', '   ']) {
    assert.deepEqual(
      chooseEmbeddingBackend({ remoteUrl: REMOTE, localUrl, localEmbeddings: true }),
      { source: 'unavailable' }
    )
  }
})

test('private documents are only used by a backend that is local and stays local', () => {
  assert.equal(mayUsePrivateDocuments({ kind: 'local' }), true)
  assert.equal(mayUsePrivateDocuments({ kind: 'remote' }), false)
  // A fallback reply is written on this machine, but its text rides along in
  // the chat history to the remote server as soon as that server returns.
  assert.equal(mayUsePrivateDocuments({ kind: 'fallback' }), false)
  // No backend at all: nothing will be sent anywhere, so nothing is withheld.
  assert.equal(mayUsePrivateDocuments(null), true)
})

test('private documents follow the backend a local-only request resolves to', () => {
  const remoteTurn = chooseChatBackend({
    remoteUrl: REMOTE,
    localUrl: LOCAL,
    fallbackEnabled: false,
    remoteReachable: true,
  })
  const localOnlyTurn = chooseChatBackend({
    remoteUrl: REMOTE,
    localUrl: LOCAL,
    fallbackEnabled: false,
    remoteReachable: true,
    localOnly: true,
  })
  assert.equal(mayUsePrivateDocuments(remoteTurn), false)
  assert.equal(mayUsePrivateDocuments(localOnlyTurn), true)
})

test('the local-only notice names the stand-in and the model it replaced', () => {
  const message = localOnlyNoticeMessage({ requestedModel: 'qwen3.8:27b', answeredBy: 'phi4:14b' })
  assert.match(message, /local-only/)
  assert.match(message, /phi4:14b/)
  assert.match(message, /qwen3\.8:27b/)
})
