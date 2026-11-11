import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  mapRegionTerritory,
  isInstallableTerritory,
  assertInstallableTerritory,
  publicMapRegionTerritory,
} from '../../app/utils/map_region_territory.js'
import {
  parseMapRegionCatalog,
  parseMapRegionDefinition,
} from '../../app/utils/map_region_catalog.js'
import { buildPublicRegionCatalog } from '../../app/utils/map_region_public_catalog.js'
import { pendingRegionProvider, regionProvider } from '../../app/utils/map_region_availability.js'
import type { MapRegionDefinition } from '../../types/map_regions.js'

const bbox = [-180, -90, 180, 90] as [number, number, number, number]
const source = (id: string) => ({
  sourceId: 'geofabrik' as const,
  format: 'osm-pbf' as const,
  url: `https://download.geofabrik.de/${id}-latest.osm.pbf`,
})

test('territories use verified country ownership rather than tree level or display name', () => {
  assert.deepEqual(mapRegionTerritory({ id: 'russia' }), {
    territoryScope: 'country',
    countryCodes: ['RU'],
  })
  assert.deepEqual(mapRegionTerritory({ id: 'us-california' }), {
    territoryScope: 'subregion',
    countryCodes: ['US'],
  })
  assert.deepEqual(mapRegionTerritory({ id: 'sudeste' }), {
    territoryScope: 'subregion',
    countryCodes: ['BR'],
  })
  assert.deepEqual(mapRegionTerritory({ id: 'great-britain' }), {
    territoryScope: 'subregion',
    countryCodes: ['GB'],
  })
  assert.equal(mapRegionTerritory({ id: 'south-america' }).territoryScope, 'collection')
  for (const id of [
    'alps',
    'dach',
    'britain-and-ireland',
    'ireland-and-northern-ireland',
    'haiti-and-domrep',
  ]) {
    assert.equal(mapRegionTerritory({ id }).territoryScope, 'multi_country')
    assert.equal(isInstallableTerritory({ id }), false)
  }
  assert.deepEqual(mapRegionTerritory({ id: 'ireland-and-northern-ireland' }).countryCodes, [
    'GB',
    'IE',
  ])
})

test('known continents and multi-country extracts cannot be relabelled as one country', () => {
  for (const id of ['world', 'europe', 'south-america', 'dach', 'alps'])
    assert.throws(
      () => assertInstallableTerritory({ id, territoryScope: 'country', countryCodes: ['BR'] }),
      /navigation only/
    )
  assert.doesNotThrow(() => assertInstallableTerritory({ id: 'brazil' }))
  assert.doesNotThrow(() => assertInstallableTerritory({ id: 'sudeste' }))
  assert.equal(isInstallableTerritory({ id: 'unclassified-new-extract' }), false)
})

test('reviewed combined source labels override incomplete provider ISO ownership', () => {
  for (const [id, countries] of [
    ['indonesia', ['ID', 'TL']],
    ['malaysia-singapore-brunei', ['BN', 'MY', 'SG']],
    ['guangdong', ['CN', 'HK', 'MO']],
    ['nusa-tenggara', ['ID', 'TL']],
  ] as const) {
    assert.deepEqual(mapRegionTerritory({ id }), {
      territoryScope: 'multi_country',
      countryCodes: [...countries],
    })
    assert.equal(
      isInstallableTerritory({ id, territoryScope: 'country', countryCodes: [countries[0]] }),
      false
    )
  }
  for (const id of ['java', 'kalimantan', 'maluku', 'papua', 'sulawesi', 'sumatra'])
    assert.deepEqual(mapRegionTerritory({ id }), {
      territoryScope: 'subregion',
      countryCodes: ['ID'],
    })
  // These compound names describe one source country/area, not a merger.
  assert.deepEqual(mapRegionTerritory({ id: 'sao-tome-and-principe' }).countryCodes, ['ST'])
  assert.deepEqual(
    mapRegionTerritory({ id: 'saint-helena-ascension-and-tristan-da-cunha' }).countryCodes,
    ['SH']
  )
})

