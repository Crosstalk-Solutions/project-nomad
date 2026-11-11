import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertMapRegionSourceUrl,
  parseMapRegionCatalog,
  parseMapRegionDefinition,
} from '../../app/utils/map_region_catalog.js'
import { regionContains } from '../../app/utils/map_region_coverage.js'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MapRegionService } from '../../app/services/map_region_service.js'

test('official routing catalog preserves public hierarchy without postal or continental preparation', async () => {
  const catalog = parseMapRegionCatalog(
    JSON.parse(
      await readFile(new URL('../../resources/map-regions/catalog.json', import.meta.url), 'utf8')
    )
  )
  assert.equal(catalog.regions.length, 555)
  assert.equal(catalog.regions.filter((r) => r.id.startsWith('br-addresses-')).length, 0)
  assert.ok(catalog.regions.find((r) => r.id === 'brazil')?.sources.routing)
  assert.ok(catalog.regions.find((r) => r.id === 'portugal')?.sources.routing)
  assert(catalog.regions.every((r) => !r.sources.search))
  assert.equal(catalog.regions.find((r) => r.id === 'south-america')?.sources.routing, undefined)
})

test('sources reject internal URLs, Google data, encoded escape and provider mismatches', () => {
  for (const url of [
    'http://download.geofabrik.de/europe/andorra-latest.osm.pbf',
    'https://127.0.0.1/data.osm.pbf',
    'https://download.geofabrik.de.evil.org/europe/andorra-latest.osm.pbf',
    'https://maps.google.com/data.osm.pbf',
    'https://download.geofabrik.de/europe/andorra-latest.osm.pbf?redirect=http://localhost',
    'https://download.geofabrik.de/%2e%2e/secret.osm.pbf',
  ]) {
    assert.throws(() => assertMapRegionSourceUrl(url, 'geofabrik'))
  }
  assert.doesNotThrow(() =>
    assertMapRegionSourceUrl(
      'https://download.geofabrik.de/south-america/brazil-261106.osm.pbf',
      'geofabrik'
    )
  )
  assert.throws(
    () =>
      parseMapRegionDefinition({
        id: 'test',
        name: 'Test',
        coverage: { bbox: [0, 0, 1, 1] },
        sources: {
          routing: {
            sourceId: 'ibge-cnefe',
            format: 'cnefe-zip',
            url: 'https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/UF/14_RR.zip',
          },
        },
      }),
    /not a road/
  )
})

test('routing coverage respects polygons and holes instead of just bounding rectangles', () => {
  const coverage = {
    bbox: [0, 0, 10, 10] as [number, number, number, number],
    polygon: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [3, 3],
          [7, 3],
          [7, 7],
          [3, 7],
          [3, 3],
        ],
      ],
    },
  }
  assert.equal(regionContains(coverage, { lat: 2, lon: 2 }), true)
  assert.equal(regionContains(coverage, { lat: 5, lon: 5 }), false)
  assert.equal(regionContains(coverage, { lat: 11, lon: 2 }), false)
})

test('World navigation cannot dispatch a planet download or create installation state', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nomad-world-collection-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const catalog = fileURLToPath(
    new URL('../../resources/map-regions/catalog.json', import.meta.url)
  )
  const service = new MapRegionService(root, catalog)
  let dispatched = false
  await assert.rejects(
    service.queueInstall('world', ['routing'], async () => {
      dispatched = true
    }),
    /Collections are navigation/
  )
  assert.equal(dispatched, false)
  assert.deepEqual(await readdir(root), [])
})
