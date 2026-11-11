import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OfflineRouteService } from '../../app/services/offline_route_service.js'
import { routeInstructionsText } from '../../app/utils/map_route_points.js'
import { MapPackService } from '../../app/services/map_pack_service.js'
import { MapRegionService } from '../../app/services/map_region_service.js'

const graph = {
  id: 'regions:brazil',
  packageId: 'brazil',
  name: 'Brazil',
  version: 'installed-v1',
  profiles: ['auto', 'pedestrian'] as ('auto' | 'pedestrian')[],
  namespace: 'regions' as const,
  territoryScope: 'country' as const,
  countryCodes: ['BR'],
  coverage: { bbox: [-74, -34, -34, 6] as [number, number, number, number] },
}
const input = {
  automatic: true,
  profile: 'auto',
  regionId: 'regions:brazil',
  locations: [
    { lat: -22.91, lon: -43.17 },
    { lat: -23.55, lon: -46.63 },
  ],
}

test('import IDs do not imply geography and explicit single-country manifests remain routable', async (t) => {
  const item = (id: string, territory_scope?: string, country_codes?: string[]) =>
    ({
      id,
      name: id,
      version: 'v1',
      status: 'installed',
      coverage: { ...graph.coverage, territory_scope, country_codes },
      routing: { profiles: graph.profiles },
    }) as any
  t.mock.method(MapPackService.prototype, 'listInstalled', async () => [
    item('rio'),
    item('andorra', 'country', ['AD']),
    item('europe', 'multi_country', ['FR', 'DE']),
    item('brazil'),
    item('urban-pilot', 'subregion', ['BR']),
  ])
  t.mock.method(
    MapRegionService.prototype,
    'listInstalledComponents',
    async () =>
      [
        { regionId: 'brazil', name: 'Brazil', version: 'v1', coverage: graph.coverage },
        {
          regionId: 'south-america',
          name: 'South America',
          version: 'v1',
          coverage: graph.coverage,
        },
      ] as any
  )
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ready: true }))
  const inventory = await new OfflineRouteService().inventory()
  assert.deepEqual(
    inventory.regions.map((region) => region.id),
    ['packs:andorra', 'packs:urban-pilot', 'regions:brazil']
  )
  assert.deepEqual(
    inventory.regions.find((region) => region.id === 'regions:brazil')?.countryCodes,
    ['BR']
  )
})

test('a legacy continental graph cannot route a cross-country journey or be selected explicitly', async (t) => {
  const service = new OfflineRouteService()
  const continent = {
    ...graph,
    id: 'regions:south-america',
    packageId: 'south-america',
    coverage: { bbox: [-85, -57, -33, 12] as [number, number, number, number] },
  }
  const argentina = {
    ...graph,
    id: 'regions:argentina',
    packageId: 'argentina',
    coverage: { bbox: [-74, -56, -53, -22] as [number, number, number, number] },
  }
  t.mock.method(service, 'inventory', async () => ({
    regions: [graph, argentina, continent],
    routerReady: true,
  }))
  t.mock.method(service as any, 'calculate', async () => {
    throw new Error('No graph may merge country journeys')
  })
  await assert.rejects(
    service.route({ ...input, regionId: 'regions:south-america' }),
    /Continental and multi-country/
  )
  await assert.rejects(
    service.route({
      ...input,
      regionId: undefined,
      locations: [input.locations[0], { lat: -34.6, lon: -58.38 }],
    }),
    (error: any) => error.code === 'OUTSIDE_COVERAGE' && /not joined/.test(error.message)
  )
})
test('an automatic route never silently substitutes a missing region or pinned version', async (t) => {
  const service = new OfflineRouteService()
  t.mock.method(service, 'inventory', async () => ({ regions: [graph], routerReady: true }))
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('No engine call expected')
  })
  await assert.rejects(service.route({ ...input, packageVersion: 'old-v0' }), /not installed/)
  await assert.rejects(service.route({ ...input, regionId: 'regions:missing' }), /not installed/)
  await assert.rejects(
    service.route({ ...input, regionId: undefined, packageVersion: 'installed-v1' }),
    /pin requires/
  )
})
test('official graphs are preferred automatically while an explicit legacy graph remains selectable', async (t) => {
  const service = new OfflineRouteService()
  const legacy = {
    ...graph,
    id: 'packs:pilot',
    packageId: 'pilot',
    namespace: 'packs' as const,
    version: 'Pilot-v1',
    coverage: { bbox: [-47, -24, -42, -22] as [number, number, number, number] },
  }
  t.mock.method(service, 'inventory', async () => ({ regions: [legacy, graph], routerReady: true }))
  const called: string[] = []
  // Isolate graph selection from the actual navigation process.
  t.mock.method(service as any, 'calculate', async (request: any, namespace: string) => {
    called.push(namespace + ':' + request.packageId)
    return { packageId: request.packageId, packageVersion: request.packageVersion }
  })
  await service.route({ ...input, regionId: undefined })
  await service.route({ ...input, regionId: 'packs:pilot', packageVersion: 'Pilot-v1' })
  assert.deepEqual(called, ['regions:brazil', 'packs:pilot'])
})

