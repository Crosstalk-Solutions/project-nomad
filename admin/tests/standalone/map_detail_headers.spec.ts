import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Header } from 'pmtiles'
import { MapDetailHeaderCache, readMapDetailHeader } from '../../inertia/components/maps/mapDetailHeaders.js'

const header = { minZoom: 0, maxZoom: 12, minLon: -180, minLat: -85, maxLon: 180, maxLat: 85 } as Header

test('a hung header request times out, aborts and permits a fresh attempt', async () => {
  const signals: AbortSignal[] = []
  const cache = new MapDetailHeaderCache(async (_url, signal) => {
    signals.push(signal)
    return signals.length === 1 ? new Promise<Header>(() => {}) : header
  }, { timeoutMs: 15, maxEntries: 96 })
  await assert.rejects(cache.get('local'), /timed out/)
  assert.equal(signals[0].aborted, true)
  assert.equal(await cache.get('local'), header)
  assert.equal(signals.length, 2)
})

test('manual Retry clears a pending request even when its reader ignores abort', async () => {
  const signals: AbortSignal[] = []
  const cache = new MapDetailHeaderCache(async (_url, signal) => {
    signals.push(signal)
    return signals.length === 1 ? new Promise<Header>(() => {}) : header
  })
  const first = cache.get('local')
  const rejected = assert.rejects(first, /view changed/)
  await Promise.resolve()
  cache.clear()
  assert.equal(await cache.get('local'), header)
  await rejected
  assert.equal(signals.length, 2)
  assert.equal(signals[0].aborted, true)
})

test('view cleanup cancels pending lookups but retains completed metadata', async () => {
  let reads = 0
  const cache = new MapDetailHeaderCache(async (url) => {
    reads++
    return url === 'ready' ? header : new Promise<Header>(() => {})
  })
  assert.equal(await cache.get('ready'), header)
  const pending = cache.get('hung')
  const rejected = assert.rejects(pending, /view changed/)
  cache.cancelPending()
  await rejected
  assert.equal(await cache.get('ready'), header)
  assert.equal(reads, 1)
})

test('bounded LRU eviction cancels an old request and late completion cannot replace a retry', async () => {
  let resolveOld!: (value: Header) => void
  let localReads = 0
  const cache = new MapDetailHeaderCache(async (url) => {
    if (url !== 'local' || ++localReads > 1) return header
    return new Promise<Header>((resolve) => { resolveOld = resolve })
  }, { timeoutMs: 1000, maxEntries: 2 })
  const old = cache.get('local')
  const rejected = assert.rejects(old, /evicted/)
  await Promise.resolve()
  await cache.get('second')
  await cache.get('third')
  await rejected
  assert.equal(await cache.get('local'), header)
  resolveOld({ ...header, maxZoom: 1 })
  await Promise.resolve()
  assert.equal((await cache.get('local')).maxZoom, 12)
  assert.equal(localReads, 2)
})

test('metadata lookup reads only the 127-byte header and forwards cancellation to fetch', async (t) => {
  const bytes = new Uint8Array(127)
  bytes.set(new TextEncoder().encode('PMTiles'))
  bytes[7] = 3; bytes[99] = 4; bytes[101] = 12
  const view = new DataView(bytes.buffer)
  view.setInt32(102, -1800000000, true); view.setInt32(106, -850000000, true)
  view.setInt32(110, 1800000000, true); view.setInt32(114, 850000000, true)
  const controller = new AbortController()
  let requests = 0
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    requests++
    assert.equal(new Headers(options.headers).get('range'), 'bytes=0-126')
    assert.equal(options.signal, controller.signal)
    return new Response(bytes, { status: 206, headers: { ETag: '"fixture"' } })
  })
  const result = await readMapDetailHeader('http://127.0.0.1/pmtiles/fixture.pmtiles', controller.signal)
  assert.equal(requests, 1); assert.equal(result.maxZoom, 12); assert.equal(result.minLon, -180)
})

test('a malformed local response is rejected rather than inventing native detail', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(127), { status: 206 }))
  await assert.rejects(readMapDetailHeader('http://127.0.0.1/pmtiles/fixture.pmtiles', new AbortController().signal), /invalid PMTiles/)
})
