import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodePolyline6,
  formatValhallaRoute,
  validateOfflineRoute,
  validateRouteLocations,
} from '../../app/utils/offline_route.js'
import type { MapPackManifest } from '../../types/map_packs.js'

const pack = {
  schema_version: 1,
  id: 'rio',
  name: 'Rio',
  version: '1',
  coverage: { bbox: [-44, -24, -42, -22] },
  routing: {
    engine: 'valhalla',
    profiles: ['auto', 'pedestrian'],
    artifact: {
      url: 'https://example.org/routing.tar',
      filename: 'routing.tar',
      size_bytes: 1,
      sha256: '0'.repeat(64),
    },
  },
} satisfies MapPackManifest
const request = {
  packageId: 'rio',
  packageVersion: '1',
  profile: 'auto',
  locations: [
    { lat: -22.9, lon: -43.2 },
    { lat: -22.95, lon: -43.21 },
  ],
}

test('routes are bound to the currently active dataset and version', () => {
  assert.throws(() => validateOfflineRoute(request, null), /Activate/)
  assert.throws(
    () => validateOfflineRoute({ ...request, packageVersion: 'stale' }, pack),
    /changed/
  )
  assert.equal(validateOfflineRoute(request, pack).profile, 'auto')
})
test('rejects out-of-coverage, nonfinite, excess points, and unsupported modes', () => {
  assert.throws(
    () =>
      validateOfflineRoute(
        { ...request, locations: [{ lat: 45, lon: -73 }, request.locations[1]] },
        pack
      ),
    /coverage/
  )
  assert.throws(
    () =>
      validateOfflineRoute(
        { ...request, locations: [{ lat: Number.NaN, lon: -43 }, request.locations[1]] },
        pack
      ),
    /coordinates/
  )
  assert.throws(
    () =>
      validateOfflineRoute(
        {
          ...request,
          locations: Array.from({ length: 8 }, (_, i) => request.locations[i % 2]),
        },
        pack
      ),
    /2 to 7/
  )
  assert.throws(() => validateOfflineRoute({ ...request, profile: 'truck' }, pack), /mode/)
})
test('decodes polyline6 to GeoJSON longitude, latitude order', () => {
  assert.deepEqual(decodePolyline6('_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI'), [
    [-120.2, 38.5],
    [-120.95, 40.7],
    [-126.453, 43.252],
  ])
  assert.throws(() => decodePolyline6('_'), /Invalid/)
  assert.throws(() => decodePolyline6(''), /no road route/)
})
test('normalizes real engine units and rejects missing road geometry', () => {
  const result = formatValhallaRoute(
    {
      trip: {
        status: 0,
        summary: { length: 2.4, time: 350 },
        legs: [
          {
            summary: { length: 2.4, time: 350 },
            shape: '_izlhA~rlgdF_{geC~ywl@',
            maneuvers: [{ instruction: 'Vire à direita', length: 0.4, time: 20 }],
          },
        ],
      },
    },
    validateOfflineRoute(request, pack)
  )
  assert.equal(result.distanceMeters, 2400)
  assert.equal(result.maneuvers[0].distanceMeters, 400)
  assert.equal(result.durationSeconds, 350)
  assert.equal(result.legs.length, 1)
  assert.deepEqual(result.legs[0], {
    fromIndex: 0,
    toIndex: 1,
    distanceMeters: 2400,
    durationSeconds: 350,
    maneuvers: result.maneuvers,
  })
  assert.throws(
    () =>
      formatValhallaRoute({ trip: { status: 0, legs: [] } }, validateOfflineRoute(request, pack)),
    /No road route/
  )
})

test('ordered route stops allow seven points and validate every point', () => {
  const locations = [
    ...request.locations,
    { lat: -22.96, lon: -43.22 },
    { lat: -22.97, lon: -43.23 },
    { lat: -22.98, lon: -43.24 },
    { lat: -22.99, lon: -43.25 },
    { lat: -23, lon: -43.26 },
  ]
  assert.deepEqual(validateOfflineRoute({ ...request, locations }, pack).locations, locations)
  for (const invalid of [undefined, [], locations.slice(0, 1), [...locations, locations[0]]])
    assert.throws(() => validateRouteLocations(invalid), /2 to 7/)
  assert.throws(
    () =>
      validateOfflineRoute(
        { ...request, locations: [locations[0], { lat: 0, lon: 0 }, locations[3]] },
        pack
      ),
    /All points.*coverage/
  )
  assert.throws(
    () => validateRouteLocations([locations[0], { lat: false, lon: -43.2 }, locations[3]]),
    /coordinates/
  )
})

const stopShapes = ['~putj@~~ukqA~s`B~oR', '~ewwj@~oilqA~oR~oR', '~vjxj@~`}lqA~oR~oR']
const multiRequest = {
  ...request,
  profile: 'pedestrian' as const,
  locations: [...request.locations, { lat: -22.96, lon: -43.22 }, { lat: -22.97, lon: -43.23 }],
}
const multiTrip = () => ({
  status: 0,
  summary: { length: 6, time: 600 },
  legs: stopShapes.map((shape, index) => ({
    shape,
    summary: { length: index + 1, time: (index + 1) * 100 },
    maneuvers: [{ instruction: `Trecho ${index + 1}`, length: index + 1, time: (index + 1) * 100 }],
  })),
})

test('three route legs retain stop boundaries, summaries and all instructions', () => {
  const result = formatValhallaRoute(
    { trip: multiTrip() },
    validateOfflineRoute(multiRequest, pack)
  )
  assert.equal(result.profile, 'pedestrian')
  assert.equal(result.distanceMeters, 6000)
  assert.equal(result.durationSeconds, 600)
  assert.deepEqual(result.geometry.coordinates, [
    [-43.2, -22.9],
    [-43.21, -22.95],
    [-43.22, -22.96],
    [-43.23, -22.97],
  ])
  assert.deepEqual(
    result.legs.map((leg) => [leg.fromIndex, leg.toIndex]),
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ]
  )
  assert.deepEqual(
    result.legs.map((leg) => leg.distanceMeters),
    [1000, 2000, 3000]
  )
  assert.deepEqual(
    result.legs.map((leg) => leg.durationSeconds),
    [100, 200, 300]
  )
  assert.deepEqual(
    result.maneuvers,
    result.legs.flatMap((leg) => leg.maneuvers)
  )
})

test('missing route legs and invalid leg summaries cannot produce a partial journey', () => {
  const trip = multiTrip()
  assert.throws(
    () => formatValhallaRoute({ trip: { ...trip, legs: trip.legs.slice(0, 2) } }, multiRequest),
    /number of route legs/
  )
  for (const summary of [undefined, { length: -1, time: 1 }, { length: 1, time: Number.NaN }]) {
    assert.throws(
      () =>
        formatValhallaRoute(
          {
            trip: {
              ...trip,
              legs: trip.legs.map((leg, index) => (index === 1 ? { ...leg, summary } : leg)),
            },
          },
          multiRequest
        ),
      /route leg summary/
    )
  }
})
