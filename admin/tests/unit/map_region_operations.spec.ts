import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { MapRegionService } from '../../app/services/map_region_service.js'
import { MapRegionOperationService } from '../../app/services/map_region_operation_service.js'
import {
  newRegionOperation,
  persistRegionProgress,
  applyBuilderProgress,
} from '../../app/utils/map_region_progress.js'
import type { MapRegionComponentState } from '../../types/map_regions.js'

const digest = (value: string) => createHash('sha256').update(value).digest('hex')
async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'nomad-map-operations-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const definition = {
    id: 'fixture',
    name: 'Fixture region',
    territoryScope: 'country',
    countryCodes: ['AD'],
    coverage: { bbox: [0, 0, 2, 2] },
    sources: {
      routing: {
        sourceId: 'geofabrik',
        format: 'osm-pbf',
        url: 'https://download.geofabrik.de/europe/andorra-latest.osm.pbf',
      },
    },
  }
  const catalog = join(root, 'catalog.json')
  await writeFile(catalog, JSON.stringify({ schema_version: 2, regions: [definition] }))
  const regions = new MapRegionService(root, catalog)
  const source = 'immutable public source'
  const hash = digest(source)
  const sourcePath = join(root, 'sources', 'fixture', hash, 'source.osm.pbf')
  await mkdir(join(sourcePath, '..'), { recursive: true })
  await writeFile(sourcePath, source)
  const prepared = {
    url: definition.sources.routing.url,
    resolvedUrl: definition.sources.routing.url,
    size: Buffer.byteLength(source),
    sha256: hash,
    lastModified: '2026-01-01',
    downloadedAt: '2026-01-02',
    path: sourcePath,
  }
  const operationId = '11111111-1111-4111-8111-111111111111'
  const record = {
    status: 'preparing' as const,
    region: definition,
    operationId,
    preparation: {
      jobId: 'test-job',
      relativePath: 'staging/test-job/routing.tar',
      source: prepared,
    },
    bytesDownloaded: prepared.size,
    totalBytes: prepared.size,
  }
  await regions.save('fixture', 'routing', record as any)
  const original = process.env.MAP_REGION_BUILDER_URL
  process.env.MAP_REGION_BUILDER_URL = 'http://fixture-builder'
  t.after(() => {
    if (original === undefined) delete process.env.MAP_REGION_BUILDER_URL
    else process.env.MAP_REGION_BUILDER_URL = original
  })
  return { root, regions, record, definition, prepared, operationId, sourcePath }
}

test('a heartbeat does not count as progress and rates reset with a new operation', () => {
  const start = Date.parse('2026-01-01T00:00:00Z')
  const operation = {
    ...newRegionOperation('one', 'install'),
    phase: 'downloading',
    lastProgressAt: new Date(start).toISOString(),
    bytesTransferred: 100,
    totalBytes: 1000,
  }
  const previous: MapRegionComponentState = {
    status: 'downloading',
    bytesDownloaded: 100,
    operation,
  }
  const heartbeat = persistRegionProgress(
    previous,
    { ...previous, operation: { ...operation, heartbeatAt: new Date(start + 1000).toISOString() } },
    'one',
    'routing',
    start + 1000
  )
  assert.equal(heartbeat.lastProgressAt, operation.lastProgressAt)
  const progress = persistRegionProgress(
    previous,
    { ...previous, bytesDownloaded: 300, operation },
    'one',
    'routing',
    start + 2000
  )
  assert.equal(progress.rateBytesPerSecond, 100)
  assert.equal(progress.etaSeconds, 7)
  assert.equal(progress.lastProgressAt, new Date(start + 2000).toISOString())
  const next = newRegionOperation('two', 'install', progress)
  assert.equal(next.attempt, 2)
  assert.equal(next.rateBytesPerSecond, undefined)
  assert.equal(next.bytesTransferred, undefined)
})

test('builder stage bytes never replace internet transfer counters and counters clear between stages', () => {
  const current = {
    ...newRegionOperation('one', 'install'),
    phase: 'reading_source',
    bytesTransferred: 10,
    totalBytes: 10,
    stageBytesProcessed: 500,
  }
  const stage = applyBuilderProgress(current, {
    status: 'preparing',
    telemetryVersion: 1,
    phase: 'building_routing',
    detail: 'parseways',
    recordsProcessed: 4,
    recordsTotal: 8,
    bytesProcessed: 100,
    totalBytes: 200,
  })
  assert.equal(stage.bytesTransferred, 10)
  assert.equal(stage.totalBytes, 10)
  assert.equal(stage.stageBytesProcessed, 100)
  assert.equal(stage.stageTotalBytes, 200)
  const next = applyBuilderProgress(stage, {
    status: 'preparing',
    telemetryVersion: 1,
    phase: 'building_routing',
    detail: 'edges',
  })
  assert.equal(next.recordsProcessed, undefined)
  assert.equal(next.stageBytesProcessed, undefined)
  const persisted = persistRegionProgress(
    { status: 'preparing', operation: stage },
    { status: 'preparing', operation: next },
    'one',
    'routing'
  )
  assert.equal(persisted.recordsProcessed, undefined)
  assert.equal(persisted.stageTotalBytes, undefined)
})