test('automatic routing requires one graph covering every ordered stop', async (t) => {
  const service = new OfflineRouteService()
  t.mock.method(service, 'inventory', async () => ({ regions: [graph], routerReady: true }))
  const calls: { lat: number; lon: number }[][] = []
  t.mock.method(service as any, 'calculate', async (request: any) => {
    calls.push(request.locations)
    return { packageId: request.packageId, packageVersion: request.packageVersion }
  })
  const locations = [
    input.locations[0],
    { lat: -22.95, lon: -43.22 },
    { lat: -23, lon: -43.3 },
    { lat: -23.1, lon: -44 },
    { lat: -23.2, lon: -45 },
    { lat: -23.4, lon: -46 },
    input.locations[1],
  ]
  await service.route({ ...input, locations })
  assert.deepEqual(calls, [locations])
  await assert.rejects(
    service.route({ ...input, locations: [locations[0], { lat: 45, lon: -73 }, locations[3]] }),
    /covering the whole journey/
  )
  assert.equal(calls.length, 1)
  for (const invalid of [[], locations.slice(0, 1), [...locations, locations[0]]])
    await assert.rejects(service.route({ ...input, locations: invalid }), /2 to 7/)
})

test('car and walking instructions request English and preserve street names in the text export', async (t) => {
  const service = new OfflineRouteService()
  t.mock.method(service, 'inventory', async () => ({ regions: [graph], routerReady: true }))
  const previous = process.env.MAP_ROUTER_URL
  process.env.MAP_ROUTER_URL = 'http://offline-test-router'
  t.after(() => {
    if (previous === undefined) delete process.env.MAP_ROUTER_URL
    else process.env.MAP_ROUTER_URL = previous
  })
  const seen: string[] = []
  const instruction = 'Walk northwest on Rua da Estação.'
  t.mock.method(globalThis, 'fetch', async (_url: any, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body))
    assert.equal(payload.request.language, 'en-US')
    seen.push(payload.request.costing)
    return Response.json({
      trip: {
        status: 0,
        summary: { length: 0.018, time: 15 },
        legs: [
          {
            shape: '_izlhA~rlgdF_{geC~ywl@',
            summary: { length: 0.018, time: 15 },
            maneuvers: [{ instruction, length: 0.018, time: 15 }],
          },
        ],
      },
    })
  })
  for (const profile of ['auto', 'pedestrian'] as const) {
    const result = await service.route({ ...input, profile })
    assert.equal(result.legs[0].maneuvers[0].instruction, instruction)
    const text = routeInstructionsText(
      result,
      input.locations.map((point, index) => ({
        id: String(index),
        value: `${point.lat}, ${point.lon}`,
      }))
    )
    assert.ok(text.includes(instruction))
    assert.ok(text.includes('Rua da Estação'))
    assert.ok(!text.includes('Caminhe'))
  }
  assert.deepEqual(seen, ['auto', 'pedestrian'])
})
