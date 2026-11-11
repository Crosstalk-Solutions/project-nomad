import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { MapRegionService } from '../../app/services/map_region_service.js'
import type { MapRegionDefinition, MapRegionInstalledComponent } from '../../types/map_regions.js'
import { mapRegionJobId } from '../../app/utils/map_region_operation.js'

const source = (name: string) => ({
  sourceId: 'geofabrik' as const,
  format: 'osm-pbf' as const,
  url: `https://download.geofabrik.de/south-america/${name}-latest.osm.pbf`,
})
const regions: MapRegionDefinition[] = [
  {
    id: 'brazil',
    name: 'Brazil',
    coverage: { bbox: [-74, -34, -34, 6] },
    sources: { routing: source('brazil'), search: source('brazil') },
  },
  {
    id: 'sudeste',
    name: 'Sudeste',
    parentId: 'brazil',
    coverage: { bbox: [-54, -26, -38, -13] },
    sources: {
      routing: source('brazil/sudeste'),
      search: source('brazil/sudeste'),
    },
  },
  {
    id: 'supplement',
    name: 'Official supplement',
    parentId: 'brazil',
    coverage: { bbox: [-54, -26, -38, -13] },
    sources: {
      search: {
        sourceId: 'ibge-cnefe',
        format: 'cnefe-zip',
        url: 'https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/UF/33_RJ.zip',
      },
    },
  },
]
async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'nomad-cancel-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const catalog = join(root, 'vendored.json')
  await writeFile(catalog, JSON.stringify({ schema_version: 2, regions }))
  const before = process.env.MAP_REGION_BUILDER_URL
  process.env.MAP_REGION_BUILDER_URL = 'http://builder'
  t.after(() => {
    if (before === undefined) delete process.env.MAP_REGION_BUILDER_URL
    else process.env.MAP_REGION_BUILDER_URL = before
  })
  return { root, service: new MapRegionService(root, catalog) }
}
async function waitFor(predicate: () => Promise<boolean>) {
  const until = Date.now() + 5000
  while (!(await predicate())) {
    assert.ok(Date.now() < until, 'operation did not reach expected phase')
    await new Promise((r) => setTimeout(r, 15))
  }
}

test('pending ancestor reserves only compatible components and rejects redundant API work', async (t) => {
  const { service } = await fixture(t)
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ready: true })))
  await service.queueInstall('brazil', ['routing'], async () => {})
  assert.equal((await service.resolvePendingProvider('sudeste', 'routing'))?.regionId, 'brazil')
  await assert.rejects(service.resolvePendingProvider('sudeste', 'search'), /Choose routing/)
  assert.equal(await service.resolvePendingProvider('brazil', 'routing'), undefined)
  const child = (await service.getState()).regions.find((item) => item.id === 'sudeste')!
  assert.equal(child.components.routing?.availability, 'available')
  assert.equal(child.components.routing?.pendingProvider?.status, 'queued')
  let dispatched = false
  await assert.rejects(
    service.queueInstall('sudeste', ['routing'], async () => {
      dispatched = true
    }),
    /Brazil/
  )
  assert.equal(dispatched, false)
  await assert.rejects(
    service.queueInstall('brazil', ['search'], async () => {}),
    /Choose routing/
  )
  await assert.rejects(service.resolvePendingProvider('supplement', 'search'), /Choose routing/)
})

test('cancelled queued components release descendants and are never recovered as downloads', async (t) => {
  const { service, root } = await fixture(t)
  await service.queueInstall('brazil', ['routing'], async () => {})
  const directory = join(root, 'sources/brazil')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'download.part'), 'partial transfer')
  await service.cancel('brazil', ['routing'], async () => true)
  assert.equal((await service.record('brazil', 'routing')).status, 'cancelled')
  assert.equal(await service.resolvePendingProvider('sudeste', 'routing'), undefined)
  assert.equal(
    await service.recoverPending(async () => {
      throw new Error('must not dispatch')
    }),
    0
  )
  assert.equal((await readFile(join(directory, 'download.part'))).toString(), 'partial transfer')
  await service.queueInstall('sudeste', ['routing'], async () => {})
  assert.equal((await service.record('sudeste', 'routing')).status, 'queued')
})

test('a job promoted to active acknowledges cancellation before starting its handler work', async (t) => {
  const { service } = await fixture(t)
  await service.queueInstall('brazil', ['routing'], async () => {})
  const operationId = (await service.record('brazil', 'routing')).operationId
  await service.cancel('brazil', ['routing'], async () => false)
  assert.equal((await service.record('brazil', 'routing')).status, 'cancelling')
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('No network or preparation should start')
  })
  await assert.rejects(service.install('brazil', 'routing', operationId), /cancelled/)
  assert.equal((await service.record('brazil', 'routing')).status, 'cancelled')
})

