import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MapRegionEstimateService } from '../../app/services/map_region_estimate_service.js'
import { MapRegionService } from '../../app/services/map_region_service.js'
import type { MapRegionDefinition } from '../../types/map_regions.js'

const source = (name: string) => ({
  sourceId: 'geofabrik' as const,
  format: 'osm-pbf' as const,
  url: 'https://download.geofabrik.de/' + name + '-latest.osm.pbf',
})
const input = source('south-america/brazil')
const regions: MapRegionDefinition[] = [
  { id: 'world', name: 'World', coverage: { bbox: [-180, -90, 180, 90] }, sources: {} },
  {
    id: 'brazil',
    parentId: 'world',
    name: 'Brazil',
    coverage: { bbox: [-120, 0, -50, 50] },
    sources: { routing: input },
  },
  {
    id: 'south-east',
    parentId: 'brazil',
    name: 'South-east',
    coverage: { bbox: [-90, 15, -87, 19] },
    sources: {
      routing: source('south-america/brazil/sudeste'),
    },
  },
]
async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'nomad-estimate-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'vendored.json')
  await writeFile(path, JSON.stringify({ schema_version: 2, regions }))
  const service = new MapRegionService(root, path)
  return { root, service, estimate: new MapRegionEstimateService(service) }
}
const headers = { 'content-length': '1000', 'last-modified': 'Sun, 08 Nov 2026 00:00:00 GMT' }

test('routing source size is previewed and HEAD preview never downloads its body', async (t) => {
  const { estimate } = await fixture(t)
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: any) => {
    calls++
    assert.equal(options.method, 'HEAD')
    return new Response(null, { headers })
  })
  const result = await estimate.estimate('brazil', ['routing'])
  assert.equal(result.totalSourceBytes, 1000)
  assert.equal(result.remainingDownloadBytes, 1000)
  assert.equal(result.sources.length, 1)
  assert.equal(result.packages, 1)
  assert.equal(calls, 1)
  assert.equal(result.minimumFreeBytes, 12000 + 8 * 1024 ** 3)
  await estimate.estimate('brazil', ['routing'])
  assert.equal(calls, 1, 'fresh local metadata avoids repeated provider requests')
})
test('collections and removed postal components cannot fan out a preview', async (t) => {
  const { estimate } = await fixture(t)
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    throw new Error('Must not request public metadata')
  })
  await assert.rejects(
    estimate.estimate('world', ['routing']),
    (error: any) => error.status === 409
  )
  await assert.rejects(
    estimate.estimate('brazil', ['search']),
    (error: any) => error.status === 400
  )
  assert.equal(calls, 0)
})

test('a complete local install source previews zero transfer offline while an explicit update still checks the provider', async (t) => {
  const { estimate, root } = await fixture(t)
  const digest = '0'.repeat(64)
  const directory = join(root, 'sources', 'brazil')
  await mkdir(join(directory, digest), { recursive: true })
  await writeFile(join(directory, digest, 'source.osm.pbf'), Buffer.alloc(1000))
  await writeFile(
    join(directory, 'current.json'),
    JSON.stringify({
      url: input.url,
      size: 1000,
      sha256: digest,
      lastModified: headers['last-modified'],
      downloadedAt: '2026-11-08T00:00:00Z',
    })
  )
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return new Response(null, { headers: { ...headers, 'content-length': '2000' } })
  })
  const local = await estimate.estimate('brazil', ['routing'])
  assert.equal(calls, 0)
  assert.equal(local.remainingDownloadBytes, 0)
  assert.equal(local.reusableBytes, 1000)
  assert.match(local.message!, /No internet download/)
  const update = await estimate.estimate('brazil', ['routing'], 'update')
  assert.equal(calls, 1)
  assert.equal(update.remainingDownloadBytes, 2000)
  assert.equal(update.reusableBytes, 0)
})
test('a matching partial source reduces remaining transfer without changing its bytes', async (t) => {
  const { estimate, root } = await fixture(t)
  const folder = join(root, 'sources', 'brazil')
  await mkdir(folder, { recursive: true })
  const partial = Buffer.alloc(300, 1)
  await writeFile(join(folder, 'download.part'), partial)
  await writeFile(
    join(folder, 'download.json'),
    JSON.stringify({ url: input.url, size: 1000, lastModified: headers['last-modified'] })
  )
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { headers }))
  const result = await estimate.estimate('brazil', ['routing'])
  assert.equal(result.reusableBytes, 300)
  assert.equal(result.remainingDownloadBytes, 700)
  assert.deepEqual(await readFile(join(folder, 'download.part')), partial)
})
test('changed public input does not advertise incompatible partial bytes as reusable', async (t) => {
  const { estimate, root } = await fixture(t)
  const folder = join(root, 'sources', 'brazil')
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'download.part'), Buffer.alloc(300))
  await writeFile(
    join(folder, 'download.json'),
    JSON.stringify({ url: input.url, size: 1000, lastModified: 'older' })
  )
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { headers }))
  assert.equal((await estimate.estimate('brazil', ['routing'])).reusableBytes, 0)
})
test('offline preview retains an explicitly stale last-known size instead of claiming a fresh check', async (t) => {
  const { estimate, root } = await fixture(t)
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { headers }))
  const first = await estimate.estimate('brazil', ['routing'])
  const file = (await import('node:fs/promises')).readdir
  const path = join(root, 'estimates', (await file(join(root, 'estimates')))[0])
  const saved = JSON.parse(await readFile(path, 'utf8'))
  saved.checkedAt = '2020-01-01T00:00:00Z'
  await writeFile(path, JSON.stringify(saved))
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('offline')
  })
  const result = await estimate.estimate('brazil', ['routing'])
  assert.equal(result.totalSourceBytes, first.totalSourceBytes)
  assert.equal(result.sources[0].stale, true)
  assert.equal(result.sources[0].checkedAt, saved.checkedAt)
  assert.equal(result.reusableBytes, 0)
  assert.equal(result.checkedAt, new Date(saved.checkedAt).toISOString())
})
test('missing size metadata is unknown, not a misleading zero-byte download', async (t) => {
  const { estimate } = await fixture(t)
  t.mock.method(globalThis, 'fetch', async () => new Response(null))
  const result = await estimate.estimate('brazil', ['routing'])
  assert.equal(result.complete, false)
  assert.equal(result.totalSourceBytes, undefined)
  assert.equal(result.remainingDownloadBytes, undefined)
  assert.equal(result.sources[0].status, 'unknown')
})
test('provider redirects cannot send metadata requests to an arbitrary internal URL', async (t) => {
  const { estimate } = await fixture(t)
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return new Response(null, { status: 302, headers: { location: 'http://localhost/private' } })
  })
  const result = await estimate.estimate('brazil', ['routing'])
  assert.equal(result.complete, false)
  assert.equal(calls, 1)
})

