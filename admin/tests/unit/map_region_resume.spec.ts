import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { MapRegionService } from '../../app/services/map_region_service.js'

async function fixture(t: any) {
  const previous = process.env.MAP_REGION_BUILDER_URL
  process.env.MAP_REGION_BUILDER_URL = 'http://builder'
  t.after(() => {
    if (previous === undefined) delete process.env.MAP_REGION_BUILDER_URL
    else process.env.MAP_REGION_BUILDER_URL = previous
  })
  const root = await mkdtemp(join(tmpdir(), 'nomad-region-resume-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const region = {
    id: 'andorra',
    name: 'Andorra',
    coverage: { bbox: [1, 42, 2, 43] },
    sources: {
      routing: {
        sourceId: 'geofabrik',
        format: 'osm-pbf',
        url: 'https://download.geofabrik.de/europe/andorra-latest.osm.pbf',
      },
    },
  }
  const catalog = join(root, 'catalog.json')
  await writeFile(catalog, JSON.stringify({ schema_version: 2, regions: [region] }))
  const service = new MapRegionService(root, catalog)
  const relativePath = 'staging/persisted-job/routing.tar'
  await mkdir(join(root, 'staging/persisted-job'), { recursive: true })
  const bytes = Buffer.from('an already completed immutable prepared artifact')
  await writeFile(join(root, relativePath), bytes)
  const digest = createHash('sha256').update(bytes).digest('hex')
  const preparation = {
    jobId: 'persisted-job',
    relativePath,
    source: {
      url: region.sources.routing.url,
      resolvedUrl: region.sources.routing.url,
      size: 123,
      sha256: 'a'.repeat(64),
      lastModified: '2026-11-01',
      downloadedAt: '2026-11-07',
      path: join(root, 'sources/andorra/source.osm.pbf'),
    },
  }
  await service.save('andorra', 'routing', { status: 'failed', preparation })
  return { service, root, relativePath, bytes, digest }
}

test('retry resumes a completed preparation and publishes it without another download or build', async (t) => {
  const { service, root, relativePath, bytes, digest } = await fixture(t)
  const requests: string[] = []
  t.mock.method(globalThis, 'fetch', async (input: unknown, options: any) => {
    requests.push(String(input))
    assert.equal(options?.method, undefined)
    assert.ok(String(input).endsWith('/build/persisted-job'))
    return new Response(
      JSON.stringify({
        status: 'completed',
        progress: 100,
        records: 7,
        artifact: { relativePath, sizeBytes: bytes.length, sha256: digest },
      }),
      { status: 200 }
    )
  })
  const installed = await service.install('andorra', 'routing')
  assert.equal(installed.records, 7)
  assert.equal(requests.length, 2)
  assert.deepEqual(await readFile(installed.artifactPath), bytes)
  assert.equal((await service.listInstalledComponents('routing')).length, 1)
  assert.equal((await service.record('andorra', 'routing')).status, 'installed')
  assert.ok(installed.artifactPath.startsWith(join(root, 'installed')))
})

test('publication resumes after the artifact was moved but before its state was committed', async (t) => {
  const { service, root, relativePath, bytes, digest } = await fixture(t)
  const version = 'a'.repeat(16) + '-' + digest.slice(0, 12)
  const destination = join(root, 'installed', 'andorra', 'routing', version)
  await mkdir(destination, { recursive: true })
  await rename(join(root, relativePath), join(destination, 'routing.tar'))
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          status: 'completed',
          records: 7,
          artifact: { relativePath, sizeBytes: bytes.length, sha256: digest },
        }),
        { status: 200 }
      )
  )
  const installed = await service.install('andorra', 'routing')
  assert.equal(installed.version, version)
  assert.deepEqual(await readFile(installed.artifactPath), bytes)
  assert.equal((await service.record('andorra', 'routing')).status, 'installed')
})

test('a persistent builder failure preserves job identity for the next retry', async (t) => {
  const { service } = await fixture(t)
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('temporary transport failure')
  })
  await assert.rejects(service.install('andorra', 'routing'), /temporary transport/)
  assert.equal((await service.record('andorra', 'routing')).preparation?.jobId, 'persisted-job')
})

test('a transient status error resumes the same build without submitting another one', async (t) => {
  const { service, relativePath, bytes, digest } = await fixture(t)
  let requests = 0
  t.mock.method(globalThis, 'fetch', async (input: unknown, options: any) => {
    assert.equal(options?.method, undefined)
    assert.ok(String(input).endsWith('/build/persisted-job'))
    if (++requests === 1) return new Response('{}', { status: 503 })
    return new Response(
      JSON.stringify({
        status: 'completed',
        records: 7,
        artifact: { relativePath, sizeBytes: bytes.length, sha256: digest },
      }),
      { status: 200 }
    )
  })
  const installed = await service.install('andorra', 'routing')
  assert.equal(installed.records, 7)
  assert.equal(requests, 3)
})

test('removal refuses a still-running preparation even after the web worker failed', async (t) => {
  const { service, root, relativePath } = await fixture(t)
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(JSON.stringify({ status: 'preparing' }), { status: 200 })
  )
  await assert.rejects(
    service.remove('andorra', 'routing', async () => {}),
    /still running/
  )
  assert.ok((await readFile(join(root, relativePath))).length)
})

test('worker startup recovers pending file states without automatically retrying explicit failures', async (t) => {
  const { service } = await fixture(t)
  const recovered: string[] = []
  const dispatch = async (id: string, component: string) => {
    recovered.push(id + ':' + component)
  }
  await service.save('andorra', 'routing', { status: 'queued' })
  assert.equal(await service.recoverPending(dispatch), 1)
  assert.deepEqual(recovered, ['andorra:routing'])
  await service.save('andorra', 'routing', { status: 'failed', error: 'Requires manual retry' })
  assert.equal(await service.recoverPending(dispatch), 0)
})
