import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  crossesAntimeridian,
  findRegionByLabel,
  latToTileY,
  lngRangeFromOccupiedColumns,
  parseLatLng,
} from '../../inertia/lib/map_jump.js'

const regions = [
  { file: 'ba_20261107_z15.pmtiles', label: 'Bosnia and Herzegovina', url: '/pmtiles/ba.pmtiles' },
  { file: 'new_york_2025-12.pmtiles', label: 'New York', url: '/pmtiles/new_york.pmtiles' },
]

test('parseLatLng accepts "lat,lng" with spaces and rejects everything else', () => {
  assert.deepEqual(parseLatLng(' 43.856 , 18.413 '), { lat: 43.856, lng: 18.413 })
  assert.equal(parseLatLng('Bosnia'), null)
  assert.equal(parseLatLng('43.8'), null)
  assert.equal(parseLatLng('43.8,'), null)
  assert.equal(parseLatLng('1,2,3'), null)
  assert.equal(parseLatLng('91,0'), null)
  assert.equal(parseLatLng('0,181'), null)
})

test('findRegionByLabel matches whole labels only, ignoring case and spaces', () => {
  assert.equal(findRegionByLabel('new york', regions)?.file, 'new_york_2025-12.pmtiles')
  assert.equal(
    findRegionByLabel('  Bosnia and Herzegovina ', regions)?.file,
    'ba_20261107_z15.pmtiles'
  )
  // A prefix is still being typed: no jump yet.
  assert.equal(findRegionByLabel('Bosnia', regions), null)
  assert.equal(findRegionByLabel('', regions), null)
})

test('crossesAntimeridian flags header bounds that wrap the whole world', () => {
  assert.equal(crossesAntimeridian({ west: -180, south: 51, east: 180, north: 72 }), true)
  assert.equal(crossesAntimeridian({ west: 15.6, south: 42.4, east: 19.7, north: 45.4 }), false)
})

/** Occupied-columns array of length n with data in the given column indexes. */
function columns(n: number, withData: number[]): boolean[] {
  return Array.from({ length: n }, (_, i) => withData.includes(i))
}

test('lngRangeFromOccupiedColumns frames an ordinary region by its columns', () => {
  // 8 columns of 45°: data in columns 4 and 5 = 0°..90°
  assert.deepEqual(lngRangeFromOccupiedColumns(columns(8, [4, 5])), { west: 0, east: 90 })
})

test('lngRangeFromOccupiedColumns frames an antimeridian region across the date line', () => {
  // Fiji-like at 64 columns of 5.625°: data in the last column (174.375°..180°) and the
  // first (-180°..-174.375°). Expect 174.375° east to 185.625° (= -174.375°).
  assert.deepEqual(lngRangeFromOccupiedColumns(columns(64, [63, 0])), {
    west: 174.375,
    east: 185.625,
  })
})

test('lngRangeFromOccupiedColumns picks the largest gap when there are several', () => {
  // Alaska-like at 8 columns: mainland in column 1 (-135..-90), Aleutians reaching column 7.
  // Gaps: columns 2..6 (5 wide). Data runs from column 7 across the date line to column 1.
  assert.deepEqual(lngRangeFromOccupiedColumns(columns(8, [1, 7, 0])), { west: 135, east: 270 })
})

test('lngRangeFromOccupiedColumns handles no data and global data', () => {
  assert.equal(lngRangeFromOccupiedColumns(columns(8, [])), null)
  assert.deepEqual(lngRangeFromOccupiedColumns(columns(4, [0, 1, 2, 3])), { west: -180, east: 180 })
})

test('latToTileY maps latitudes to web-mercator rows', () => {
  assert.equal(latToTileY(85, 1), 0)
  assert.equal(latToTileY(-85, 1), 1)
  assert.equal(latToTileY(43.856, 14), 5966) // Sarajevo
  assert.equal(latToTileY(90, 3), 0) // clamped
})