test('legacy cancellation between initial read and token adoption is also acknowledged', async (t) => {
  const { service, root } = await fixture(t)
  await service.save('brazil', 'routing', { status: 'queued' })
  const read = service.record.bind(service)
  let intercepted = false
  t.mock.method(service, 'record', async (id: string, component: 'routing' | 'search') => {
    const value = await read(id, component)
    if (!intercepted) {
      intercepted = true
      await new MapRegionService(root, service.catalogPath).cancel(
        id,
        [component],
        async () => false
      )
    }
    return value
  })
  await assert.rejects(service.install('brazil', 'routing'), /cancelled/)
  assert.equal((await read('brazil', 'routing')).status, 'cancelled')
})

test('cancelling an update preserves its previous verified installed component', async (t) => {
  const { service, root } = await fixture(t)
  const filename = join(root, 'installed/brazil/routing/old/routing.tar')
  await mkdir(join(filename, '..'), { recursive: true })
  await writeFile(filename, 'old graph')
  const installed = {
    regionId: 'brazil',
    component: 'routing',
    version: 'old',
    name: 'Brazil',
    artifactPath: filename,
    sizeBytes: 9,
    source: { ...source('brazil'), sha256: 'a'.repeat(64), downloadedAt: '2026-11-01' },
    coverage: regions[0].coverage,
  } as MapRegionInstalledComponent
  await service.save('brazil', 'routing', {
    status: 'installed',
    installed,
    bytesDownloaded: 1000,
    totalBytes: 1000,
  })
  await service.queueUpdate('brazil', ['routing'], async () => {})
  assert.equal((await service.record('brazil', 'routing')).bytesDownloaded, undefined)
  assert.equal((await service.record('brazil', 'routing')).totalBytes, undefined)
  await service.cancel('brazil', ['routing'], async () => true)
  assert.equal((await service.record('brazil', 'routing')).status, 'cancelled')
  assert.equal((await service.listInstalledComponents())[0].version, 'old')
  assert.equal((await readFile(filename)).toString(), 'old graph')
})

test('active transfer aborts its HTTP stream and acknowledges cancellation after closing the file', async (t) => {
  const { service, root } = await fixture(t)
  let signal: AbortSignal | undefined
  t.mock.method(globalThis, 'fetch', async (_input: unknown, options: any) => {
    if (options.method === 'HEAD')
      return new Response(null, {
        headers: { 'content-length': '1024', 'last-modified': 'yesterday' },
      })
    signal = options.signal
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64))
        signal!.addEventListener('abort', () => controller.error(signal!.reason), { once: true })
      },
    })
    return new Response(stream)
  })
  await service.queueInstall('brazil', ['routing'], async () => {})
  const operation = service.install('brazil', 'routing')
  const rejected = assert.rejects(operation, /cancelled/)
  await waitFor(async () => !!(await service.record('brazil', 'routing')).bytesDownloaded)
  // A separate API instance shares only persisted state with the queue worker.
  const api = new MapRegionService(root, service.catalogPath)
  await api.cancel('brazil', ['routing'], async () => false)
  assert.equal((await service.record('brazil', 'routing')).status, 'cancelling')
  await rejected
  assert.equal(signal?.aborted, true)
  assert.equal((await service.record('brazil', 'routing')).status, 'cancelled')
  assert.equal((await stat(join(root, 'sources/brazil/download.part'))).size, 64)
  assert.equal((await service.listInstalledComponents()).length, 0)
})

test('a late successful builder response cannot publish after cancellation', async (t) => {
  const { service, root } = await fixture(t)
  const bytes = Buffer.from('newly prepared graph')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const relativePath = 'staging/late-job/routing.tar'
  await mkdir(join(root, 'staging/late-job'), { recursive: true })
  await writeFile(join(root, relativePath), bytes)
  await service.save('brazil', 'routing', {
    status: 'queued',
    preparation: {
      jobId: 'late-job',
      relativePath,
      source: {
        url: source('brazil').url,
        resolvedUrl: source('brazil').url,
        size: 20,
        sha256: 'a'.repeat(64),
        lastModified: 'today',
        downloadedAt: 'today',
        path: join(root, 'sources/brazil/source.osm.pbf'),
      },
    },
  })
  let release!: () => void
  let entered = false
  const wait = new Promise<void>((r) => {
    release = r
  })
  t.mock.method(globalThis, 'fetch', async (_input: unknown, options: any) => {
    if (options?.method === 'POST') return new Response(JSON.stringify({ status: 'cancelled' }))
    entered = true
    await wait // Deliberately ignore AbortSignal, as a response may already be in flight.
    return new Response(
      JSON.stringify({
        status: 'completed',
        artifact: { relativePath, sizeBytes: bytes.length, sha256 },
      })
    )
  })
  const rejected = assert.rejects(service.install('brazil', 'routing'), /cancelled/)
  await waitFor(async () => entered)
  await service.cancel('brazil', ['routing'], async () => false)
  release()
  await rejected
  assert.equal((await service.record('brazil', 'routing')).status, 'cancelled')
  assert.equal((await service.listInstalledComponents()).length, 0)
  await assert.rejects(stat(join(root, 'installed/brazil/routing')), /ENOENT/)
  await assert.rejects(stat(join(root, 'staging/late-job')), /ENOENT/)
})