test('real queue waiting overrides stale preparing without probing an old failed builder', async (t) => {
  const { regions, root, record } = await fixture(t)
  const before = await readFile(join(root, 'state/fixture/routing.json'), 'utf8')
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('A waiting task must not probe historical preparation')
  })
  const service = new MapRegionOperationService(regions, async () => [
    {
      regionId: 'fixture',
      component: 'routing',
      operationId: record.operationId,
      state: 'waiting',
      waitingFor: 'Another region Â· address search',
      position: 1,
    },
  ])
  const result = await service.snapshot()
  const state = result.operations[0].components.routing!
  assert.equal(state.status, 'queued')
  assert.equal(state.operation?.phase, 'queued')
  assert.equal(state.operation?.waitingFor, 'Another region Â· address search')
  assert.equal(state.operation?.retryable, false)
  assert.ok(!JSON.stringify(result).includes(root))
  assert.equal(await readFile(join(root, 'state/fixture/routing.json'), 'utf8'), before)
})

test('a queued operation without an active owner does not claim that another operation is running', async (t) => {
  const { regions, record } = await fixture(t)
  const service = new MapRegionOperationService(regions, async () => [
    {
      regionId: 'fixture',
      component: 'routing',
      operationId: record.operationId,
      state: 'waiting',
      position: 0,
    },
  ])
  const state = (await service.snapshot()).operations[0].components.routing!
  assert.equal(state.status, 'queued')
  assert.equal(state.operation?.activity, 'waiting')
  assert.equal(state.operation?.queueReason, undefined)
  assert.equal(state.operation?.waitingFor, undefined)
  assert.equal(state.operation?.retryable, false)
})

test('legacy preparation reports actual working-file growth without fake percentages or download speed', async (t) => {
  const { regions, root, record } = await fixture(t)
  const work = join(root, 'staging/test-job/routing.tar')
  await mkdir(join(work, '..'), { recursive: true })
  await writeFile(work, '1234')
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ status: 'preparing', progress: 20 })
  )
  let now = Date.now()
  const service = new MapRegionOperationService(
    regions,
    async () => [
      {
        regionId: 'fixture',
        component: 'routing',
        operationId: record.operationId,
        state: 'active',
      },
    ],
    () => now
  )
  const first = (await service.snapshot()).operations[0].components.routing!.operation!
  assert.equal(first.telemetry, 'legacy')
  assert.equal(first.workBytes, 4)
  now += 2000
  await writeFile(work, '12345678')
  const second = (await service.snapshot()).operations[0].components.routing!.operation!
  assert.equal(second.workBytes, 8)
  assert.equal(second.workRateBytesPerSecond, 2)
  assert.equal(second.activityEvidence, 'output_growth')
  assert.equal(second.rateBytesPerSecond, undefined)
  assert.equal(second.transferComplete, true)
})

test('the operations projection removes reading counters after the builder enters validation', async (t) => {
  const { regions, record } = await fixture(t)
  await regions.save('fixture', 'routing', {
    ...record,
    operation: {
      ...newRegionOperation(record.operationId, 'install'),
      phase: 'reading_source',
      detail: 'osm',
      recordsProcessed: 70000,
      stageBytesProcessed: 500,
    },
  } as any)
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      status: 'preparing',
      telemetryVersion: 1,
      phase: 'validating',
      detail: 'artifact_checksum',
    })
  )
  const result = await new MapRegionOperationService(regions).snapshot()
  const operation = result.operations[0].components.routing!.operation!
  assert.equal(operation.phase, 'validating')
  assert.equal(operation.recordsProcessed, undefined)
  assert.equal(operation.stageBytesProcessed, undefined)
})

test('uncertain preparation status is not treated as a terminal failure or retry permission', async (t) => {
  const { regions, record } = await fixture(t)
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Transient connection loss')
  })
  const service = new MapRegionOperationService(regions, async () => [
    { regionId: 'fixture', component: 'routing', operationId: record.operationId, state: 'active' },
  ])
  const state = (await service.snapshot()).operations[0].components.routing!
  assert.equal(state.status, 'preparing')
  assert.equal(state.operation?.activity, 'unavailable')
  assert.equal(state.operation?.retryable, false)
})

test('a failed HTTP wrapper cannot make its still-running preparation retryable', async (t) => {
  const { regions, record } = await fixture(t)
  await regions.save('fixture', 'routing', {
    ...record,
    status: 'failed',
    error: 'Status request timed out',
  } as any)
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ status: 'preparing', progress: 20 })
  )
  const service = new MapRegionOperationService(regions)
  const state = (await service.snapshot()).operations[0].components.routing!
  assert.equal(state.status, 'preparing')
  assert.equal(state.operation?.retryable, false)
})