test('large sources have no fixed size ceiling and disk admission still runs before a dataset GET', async (t) => {
  const { estimate, service } = await fixture(t)
  const previousLimit = process.env.MAP_REGION_MAX_SOURCE_BYTES
  process.env.MAP_REGION_MAX_SOURCE_BYTES = '1'
  t.after(() => {
    if (previousLimit === undefined) delete process.env.MAP_REGION_MAX_SOURCE_BYTES
    else process.env.MAP_REGION_MAX_SOURCE_BYTES = previousLimit
  })
  const methods: string[] = []
  let sourceBytes = 33 * 1024 ** 3
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: any) => {
    methods.push(options.method)
    return new Response(null, { headers: { ...headers, 'content-length': String(sourceBytes) } })
  })
  const result = await estimate.estimate('brazil', ['routing'])
  assert.equal(result.totalSourceBytes, 33 * 1024 ** 3)
  assert.doesNotMatch(result.message!, /per-source limit|size limit|exceeds/)
  // A declared size needs no allocation. Make the space requirement larger
  // than the disposable test filesystem and verify the remaining guard.
  sourceBytes = 128 * 1024 ** 4
  await assert.rejects(
    (service as any).download(regions[1], 'routing'),
    /Not enough free space to download and prepare/
  )
  assert.ok(methods.length > 0 && methods.every((method) => method === 'HEAD'))
})

test('an unavailable configured backing probe leaves sizes visible and prevents any dataset GET', async (t) => {
  const { estimate, service, root } = await fixture(t)
  const previousBacking = process.env.MAP_REGIONS_BACKING_DISK_PATH
  process.env.MAP_REGIONS_BACKING_DISK_PATH = join(root, 'missing-backing-probe')
  t.after(() => {
    if (previousBacking === undefined) delete process.env.MAP_REGIONS_BACKING_DISK_PATH
    else process.env.MAP_REGIONS_BACKING_DISK_PATH = previousBacking
  })
  const methods: string[] = []
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: any) => {
    methods.push(options.method)
    return new Response(null, { headers })
  })
  const result = await estimate.estimate('brazil', ['routing'])
  assert.equal(result.totalSourceBytes, 1000)
  assert.equal(result.complete, true)
  assert.equal(result.availableFreeBytes, undefined)
  assert.equal(result.spaceSufficient, undefined)
  assert.match(result.diskCheckError!, /configured backing disk/)
  await assert.rejects(
    (service as any).download(regions[1], 'routing'),
    (error: any) => error.status === 503 && /configured backing disk/.test(error.message)
  )
  assert.ok(methods.length > 0 && methods.every((method) => method === 'HEAD'))
})