test('unconfirmed builder shutdown stays cancelling and retains scratch files until acknowledgement', async (t) => {
  const { service, root } = await fixture(t)
  const relativePath = 'staging/cancel-pending/routing.tar'
  await mkdir(join(root, 'staging/cancel-pending'), { recursive: true })
  await writeFile(join(root, relativePath), 'scratch')
  await service.save('brazil', 'routing', {
    status: 'preparing',
    preparation: {
      jobId: 'cancel-pending',
      relativePath,
      source: {
        url: source('brazil').url,
        resolvedUrl: source('brazil').url,
        size: 20,
        sha256: 'a'.repeat(64),
        lastModified: 'today',
        downloadedAt: 'today',
        path: join(root, 'sources/brazil/source.osm.pbf'),
      },
    },
  })
  let online = false
  t.mock.method(globalThis, 'fetch', async (input: unknown) => {
    if (!online) throw new Error('builder is unreachable')
    return new Response(
      JSON.stringify(String(input).endsWith('/status') ? { ready: true } : { status: 'cancelled' })
    )
  })
  await service.cancel('brazil', ['routing'], async () => true)
  assert.equal((await service.record('brazil', 'routing')).status, 'cancelling')
  assert.equal((await readFile(join(root, relativePath))).toString(), 'scratch')
  online = true
  await service.getState()
  assert.equal((await service.record('brazil', 'routing')).status, 'cancelled')
  await assert.rejects(stat(join(root, 'staging/cancel-pending')), /ENOENT/)
})

test('new retry identity is independent of the persisted cancellation tombstone', async (t) => {
  const { service } = await fixture(t)
  await service.queueInstall('brazil', ['routing'], async () => {})
  const before = (await service.record('brazil', 'routing')).operationId
  await service.cancel('brazil', ['routing'], async () => true)
  await service.queueInstall('brazil', ['routing'], async () => {})
  const retry = await service.record('brazil', 'routing')
  assert.equal(retry.status, 'queued')
  assert.notEqual(retry.operationId, before)
  assert.equal(retry.preparation, undefined)
  assert.notEqual(
    mapRegionJobId('brazil', 'routing', before),
    mapRegionJobId('brazil', 'routing', retry.operationId)
  )
  assert.equal(mapRegionJobId('brazil', 'routing'), 'region-brazil-routing')
  await assert.rejects(service.install('brazil', 'routing', before), /cancelled/)
  assert.equal((await service.record('brazil', 'routing')).status, 'queued')
})

test('a repeated old cancellation acknowledgement cannot overwrite an immediate retry generation', async (t) => {
  const { service } = await fixture(t)
  await service.queueInstall('brazil', ['routing'], async () => {})
  const old = (await service.record('brazil', 'routing')).operationId!
  await service.cancel('brazil', ['routing'], async () => true)
  const originalSave = service.save.bind(service)
  let blocked = false
  let entered!: () => void, release!: () => void
  const inside = new Promise<void>((r) => {
    entered = r
  })
  const held = new Promise<void>((r) => {
    release = r
  })
  t.mock.method(
    service,
    'save',
    async (
      id: string,
      component: 'routing' | 'search',
      value: Parameters<MapRegionService['save']>[2]
    ) => {
      if (value.status === 'cancelled' && !blocked) {
        blocked = true
        entered()
        await held
      }
      return originalSave(id, component, value)
    }
  )
  const late = (service as any).finishCancellation('brazil', 'routing', old)
  await inside
  let dispatched = false
  const retry = service.queueInstall('brazil', ['routing'], async () => {
    dispatched = true
  })
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(dispatched, false, 'queue transition must use the same component lock')
  release()
  await late
  await retry
  const current = await service.record('brazil', 'routing')
  assert.equal(current.status, 'queued')
  assert.notEqual(current.operationId, old)
  assert.equal(dispatched, true)
})
