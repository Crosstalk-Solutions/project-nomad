import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { MapRegionService } from '../../app/services/map_region_service.js'
import { MapRegionOperationService } from '../../app/services/map_region_operation_service.js'
import { regionProvider, attachLocalAssets } from '../../app/utils/map_region_availability.js'
import type {
  MapRegionDefinition,
  MapRegionInstalledComponent,
  MapRegionComponent,
} from '../../types/map_regions.js'
import type { MapPackState } from '../../types/map_packs.js'

const source = (file: string) => ({
  sourceId: 'geofabrik' as const,
  format: 'osm-pbf' as const,
  url: 'https://download.geofabrik.de/' + file + '-latest.osm.pbf',
})
export const hierarchyRegions: MapRegionDefinition[] = [
  { id: 'world', name: 'World', coverage: { bbox: [-180, -90, 180, 90] }, sources: {} },
  {
    id: 'south-america',
    parentId: 'world',
    name: 'South America',
    coverage: { bbox: [-85, -57, -33, 12] },
    sources: { routing: source('south-america'), search: source('south-america') },
  },
  {
    id: 'brazil',
    parentId: 'south-america',
    name: 'Brazil',
    coverage: { bbox: [-74, -34, -34, 6] },
    sources: { routing: source('south-america/brazil'), search: source('south-america/brazil') },
  },
  {
    id: 'sudeste',
    parentId: 'brazil',
    name: 'Sudeste',
    coverage: { bbox: [-54, -26, -38, -13] },
    sources: {
      routing: source('south-america/brazil/sudeste'),
      search: source('south-america/brazil/sudeste'),
    },
  },
  {
    id: 'br-addresses-rj',
    parentId: 'brazil',
    name: 'RJ IBGE',
    coverage: { bbox: [-45, -24, -40, -20] },
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
  const root = await mkdtemp(join(tmpdir(), 'nomad-tree-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const catalog = join(root, 'catalog-vendored.json')
  await writeFile(catalog, JSON.stringify({ schema_version: 2, regions: hierarchyRegions }))
  return { root, service: new MapRegionService(root, catalog) }
}
async function installed(service: MapRegionService, id: string, component: MapRegionComponent) {
  const region = hierarchyRegions.find((item) => item.id === id)!
  const bytes = Buffer.from('verified-' + id + '-' + component)
  const raw = Buffer.from('public source snapshot')
  const sourceSha = createHash('sha256').update(raw).digest('hex')
  const sha = createHash('sha256').update(bytes).digest('hex')
  const version = sourceSha.slice(0, 16) + '-' + sha.slice(0, 12)
  const relativePath = join(
    'installed',
    id,
    component,
    version,
    component === 'routing' ? 'routing.tar' : 'search.sqlite'
  )
  const path = join(service.root, relativePath)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, bytes)
  const item: MapRegionInstalledComponent = {
    schema_version: 2,
    regionId: id,
    name: region.name,
    component,
    coverage: region.coverage,
    version,
    artifactPath: path,
    relativePath,
    sizeBytes: bytes.length,
    sha256: sha,
    source: {
      ...region.sources[component]!,
      sha256: sourceSha,
      downloadedAt: '2026-11-01',
      lastModified: 'Sun, 01 Nov 2026 00:00:00 GMT',
      sizeBytes: raw.length,
    },
    createdAt: '2026-11-01',
    records: 1,
  }
  await service.save(id, component, {
    status: 'installed',
    installed: item,
    region,
    installedVersion: version,
  })
  const sourceDirectory = join(service.root, 'sources', id, sourceSha)
  await mkdir(sourceDirectory, { recursive: true })
  await writeFile(join(sourceDirectory, 'source.osm.pbf'), raw)
  return item
}

test('country coverage comes from eligible country parents, never retired continental or postal packages', async (t) => {
  const { service } = await fixture(t)
  const graph = await installed(service, 'south-america', 'routing')
  const brazil = hierarchyRegions.find((r) => r.id === 'brazil')!
  assert.equal(regionProvider(brazil, 'routing', hierarchyRegions, [graph]), undefined)
  assert.equal(
    (await service.catalog()).regions.some((region) => region.id === 'br-addresses-rj'),
    false
  )
})

test('download request skips a covered official child without duplicating bytes or jobs', async (t) => {
  const { service } = await fixture(t)
  await installed(service, 'brazil', 'routing')
  let dispatched = false
  await service.queueInstall('sudeste', ['routing'], async () => {
    dispatched = true
  })
  assert.equal(dispatched, false)
  assert.equal((await service.record('sudeste', 'routing')).status, 'available')
  assert.equal((await service.listInstalledComponents()).length, 1)
})

test('children and legacy partial graphs never create a connected continent package', async (t) => {
  const { service } = await fixture(t)
  const graph = await installed(service, 'brazil', 'routing')
  assert.equal(regionProvider(hierarchyRegions[1], 'routing', hierarchyRegions, [graph]), undefined)
  const pack = {
    id: 'rio',
    name: 'Rio urban pilot',
    version: '1',
    status: 'installed',
    coverage: {
      bbox: [-43.6, -23.1, -42.9, -22.5],
      territory_scope: 'subregion',
      country_codes: ['BR'],
    },
    routing: { artifact: { size_bytes: 5 } },
  } as MapPackState
  const assets = attachLocalAssets(hierarchyRegions, [pack])
  assert.equal(assets.get('sudeste')?.[0].partial, true)
  assert.equal(assets.has('brazil'), false)
  assert.equal(regionProvider(hierarchyRegions[2], 'routing', hierarchyRegions, []), undefined)
})

test('a corrupt region record does not hide another installed country or break settings', async (t) => {
  const { root, service } = await fixture(t)
  const brazil = await installed(service, 'brazil', 'routing')
  const damaged = join(root, 'state', 'sudeste')
  await mkdir(damaged, { recursive: true })
  await writeFile(join(damaged, 'routing.json'), '{broken')
  t.mock.method(console, 'warn', () => {})
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ready: true }))
  const inventory = await service.listInstalledComponents('routing')
  assert.deepEqual(
    inventory.map((item) => item.regionId),
    ['brazil']
  )
  assert.equal(inventory[0].version, brazil.version)
  const settings = await service.getState()
  assert.equal(
    settings.regions.find((r) => r.id === 'brazil')?.components.routing?.status,
    'installed'
  )
  assert.match(
    settings.regions.find((r) => r.id === 'sudeste')?.components.routing?.error || '',
    /metadata could not be read/
  )
  await service.save('brazil', 'routing', {
    ...(await service.record('brazil', 'routing')),
    status: 'queued',
    updating: true,
  })
  const activity = await new MapRegionOperationService(service).snapshot()
  assert.deepEqual(
    activity.operations.map((item) => item.regionId),
    ['brazil']
  )
  const intents = join(root, 'workflow-intents')
  await mkdir(intents)
  await writeFile(join(intents, '00000000-0000-4000-8000-000000000000.json'), '{broken')
  const recovered: string[] = []
  assert.equal(await service.recoverPending(async (id) => recovered.push(id)), 1)
  assert.deepEqual(recovered, ['brazil'])
})

