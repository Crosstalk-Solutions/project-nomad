import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MapRegionService } from '../../app/services/map_region_service.js'
import type { MapRegionComponent } from '../../types/map_regions.js'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'nomad-routing-workflow-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = {
    sourceId: 'geofabrik',
    format: 'osm-pbf',
    url: 'https://download.geofabrik.de/europe/andorra-latest.osm.pbf',
    dataDate: '2026-11-08',
  }
  const region = {
    id: 'fixture',
    name: 'Fixture',
    territoryScope: 'country',
    countryCodes: ['AD'],
    coverage: { bbox: [1, 42, 2, 43] },
    sources: { routing: source },
  }
  const catalog = join(root, 'catalog.json')
  await writeFile(catalog, JSON.stringify({ schema_version: 2, regions: [region] }))
  const service = new MapRegionService(root, catalog)
  const content = 'completed immutable source'
  const prepared = {
    url: source.url,
    resolvedUrl: source.url,
    sha256: hash(content),
    size: Buffer.byteLength(content),
    lastModified: '2026-01-01',
    downloadedAt: '2026-01-02',
  }
  const sourcePath = join(root, 'sources/fixture', prepared.sha256, 'source.osm.pbf')
  await mkdir(join(sourcePath, '..'), { recursive: true })
  await writeFile(sourcePath, content)
  const metadata = join(root, 'sources/fixture/current.json')
  await writeFile(metadata, JSON.stringify(prepared))
  for (const [name, value] of Object.entries({
    MAP_REGION_BUILDER_URL: 'http://fixture-builder',
    MAP_REGION_PREPARATION_BUILDER_URL: 'http://fixture-builder',
  })) {
    const previous = process.env[name]
    process.env[name] = value
    t.after(() => {
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    })
  }
  const requests = new Map<string, any>(),
    calls: string[] = []
  const state = { publicProbes: 0, allowPublic: false }
  t.mock.method(globalThis, 'fetch', async (input: any, init: RequestInit = {}) => {
    const url = String(input)
    calls.push((init.method || 'GET') + ' ' + url)
    if (!url.startsWith('http://fixture-builder/')) {
      assert(state.allowPublic, 'Cached routing must not probe a public source')
      assert.equal(init.method, 'HEAD')
      state.publicProbes++
      return new Response(null, {
        headers: {
          'content-length': String(prepared.size),
          'last-modified': prepared.lastModified,
        },
      })
    }
    if (url.endsWith('/status')) return Response.json({ ready: true })
    if (url.endsWith('/build')) {
      const request = JSON.parse(String(init.body))
      assert.equal(request.component, 'routing')
      requests.set(request.jobId, request)
      const output = join(root, request.outputRelativePath)
      await mkdir(join(output, '..'), { recursive: true })
      await writeFile(output, 'routing-' + request.jobId)
      return Response.json({ jobId: request.jobId }, { status: 202 })
    }
    const request = requests.get(url.split('/').at(-1)!)
    assert(request)
    const output = await readFile(join(root, request.outputRelativePath), 'utf8')
    return Response.json({
      status: 'completed',
      artifact: {
        relativePath: request.outputRelativePath,
        sizeBytes: Buffer.byteLength(output),
        sha256: hash(output),
      },
    })
  })
  return { root, service, region, prepared, sourcePath, content, requests, calls, state, metadata }
}

test('one durable routing intention installs directly from cached source without postal preparation', async (t) => {
  const f = await fixture(t),
    dispatch: MapRegionComponent[] = []
  await f.service.queueInstall('fixture', ['routing'], async (_id, c) => {
    dispatch.push(c)
  })
  assert.deepEqual(dispatch, ['routing'])
  const queued = await f.service.record('fixture', 'routing')
  assert.deepEqual(queued.workflow?.components, ['routing'])
  assert.equal(queued.workflow?.searchOperationId, undefined)
  const installed = await f.service.install('fixture', 'routing', queued.operationId)
  assert.equal(installed.source.sha256, f.prepared.sha256)
  assert.equal(installed.territoryScope, 'country')
  assert.deepEqual(installed.countryCodes, ['AD'])
  assert.equal(f.requests.size, 1)
  assert.equal(f.state.publicProbes, 0)
  assert.equal(await readFile(f.sourcePath, 'utf8'), f.content)
  await assert.rejects(readFile(join(f.root, 'state/fixture/search.json')), /ENOENT/)
  const state = await f.service.getState()
  assert.equal(state.regions[0].components.search, undefined)
})

