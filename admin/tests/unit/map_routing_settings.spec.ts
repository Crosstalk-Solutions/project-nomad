import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MapRoutingSettingsService } from '../../app/services/map_routing_settings_service.js'
import { OfflineRouteService } from '../../app/services/offline_route_service.js'

async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'nomad-routing-settings-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return new MapRoutingSettingsService(root)
}
const regions = [{ id: 'regions:brazil', name: 'Brasil' }]

test('routing preference starts automatic, persists a fixed region and can return to automatic', async (t) => {
  const service = await fixture(t)
  assert.deepEqual(await service.state([]), { mode: 'automatic', available: true })
  assert.deepEqual(await service.save({ mode: 'fixed', regionId: 'regions:brazil' }, regions), {
    mode: 'fixed',
    regionId: 'regions:brazil',
    available: true,
    regionName: 'Brasil',
    message: undefined,
  })
  assert.deepEqual(JSON.parse(await readFile(service.filename, 'utf8')), {
    mode: 'fixed',
    regionId: 'regions:brazil',
  })
  await service.save({ mode: 'automatic' }, regions)
  assert.deepEqual(await service.read(), { mode: 'automatic' })
})

test('invalid or unavailable fixed preferences cannot replace the saved selection', async (t) => {
  const service = await fixture(t)
  await service.save({ mode: 'fixed', regionId: 'regions:brazil' }, regions)
  for (const input of [
    null,
    { mode: 'fixed', regionId: '../escape' },
    { mode: 'fixed', regionId: 'regions:missing' },
    { mode: 'automatic', packageVersion: 'old' },
    { mode: 'other' },
  ])
    await assert.rejects(service.save(input, regions))
  assert.deepEqual(await service.read(), { mode: 'fixed', regionId: 'regions:brazil' })
})

test('removed regions and corrupt preference files never silently select another region', async (t) => {
  const service = await fixture(t)
  await service.save({ mode: 'fixed', regionId: 'regions:brazil' }, regions)
  const state = await service.state([])
  assert.equal(state.available, false)
  assert.equal(state.mode, 'fixed')
  await writeFile(service.filename, '{broken')
  await assert.rejects(service.read(), /saved routing settings could not be read/)
  // An explicit save repairs the preference without deleting any map data.
  await service.save({ mode: 'automatic' }, [])
  assert.deepEqual(await service.read(), { mode: 'automatic' })
})

const graph = {
  id: 'regions:brazil',
  packageId: 'brazil',
  name: 'Brasil',
  version: 'v1',
  profiles: ['auto', 'pedestrian'] as ('auto' | 'pedestrian')[],
  namespace: 'regions' as const,
  territoryScope: 'country' as const,
  countryCodes: ['BR'],
  coverage: { bbox: [-74, -34, -34, 6] as [number, number, number, number] },
}
const trip = {
  automatic: true,
  profile: 'auto',
  locations: [
    { lat: -22.91, lon: -43.17 },
    { lat: -23.55, lon: -46.63 },
  ],
}

test('normal routes use the saved fixed region while an explicit request overrides it', async (t) => {
  const route = new OfflineRouteService()
  const pilot = { ...graph, id: 'packs:pilot', packageId: 'pilot', namespace: 'packs' as const }
  t.mock.method(route, 'inventory', async () => ({ regions: [graph, pilot], routerReady: true }))
  t.mock.method(MapRoutingSettingsService.prototype, 'read', async () => ({
    mode: 'fixed',
    regionId: 'packs:pilot',
  }))
  const called: string[] = []
  t.mock.method(route as any, 'calculate', async (request: any, namespace: string) => {
    called.push(namespace + ':' + request.packageId)
    return { packageId: request.packageId, packageVersion: request.packageVersion }
  })
  await route.route(trip)
  await route.route({ ...trip, regionId: 'regions:brazil' })
  assert.deepEqual(called, ['packs:pilot', 'regions:brazil'])
})

test('a missing saved graph returns conflict before invoking any installed graph', async (t) => {
  const route = new OfflineRouteService()
  t.mock.method(route, 'inventory', async () => ({ regions: [graph], routerReady: true }))
  t.mock.method(MapRoutingSettingsService.prototype, 'read', async () => ({
    mode: 'fixed',
    regionId: 'packs:removed',
  }))
  t.mock.method(route as any, 'calculate', async () => {
    throw new Error('No engine call expected')
  })
  await assert.rejects(
    route.route(trip),
    (error: any) => error.status === 409 && /fixed routing region/.test(error.message)
  )
})

test('explicit requests remain usable when the saved preference is corrupt', async (t) => {
  const route = new OfflineRouteService()
  t.mock.method(route, 'inventory', async () => ({ regions: [graph], routerReady: true }))
  t.mock.method(MapRoutingSettingsService.prototype, 'read', async () => {
    throw new Error('broken preference')
  })
  t.mock.method(route as any, 'calculate', async (request: any) => ({
    packageId: request.packageId,
    packageVersion: request.packageVersion,
  }))
  assert.equal((await route.route({ ...trip, regionId: 'regions:brazil' })).packageId, 'brazil')
})