test('a verified unchanged source is reused before checking available preparation space', async (t) => {
  const { root, service } = await fixture(t)
  const brazil = await installed(service, 'brazil', 'routing')
  const region = await service.region('brazil')
  const cached = {
    url: brazil.source.url,
    size: brazil.source.sizeBytes,
    sha256: brazil.source.sha256,
    lastModified: brazil.source.lastModified,
    etag: '"unchanged"',
  }
  await writeFile(join(root, 'sources', 'brazil', 'current.json'), JSON.stringify(cached))
  const previous = process.env.MAP_REGIONS_BACKING_DISK_PATH
  process.env.MAP_REGIONS_BACKING_DISK_PATH = join(root, 'unavailable-backing-probe')
  t.after(() => {
    if (previous === undefined) delete process.env.MAP_REGIONS_BACKING_DISK_PATH
    else process.env.MAP_REGIONS_BACKING_DISK_PATH = previous
  })
  let etag = cached.etag
  const request = t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    assert.equal(init?.method, 'HEAD')
    return new Response(null, {
      headers: {
        'content-length': String(cached.size),
        'last-modified': cached.lastModified!,
        etag,
      },
    })
  })
  const preserve = { installed: brazil }
  const reused = await (service as any).download(region, 'routing', preserve)
  assert.equal(reused.sha256, brazil.source.sha256)
  etag = '"changed"'
  await assert.rejects((service as any).download(region, 'routing', preserve), /backing disk/)
  assert.equal(request.mock.callCount(), 2)
})