test('idle recovery does not read the large bundled catalog', async (t) => {
  const f = await fixture(t)
  const catalog = t.mock.method(f.service, 'catalog', async () => {
    throw new Error('No catalog read expected without pending routing operations')
  })
  const dispatch = t.mock.fn(async () => undefined)
  assert.equal(await f.service.recoverPending(dispatch), 0)
  assert.equal(catalog.mock.callCount(), 0)
  assert.equal(dispatch.mock.callCount(), 0)
})

test('unsupported components are rejected before catalog or network IO', async (t) => {
  const f = await fixture(t)
  t.mock.method(f.service, 'region', async () => {
    throw new Error('No catalog read expected')
  })
  const dispatch = async () => {
    throw new Error('No queue work expected')
  }
  for (const action of [
    () => f.service.queueInstall('fixture', ['search'], dispatch),
    () => f.service.queueInstall('fixture', ['routing', 'search'], dispatch),
    () => f.service.queueUpdate('fixture', ['search'], dispatch),
    () => f.service.queueRetry('fixture', ['search'], dispatch),
    () => f.service.install('fixture', 'search'),
  ])
    await assert.rejects(
      action(),
      (error: any) => error.status === 400 && /routing/.test(error.message)
    )
  assert.equal(f.calls.length, 0)
})

test('failed routing retry creates a new generation, preserves the source and keeps a routing-only workflow', async (t) => {
  const f = await fixture(t)
  await f.service.queueInstall('fixture', ['routing'], async () => {})
  const before = await f.service.record('fixture', 'routing')
  await f.service.save('fixture', 'routing', { ...before, status: 'failed', error: 'Interrupted' })
  let dispatched = 0
  await f.service.queueRetry('fixture', ['routing'], async () => {
    dispatched++
  })
  const after = await f.service.record('fixture', 'routing')
  assert.notEqual(after.operationId, before.operationId)
  assert.equal(after.workflow?.id, before.workflow?.id)
  assert.deepEqual(after.workflow?.components, ['routing'])
  assert.equal(after.workflow?.searchOperationId, undefined)
  assert.equal(dispatched, 1)
  await f.service.install('fixture', 'routing', after.operationId)
  assert.equal(f.state.publicProbes, 0)
})

test('cancelled routing intentions are not resurrected by recovery', async (t) => {
  const f = await fixture(t)
  await f.service.queueInstall('fixture', ['routing'], async () => {})
  await f.service.cancel('fixture', ['routing'], async () => true)
  const dispatch: MapRegionComponent[] = []
  await f.service.recoverPending(async (_id, c) => {
    dispatch.push(c)
  })
  await f.service.resumeWorkflow('fixture', async (_id, c) => {
    dispatch.push(c)
  })
  assert.deepEqual(dispatch, [])
  assert.equal((await f.service.record('fixture', 'routing')).status, 'cancelled')
  assert.equal(await readFile(f.sourcePath, 'utf8'), f.content)
})