test('reviewed Pacific ISO corrections are retained across stale metadata and public refresh', () => {
  const expected: Record<string, string> = {
    'polynesie-francaise': 'PF',
    'tokelau': 'TK',
    'wallis-et-futuna': 'WF',
    'pitcairn-islands': 'PN',
    'vanuatu': 'VU',
    'marshall-islands': 'MH',
  }
  for (const [id, country] of Object.entries(expected)) {
    assert.deepEqual(mapRegionTerritory({ id }).countryCodes, [country])
    assert.deepEqual(
      publicMapRegionTerritory({ id, 'iso3166-1:alpha2': ['VU'] }, new Map()).countryCodes,
      [country]
    )
  }
  assert.deepEqual(mapRegionTerritory({ id: 'ile-de-clipperton' }), {
    territoryScope: 'subregion',
    countryCodes: ['FR'],
  })
  assert.deepEqual(
    mapRegionTerritory({ id: 'american-oceania', territoryScope: 'country', countryCodes: ['VU'] }),
    { territoryScope: 'collection', countryCodes: [] }
  )
  assert.equal(isInstallableTerritory({ id: 'american-oceania' }), false)
})

test('the reviewed Indonesian source polygon contains Timor-Leste and is never offered as a single-country graph', async () => {
  const raw = JSON.parse(
    await readFile(new URL('../../resources/map-regions/catalog.json', import.meta.url), 'utf8')
  )
  const nusa = raw.regions.find((region: any) => region.id === 'nusa-tenggara')
  assert(nusa?.coverage?.polygon)
  const { regionContains } = await import('../../app/utils/map_region_coverage.js')
  assert.equal(
    regionContains(nusa.coverage, { lat: -8.5569, lon: 125.5744 }),
    true,
    'Dili lies in this actual published source polygon'
  )
  const current = parseMapRegionCatalog(raw).regions.find(
    (region) => region.id === 'nusa-tenggara'
  )!
  assert.equal(current.sources.routing, undefined)
  assert.deepEqual(current.countryCodes, ['ID', 'TL'])
})

test('explicit new territory metadata is validated and requires exactly one owner for a downloadable unit', () => {
  const input = {
    id: 'future-region',
    name: 'Future source unit',
    coverage: { bbox },
    sources: { routing: source('future-region') },
  }
  assert.equal(
    isInstallableTerritory(
      parseMapRegionDefinition({ ...input, territoryScope: 'subregion', countryCodes: ['BR'] })
    ),
    true
  )
  for (const value of [
    { territoryScope: 'country', countryCodes: [] },
    { territoryScope: 'country', countryCodes: ['BR', 'AR'] },
    { territoryScope: 'multi_country', countryCodes: ['BR'] },
    { territoryScope: 'subregion', countryCodes: ['Brazil'] },
    { territoryScope: 'unreviewed', countryCodes: ['BR'] },
  ])
    assert.throws(() => parseMapRegionDefinition({ ...input, ...value }), /territory|Territory/)
})

test('new public subregions need provider ISO ownership, not a plausible country name or bounding box', () => {
  const all = new Map<string, Record<string, any>>([
    ['new-country', { 'id': 'new-country', 'iso3166-1:alpha2': ['BR'] }],
    ['new-state', { id: 'new-state', parent: 'new-country' }],
  ])
  assert.deepEqual(publicMapRegionTerritory(all.get('new-state')!, all), {
    territoryScope: 'subregion',
    countryCodes: ['BR'],
  })
  assert.deepEqual(
    publicMapRegionTerritory({ 'id': 'standalone-state', 'iso3166-2': ['US-XX'] }, all),
    { territoryScope: 'subregion', countryCodes: ['US'] }
  )
  assert.deepEqual(
    publicMapRegionTerritory(
      { id: 'country-looking-name', name: 'Brazil', parent: 'south-america' },
      all
    ),
    { territoryScope: 'collection', countryCodes: [] }
  )
})