test('removing inherited coverage cannot remove the owner package', async (t) => {
  const { service } = await fixture(t)
  const graph = await installed(service, 'brazil', 'routing')
  let cancelled = false
  await assert.rejects(
    service.remove('sudeste', 'routing', async () => {
      cancelled = true
    }),
    /belongs to Brazil/
  )
  assert.equal(cancelled, false)
  assert.ok((await readFile(graph.artifactPath)).length)
})

test('a missing installed artifact can be explicitly requeued rather than silently skipped', async (t) => {
  const { service } = await fixture(t)
  const item = await installed(service, 'brazil', 'routing')
  await rm(item.artifactPath)
  let dispatched = false
  await service.queueInstall('brazil', ['routing'], async () => {
    dispatched = true
  })
  const record = await service.record('brazil', 'routing')
  assert.equal(dispatched, true)
  assert.equal(record.status, 'queued')
  assert.equal(record.installed, undefined)
})

test('update failure leaves the previous verified component available', async (t) => {
  const { service } = await fixture(t)
  const item = await installed(service, 'brazil', 'routing')
  const previous = process.env.MAP_REGION_BUILDER_URL
  process.env.MAP_REGION_BUILDER_URL = 'http://builder'
  t.after(() => {
    if (previous === undefined) delete process.env.MAP_REGION_BUILDER_URL
    else process.env.MAP_REGION_BUILDER_URL = previous
  })
  await service.queueUpdate('brazil', ['routing'], async () => {})
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('temporary offline source')
  })
  await assert.rejects(service.install('brazil', 'routing'), /offline/)
  const record = await service.record('brazil', 'routing')
  assert.equal(record.status, 'failed')
  assert.equal(record.installed?.version, item.version)
  assert.equal((await service.listInstalledComponents()).length, 1)
  assert.ok((await readFile(item.artifactPath)).length)
})

test('queued updates are recovered even though a previous version is installed', async (t) => {
  const { service } = await fixture(t)
  await installed(service, 'brazil', 'routing')
  await service.queueUpdate('brazil', ['routing'], async () => {})
  const recovered: string[] = []
  await service.recoverPending(async (id, c) => {
    recovered.push(id + ':' + c)
  })
  assert.deepEqual(recovered, ['brazil:routing'])
})

test('checking the covered child checks its real shared source once and never queues data', async (t) => {
  const { service } = await fixture(t)
  await installed(service, 'brazil', 'routing')
  const md5 = createHash('md5').update('public source snapshot').digest('hex')
  let heads = 0,
    checksumRequests = 0
  t.mock.method(globalThis, 'fetch', async (input: unknown, options: any) => {
    if (String(input).endsWith('.md5')) {
      checksumRequests++
      return new Response(md5 + '  source.osm.pbf')
    }
    assert.equal(options.method, 'HEAD')
    heads++
    return new Response(null, {
      headers: { 'content-length': '22', 'last-modified': 'Sun, 01 Nov 2026 00:00:00 GMT' },
    })
  })
  const result = await service.checkUpdates('sudeste')
  assert.equal(result.checked, 1)
  assert.equal(heads, 1)
  assert.equal(checksumRequests, 1)
  assert.ok(
    result.results.every(
      (item) => item.regionId === 'brazil' && item.update.status === 'up_to_date'
    )
  )
  assert.equal((await service.record('sudeste', 'routing')).status, 'available')
})