test('restart recovers only the routing part of an interrupted legacy intent and leaves postal state untouched', async (t) => {
  const f = await fixture(t)
  await f.service.queueInstall('fixture', ['routing'], async () => {})
  const routing = await f.service.record('fixture', 'routing')
  const oldSearch = {
    status: 'failed' as const,
    operationId: '22222222-2222-4222-8222-222222222222',
  }
  await f.service.save('fixture', 'search', oldSearch)
  const oldBytes = await readFile(join(f.root, 'state/fixture/search.json'), 'utf8')
  await rm(join(f.root, 'state/fixture/routing.json'))
  await mkdir(join(f.root, 'workflow-intents'), { recursive: true })
  await writeFile(
    join(f.root, 'workflow-intents', routing.workflow!.id + '.json'),
    JSON.stringify({
      regionId: 'fixture',
      workflowId: routing.workflow!.id,
      previous: {},
      records: {
        routing: {
          ...routing,
          workflow: {
            ...routing.workflow,
            components: ['search', 'routing'],
            searchOperationId: oldSearch.operationId,
          },
        },
        search: { ...oldSearch, status: 'queued' },
      },
    })
  )
  const dispatch: MapRegionComponent[] = []
  await f.service.recoverPending(async (_id, c) => {
    dispatch.push(c)
  })
  assert.deepEqual(dispatch, ['routing'])
  assert.equal((await f.service.record('fixture', 'routing')).operationId, routing.operationId)
  assert.deepEqual((await f.service.record('fixture', 'routing')).workflow?.components, ['routing'])
  assert.equal(await readFile(join(f.root, 'state/fixture/search.json'), 'utf8'), oldBytes)
})

test('a removed postal prerequisite never blocks a valid country route', async (t) => {
  const f = await fixture(t)
  await f.service.queueInstall('fixture', ['routing'], async () => {})
  const routing = await f.service.record('fixture', 'routing')
  await f.service.save('fixture', 'routing', {
    ...routing,
    workflow: {
      ...routing.workflow!,
      components: ['search', 'routing'],
      searchOperationId: '22222222-2222-4222-8222-222222222222',
    },
  })
  assert.deepEqual(await f.service.workflowDependency('fixture', 'routing'), {
    ready: true,
    failed: false,
  })
  const installed = await f.service.install('fixture', 'routing', routing.operationId)
  assert.equal(installed.source.sha256, f.prepared.sha256)
  assert.deepEqual((await f.service.record('fixture', 'routing')).workflow?.components, ['routing'])
})

test('a source completed after enqueue is reused without an external HEAD', async (t) => {
  const f = await fixture(t)
  await rm(f.sourcePath)
  await rm(f.metadata)
  await f.service.queueInstall('fixture', ['routing'], async () => {})
  assert.equal((await f.service.record('fixture', 'routing')).operation?.sourceMode, 'download')
  await writeFile(f.sourcePath, f.content)
  await writeFile(f.metadata, JSON.stringify(f.prepared))
  const result = await f.service.install('fixture', 'routing')
  assert.equal(result.source.sha256, f.prepared.sha256)
  assert.equal(f.state.publicProbes, 0)
})

test('continental and unclassified requests are rejected without jobs, source transfer or recreated retired state', async (t) => {
  const f = await fixture(t)
  const catalog = join(f.root, 'catalog.json')
  await writeFile(
    catalog,
    JSON.stringify({
      schema_version: 2,
      regions: [
        { ...f.region, id: 'south-america' },
        { ...f.region, id: 'unknown', territoryScope: undefined, countryCodes: undefined },
      ],
    })
  )
  for (const id of ['south-america', 'unknown']) {
    for (const action of [
      () => f.service.queueInstall(id, ['routing'], async () => {}),
      () => f.service.queueUpdate(id, ['routing'], async () => {}),
      () => f.service.queueRetry(id, ['routing'], async () => {}),
      () => f.service.install(id, 'routing'),
    ])
      await assert.rejects(action(), /Collections are navigation only/)
    await f.service.save(id, 'routing', {
      status: 'queued',
      operationId: '33333333-3333-4333-8333-333333333333',
    })
  }
  let dispatched = false
  await f.service.recoverPending(async () => {
    dispatched = true
  })
  assert.equal(dispatched, false)
  assert.equal(f.calls.length, 0)
  assert.deepEqual(await readdir(join(f.root, 'state')), ['south-america', 'unknown'])
})