test('the active catalog exposes routing only, keeps continental navigation and never fabricates an SP road extract', async () => {
  const raw = JSON.parse(
    await readFile(new URL('../../resources/map-regions/catalog.json', import.meta.url), 'utf8')
  )
  const catalog = parseMapRegionCatalog(raw)
  assert.equal(
    catalog.regions.some((region) => region.id.startsWith('br-addresses-')),
    false
  )
  assert(catalog.regions.every((region) => !region.sources.search))
  assert(catalog.regions.find((region) => region.id === 'brazil')?.sources.routing)
  assert(catalog.regions.find((region) => region.id === 'sudeste')?.sources.routing)
  assert.equal(catalog.regions.find((region) => region.id === 'europe')?.sources.routing, undefined)
  assert.equal(catalog.regions.find((region) => region.id === 'dach')?.sources.routing, undefined)
  assert.equal(
    catalog.regions.some((region) =>
      ['sao-paulo', 'brazil-sao-paulo', 'br-addresses-sp'].includes(region.id)
    ),
    false
  )
  assert.equal(catalog.regions.find((region) => region.id === 'russia')?.territoryScope, 'country')
})

test('refreshing the public catalog cannot re-enable continental sources or restore retired postal supplements', () => {
  const feature = (id: string, parent?: string) => ({
    type: 'Feature',
    properties: { id, parent, name: id, urls: { pbf: source(id).url } },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
  })
  const catalog = buildPublicRegionCatalog(
    {
      type: 'FeatureCollection',
      features: [
        feature('europe'),
        feature('south-america'),
        feature('brazil', 'south-america'),
        feature('russia'),
        feature('dach', 'europe'),
      ],
    },
    { schema_version: 2, regions: [] },
    '35_SP.zip'
  )
  assert(catalog.regions.find((region) => region.id === 'brazil')?.sources.routing)
  assert(catalog.regions.find((region) => region.id === 'russia')?.sources.routing)
  assert.equal(
    catalog.regions.find((region) => region.id === 'south-america')?.sources.routing,
    undefined
  )
  assert.equal(catalog.regions.find((region) => region.id === 'dach')?.sources.routing, undefined)
  assert(catalog.regions.every((region) => !region.sources.search))
})

test('legacy continental graphs and preparations never mark countries as installed or downloading', () => {
  const regions: MapRegionDefinition[] = [
    { id: 'world', name: 'World', coverage: { bbox }, sources: {} },
    {
      id: 'south-america',
      parentId: 'world',
      name: 'South America',
      coverage: { bbox },
      sources: { routing: source('south-america') },
    },
    {
      id: 'brazil',
      parentId: 'south-america',
      name: 'Brazil',
      coverage: { bbox },
      sources: { routing: source('south-america/brazil') },
    },
    {
      id: 'sudeste',
      parentId: 'brazil',
      name: 'Sudeste',
      coverage: { bbox },
      sources: { routing: source('south-america/brazil/sudeste') },
    },
  ]
  const installed = (regionId: string) =>
    ({
      regionId,
      component: 'routing',
      source: source(regionId),
      coverage: { bbox },
      version: 'v1',
      name: regionId,
    }) as any
  assert.equal(
    regionProvider(regions[2], 'routing', regions, [installed('south-america')]),
    undefined
  )
  assert.equal(
    regionProvider(regions[1], 'routing', regions, [installed('south-america')]),
    undefined
  )
  assert.equal(
    pendingRegionProvider(regions[2], 'routing', regions, [
      {
        regionId: 'south-america',
        name: 'South America',
        component: 'routing',
        status: 'preparing',
      },
    ]),
    undefined
  )
  assert.equal(
    regionProvider(regions[3], 'routing', regions, [installed('brazil')])?.regionId,
    'brazil'
  )
})