test('a verified new version publishes after preparation while the old version remains readable', async (t) => {
  const { service, root } = await fixture(t)
  const old = await installed(service, 'brazil', 'routing')
  const oldBytes = await readFile(old.artifactPath)
  const previous = process.env.MAP_REGION_BUILDER_URL
  process.env.MAP_REGION_BUILDER_URL = 'http://builder'
  t.after(() => {
    if (previous === undefined) delete process.env.MAP_REGION_BUILDER_URL
    else process.env.MAP_REGION_BUILDER_URL = previous
  })
  await service.queueUpdate('brazil', ['routing'], async () => {})
  t.mock.method(service as any, 'download', async () => ({
    url: old.source.url,
    resolvedUrl: old.source.url,
    size: 44,
    sha256: 'b'.repeat(64),
    lastModified: '2026-11-08',
    downloadedAt: '2026-11-08',
    path: join(root, 'sources/brazil/new/source.osm.pbf'),
  }))
  const bytes = Buffer.from('the newly verified graph')
  const sha = createHash('sha256').update(bytes).digest('hex')
  let output = '',
    polls = 0
  t.mock.method(globalThis, 'fetch', async (_input: unknown, options: any) => {
    if (options?.method === 'POST') {
      const request = JSON.parse(options.body)
      output = request.outputRelativePath
      await mkdir(join(root, output, '..'), { recursive: true })
      await writeFile(join(root, output), bytes)
      return new Response('{}', { status: 202 })
    }
    if (++polls === 1) {
      assert.equal((await service.listInstalledComponents())[0].version, old.version)
      assert.equal((await service.record('brazil', 'routing')).updating, true)
      return new Response(JSON.stringify({ status: 'preparing', progress: 20 }))
    }
    return new Response(
      JSON.stringify({
        status: 'completed',
        artifact: { relativePath: output, sizeBytes: bytes.length, sha256: sha },
      })
    )
  })
  const result = await service.install('brazil', 'routing')
  assert.notEqual(result.version, old.version)
  assert.deepEqual(await readFile(result.artifactPath), bytes)
  assert.deepEqual(await readFile(old.artifactPath), oldBytes)
  assert.equal((await service.record('brazil', 'routing')).updating, undefined)
})

test('explicit update of unchanged source does not rebuild the graph', async (t) => {
  const { service } = await fixture(t)
  const old = await installed(service, 'brazil', 'routing')
  const previous = process.env.MAP_REGION_BUILDER_URL
  process.env.MAP_REGION_BUILDER_URL = 'http://builder'
  t.after(() => {
    if (previous === undefined) delete process.env.MAP_REGION_BUILDER_URL
    else process.env.MAP_REGION_BUILDER_URL = previous
  })
  await service.queueUpdate('brazil', ['routing'], async () => {})
  t.mock.method(service as any, 'download', async () => ({
    ...old.source,
    size: old.source.sizeBytes,
    path: 'unused because unchanged',
  }))
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Builder must not be invoked')
  })
  assert.equal((await service.install('brazil', 'routing')).version, old.version)
  assert.equal((await service.record('brazil', 'routing')).status, 'installed')
})

test('offline checks report unavailable rather than up-to-date and preserve installed bytes', async (t) => {
  const { service } = await fixture(t)
  const old = await installed(service, 'brazil', 'routing')
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('network disconnected')
  })
  const result = await service.checkUpdates()
  assert.equal(result.results[0].update.status, 'unavailable')
  assert.equal((await service.listInstalledComponents())[0].version, old.version)
  assert.ok((await readFile(old.artifactPath)).length)
})

function officialIndex() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: 'brazil',
          name: 'Brazil',
          parent: 'south-america',
          urls: { pbf: source('south-america/brazil').url },
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-74, -34],
              [-34, -34],
              [-34, 6],
              [-74, 6],
              [-74, -34],
            ],
          ],
        },
      },
    ],
  }
}

test('catalog refresh persists only official source regions and keeps vendored data untouched', async (t) => {
  const { service, root } = await fixture(t)
  const before = await readFile(service.catalogPath)
  t.mock.method(
    globalThis,
    'fetch',
    async (input: unknown) =>
      new Response(
        String(input).endsWith('index-v1.json')
          ? JSON.stringify(officialIndex())
          : '<a href="33_RJ.zip">33_RJ.zip</a>'
      )
  )
  const result = await service.refreshCatalog()
  assert.equal(result.regions, 2)
  const refreshed = await service.catalog()
  assert.deepEqual(
    refreshed.regions.map((region) => region.id),
    ['world', 'brazil']
  )
  assert.ok((await readFile(join(root, 'catalog.json'))).length)
  assert.deepEqual(await readFile(service.catalogPath), before)
})

test('refresh rejects removal of an installed provider region instead of losing its tree node', async (t) => {
  const { service, root } = await fixture(t)
  const item = await installed(service, 'sudeste', 'routing')
  t.mock.method(
    globalThis,
    'fetch',
    async (input: unknown) =>
      new Response(
        String(input).endsWith('index-v1.json')
          ? JSON.stringify(officialIndex())
          : '<a href="33_RJ.zip">33_RJ.zip</a>'
      )
  )
  await assert.rejects(service.refreshCatalog(), /removed an installed region/)
  assert.equal((await service.catalog()).regions.length, hierarchyRegions.length - 1)
  await assert.rejects(readFile(join(root, 'catalog.json')), /ENOENT/)
  assert.ok((await readFile(item.artifactPath)).length)
})
