import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OfflineRouteService } from '../../app/services/offline_route_service.js'
import OfflineRoutesController from '../../app/controllers/offline_routes_controller.js'
import { OfflineRouteError, offlineRouteEngineError } from '../../app/utils/offline_route.js'

const graph = {
  id: 'regions:brazil',
  packageId: 'brazil',
  name: 'Brazil',
  version: 'v1',
  profiles: ['auto', 'pedestrian'] as ('auto' | 'pedestrian')[],
  namespace: 'regions' as const,
  territoryScope: 'country' as const,
  countryCodes: ['BR'],
  coverage: { bbox: [-74, -34, -34, 6] as [number, number, number, number] },
}
const request = {
  automatic: true,
  regionId: 'regions:brazil',
  profile: 'pedestrian',
  locations: [
    { lat: -22.9068, lon: -43.1729 },
    { lat: -23.5505, lon: -46.6333 },
  ],
}

test('the reproduced 250 km walking rejection preserves its cause and never suggests missing coverage', () => {
  const error = offlineRouteEngineError(
    400,
    {
      engine: {
        error_code: 154,
        error: 'Path distance exceeds the max distance limit: 250000 meters',
      },
    },
    'pedestrian'
  )
  assert.equal(error.status, 422)
  assert.equal(error.code, 'DISTANCE_LIMIT_EXCEEDED')
  assert.equal(error.engineCode, 154)
  assert.equal(error.distanceLimitMeters, 250000)
  assert.match(error.message, /walking.*250 km/)
  assert.doesNotMatch(error.message, /[Ii]nstall|cover/)
})

test('path connectivity, point snapping, engine rejection and temporary service failure stay distinct', () => {
  for (const [engineCode, code] of [
    [170, 'UNCONNECTED_POINTS'],
    [171, 'NO_ROUTABLE_EDGE'],
    [442, 'NO_PATH'],
  ] as const) {
    const error = offlineRouteEngineError(400, { engine: { error_code: engineCode } }, 'pedestrian')
    assert.equal(error.code, code)
    assert.equal(error.engineCode, engineCode)
    assert.match(error.message, /walking/)
    assert.doesNotMatch(error.message, /[Ii]nstall/)
  }
  assert.equal(
    offlineRouteEngineError(
      400,
      { engine: { error_code: 199, error: 'private internal detail' } },
      'auto'
    ).code,
    'ENGINE_REJECTED'
  )
  assert.doesNotMatch(
    offlineRouteEngineError(400, { message: 'arbitrary upstream details' }, 'auto').message,
    /arbitrary/
  )
  assert.equal(offlineRouteEngineError(503, { code: 'ENGINE_BUSY' }, 'auto').code, 'ENGINE_BUSY')
  assert.equal(
    offlineRouteEngineError(504, { code: 'ENGINE_TIMEOUT' }, 'auto').code,
    'ENGINE_TIMEOUT'
  )
  assert.equal(offlineRouteEngineError(503, {}, 'auto').code, 'ENGINE_UNAVAILABLE')
})

test('a distance limit stops automatic graph attempts and retains the engine code', async (t) => {
  const service = new OfflineRouteService()
  t.mock.method(service, 'inventory', async () => ({
    regions: [graph, { ...graph, id: 'regions:larger' }],
    routerReady: true,
  }))
  const previous = process.env.MAP_ROUTER_URL
  process.env.MAP_ROUTER_URL = 'http://offline-test-router'
  t.after(() => {
    if (previous === undefined) delete process.env.MAP_ROUTER_URL
    else process.env.MAP_ROUTER_URL = previous
  })
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return Response.json(
      {
        engine: {
          error_code: 154,
          error: 'Path distance exceeds the max distance limit: 250000 meters',
        },
      },
      { status: 400 }
    )
  })
  await assert.rejects(
    service.route({ ...request, regionId: undefined }),
    (error: unknown) =>
      error instanceof OfflineRouteError &&
      error.code === 'DISTANCE_LIMIT_EXCEEDED' &&
      error.engineCode === 154
  )
  assert.equal(calls, 1)
})

test('only genuine path/access errors try another covering graph', async (t) => {
  const service = new OfflineRouteService()
  const second = { ...graph, id: 'regions:larger', packageId: 'larger' }
  t.mock.method(service, 'inventory', async () => ({ regions: [graph, second], routerReady: true }))
  const calls: string[] = []
  t.mock.method(service as any, 'calculate', async (value: any) => {
    calls.push(value.packageId)
    if (value.packageId === graph.packageId)
      throw new OfflineRouteError('No walking path in this graph.', 422, 'NO_PATH', 442)
    return { packageId: value.packageId }
  })
  const result = await service.route({ ...request, regionId: undefined })
  assert.equal(result.packageId, 'larger')
  assert.deepEqual(calls, ['brazil', 'larger'])
})

test('coverage absence and exhausted path attempts do not share the same message', async (t) => {
  const service = new OfflineRouteService()
  t.mock.method(service, 'inventory', async () => ({ regions: [graph], routerReady: true }))
  const pathError = new OfflineRouteError(
    'No connected walking route was found in this graph.',
    422,
    'NO_PATH',
    442
  )
  t.mock.method(service as any, 'calculate', async () => {
    throw pathError
  })
  await assert.rejects(service.route(request), (error: unknown) => error === pathError)
  await assert.rejects(
    service.route({ ...request, locations: [request.locations[0], { lat: 45, lon: -73 }] }),
    (error: unknown) =>
      error instanceof OfflineRouteError &&
      error.code === 'OUTSIDE_COVERAGE' &&
      /[Ii]nstall/.test(error.message)
  )
})

test('a fetch timeout cannot become a no-path error or silently switch travel mode', async (t) => {
  const service = new OfflineRouteService()
  t.mock.method(service, 'inventory', async () => ({ regions: [graph], routerReady: true }))
  const previous = process.env.MAP_ROUTER_URL
  process.env.MAP_ROUTER_URL = 'http://offline-test-router'
  t.after(() => {
    if (previous === undefined) delete process.env.MAP_ROUTER_URL
    else process.env.MAP_ROUTER_URL = previous
  })
  t.mock.method(globalThis, 'fetch', async () => {
    throw new DOMException('deadline', 'TimeoutError')
  })
  await assert.rejects(
    service.route(request),
    (error: unknown) =>
      error instanceof OfflineRouteError && error.code === 'ENGINE_TIMEOUT' && error.status === 504
  )
})

test('the local API exposes a stable error code and known distance limit with the existing message', async (t) => {
  t.mock.method(OfflineRouteService.prototype, 'route', async () => {
    throw new OfflineRouteError(
      'Walking limit: 250 km.',
      422,
      'DISTANCE_LIMIT_EXCEEDED',
      154,
      250000
    )
  })
  let status = 0
  let body: unknown
  const response = {
    status(value: number) {
      status = value
      return this
    },
    send(value: unknown) {
      body = value
      return value
    },
  }
  await new OfflineRoutesController().route({ request: { body: () => request }, response } as any)
  assert.equal(status, 422)
  assert.deepEqual(body, {
    message: 'Walking limit: 250 km.',
    code: 'DISTANCE_LIMIT_EXCEEDED',
    engineCode: 154,
    distanceLimitMeters: 250000,
  })
})