test('retry reuses the captured immutable source offline instead of probing the public provider', async (t) => {
  const { regions, root, record, prepared, definition } = await fixture(t)
  await regions.save('fixture', 'routing', {
    ...record,
    status: 'failed',
    error: 'Preparation was interrupted',
  } as any)
  const calls: string[] = []
  t.mock.method(globalThis, 'fetch', async (input: any) => {
    calls.push(String(input))
    assert.ok(String(input).startsWith('http://fixture-builder/'))
    return Response.json({ status: 'failed' })
  })
  let dispatched = 0
  await regions.queueRetry('fixture', ['routing'], async () => {
    dispatched++
  })
  const queued = await regions.record('fixture', 'routing')
  assert.equal(dispatched, 1)
  assert.notEqual(queued.operationId, record.operationId)
  assert.equal(queued.cachedSource?.sha256, prepared.sha256)
  assert.equal(queued.cachedSourceDefinition?.url, definition.sources.routing.url)
  assert.equal(queued.operation?.sourceMode, 'cached')
  assert.equal(queued.operation?.type, 'install')
  assert.equal(queued.preparation, undefined)
  assert.deepEqual(calls, ['http://fixture-builder/build/test-job'])
  assert.equal(
    await readFile(join(root, 'sources/fixture', prepared.sha256, 'source.osm.pbf'), 'utf8'),
    'immutable public source'
  )
})

test('retry refuses a still-running builder and a changed cached source', async (t) => {
  const { regions, record, sourcePath } = await fixture(t)
  await regions.save('fixture', 'routing', { ...record, status: 'failed' } as any)
  let active = true
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ status: active ? 'preparing' : 'failed' })
  )
  await assert.rejects(
    regions.queueRetry('fixture', ['routing'], async () => undefined),
    /still running/
  )
  active = false
  await writeFile(sourcePath, 'corrupted')
  await assert.rejects(
    regions.queueRetry('fixture', ['routing'], async () => undefined),
    /unavailable or changed/
  )
  assert.equal((await regions.record('fixture', 'routing')).operationId, record.operationId)
})

test('a cached retry builds and publishes the original source even after the public catalog changes', async (t) => {
  const { regions, root, record, prepared } = await fixture(t)
  await regions.save('fixture', 'routing', { ...record, status: 'failed' } as any)
  let build: any
  t.mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const url = String(input)
    assert.ok(
      url.startsWith('http://fixture-builder/'),
      'A cached preparation must never probe a public source'
    )
    if (url.endsWith('/test-job')) return Response.json({ status: 'failed' })
    if (url.endsWith('/build')) {
      build = JSON.parse(String(init?.body))
      const artifact = join(root, build.outputRelativePath)
      await mkdir(join(artifact, '..'), { recursive: true })
      await writeFile(artifact, 'verified-route')
      return Response.json({ jobId: build.jobId }, { status: 202 })
    }
    return Response.json({
      status: 'completed',
      artifact: {
        relativePath: build.outputRelativePath,
        sizeBytes: 14,
        sha256: digest('verified-route'),
      },
    })
  })
  await regions.queueRetry('fixture', ['routing'], async () => undefined)
  const catalog = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'))
  catalog.regions[0].sources.routing.url =
    'https://download.geofabrik.de/europe/albania-latest.osm.pbf'
  catalog.regions[0].coverage.bbox = [10, 10, 20, 20]
  await writeFile(join(root, 'catalog.json'), JSON.stringify(catalog))
  const queued = await regions.record('fixture', 'routing')
  const installed = await regions.install('fixture', 'routing', queued.operationId)
  assert.equal(build.source.sha256, prepared.sha256)
  assert.equal(installed.source.url, prepared.url)
  assert.equal(installed.dataDate, prepared.lastModified)
  assert.deepEqual(installed.coverage.bbox, [0, 0, 2, 2])
  assert.equal((await regions.record('fixture', 'routing')).operation?.phase, 'ready')
})

test('adding a new preparation service never reroutes an already captured job', async (t) => {
  const { regions, root, record } = await fixture(t)
  const old = process.env.MAP_REGION_PREPARATION_BUILDER_URL
  process.env.MAP_REGION_PREPARATION_BUILDER_URL = 'http://new-progress-builder'
  t.after(() => {
    if (old === undefined) delete process.env.MAP_REGION_PREPARATION_BUILDER_URL
    else process.env.MAP_REGION_PREPARATION_BUILDER_URL = old
  })
  const relativePath = record.preparation.relativePath
  await mkdir(join(root, 'staging/test-job'), { recursive: true })
  await writeFile(join(root, relativePath), 'ready')
  const calls: string[] = []
  t.mock.method(globalThis, 'fetch', async (input: any) => {
    calls.push(String(input))
    assert.equal(String(input), 'http://fixture-builder/build/test-job')
    return Response.json({
      status: 'completed',
      artifact: { relativePath, sizeBytes: 5, sha256: digest('ready') },
    })
  })
  await regions.install('fixture', 'routing', record.operationId)
  assert.equal(calls.length, 2)
  assert.equal((await regions.record('fixture', 'routing')).status, 'installed')
})
