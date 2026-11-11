import { test } from 'node:test'
import assert from 'node:assert/strict'
import maplibregl from 'maplibre-gl'
import {
  classifyOmniboxQuery,
  coordinateOmniboxPlace,
  parseBrowserMapBase,
  resolvedRouteInput,
  unresolvedRouteInput,
  normalizedMapBounds,
  normalizeMapEventPoint,
  mapFramingBounds,
  type OmniboxPlace,
} from '../../app/utils/map_omnibox.js'
import { formatMapPoint, parseMapPoint } from '../../app/utils/map_route_link.js'

const pin: OmniboxPlace = {
  id: 'pin:1',
  label: 'My saved shelter',
  lat: -22.9,
  lon: -43.2,
  kind: 'pin',
  precision: 'saved point',
  source: 'Saved pin',
  regionId: 'pins',
}

test('coordinate entry works without lookup data and rejects malformed numbers', () => {
  assert.equal(classifyOmniboxQuery('-22.9068, -43.1729'), 'coordinates')
  assert.equal(coordinateOmniboxPlace('91, 0'), null)
  assert.equal(coordinateOmniboxPlace('0, -181'), null)
  for (const query of ['91, 0', '0, -181', '1,', '1,2,3'])
    assert.equal(classifyOmniboxQuery(query), 'invalid-coordinates')
  assert.equal(coordinateOmniboxPlace('São Paulo'), null)
  assert.equal(coordinateOmniboxPlace('-22.9, -43.2')?.label, '-22.900000, -43.200000')
  assert.equal(classifyOmniboxQuery('  '), 'empty')
})

test('framing a valid polar route point does not pass an invalid latitude to MapLibre', () => {
  for (const latitude of [-90, 90]) {
    const place = coordinateOmniboxPlace(`${latitude}, 0`)
    assert.ok(place)
    const unbounded = () =>
      new maplibregl.LngLatBounds([-0.008, place.lat - 0.008], [0.008, place.lat + 0.008])
    assert.throws(unbounded, /Invalid LngLat latitude value/)
    const frame = mapFramingBounds([-0.008, place.lat - 0.008, 0.008, place.lat + 0.008])
    assert.ok(frame)
    const [west, south, east, north] = frame
    assert.doesNotThrow(() => new maplibregl.LngLatBounds([west, south], [east, north]))
    assert.ok(Math.abs(south) < 86 && Math.abs(north) < 86)
    assert.equal(parseMapPoint(resolvedRouteInput(place).value)?.lat, latitude)
  }
  assert.deepEqual(mapFramingBounds([-49, -24, -45, -21]), [-49, -24, -45, -21])
})

test('map clicks in repeated world copies format coordinates accepted by the strict parser', () => {
  for (const [raw, expected] of [[-406, -46], [201.5, -158.5], [180, 180]]) {
    const point = normalizeMapEventPoint({ lat: -23.5, lon: raw })
    assert.deepEqual(parseMapPoint(formatMapPoint(point)), { lat: -23.5, lon: expected })
  }
  assert.equal(parseMapPoint('-23.5, -406'), null)
})

test('coordinate input never resolves postal codes, street names or typed saved-pin labels', () => {
  for (const value of [
    '01310-100',
    '01310100',
    '90210',
    'SW1A 1AA',
    'M5V 3L9',
    'Rua das Flores, 100',
    'Rua100',
    'Hospital Municipal',
    pin.label,
  ]) {
    assert.equal(classifyOmniboxQuery(value), 'unsupported', value)
    assert.equal(coordinateOmniboxPlace(value), null, value)
    assert.equal(unresolvedRouteInput(value).value, '', value)
  }
})

test('saved pins still resolve to coordinates and editing clears the resolved point immediately', () => {
  const selected = resolvedRouteInput(pin)
  assert.equal(selected.value, '-22.900000, -43.200000')
  assert.equal(selected.query, pin.label)
  assert.equal(selected.precision, 'saved point')
  assert.equal(selected.source, 'Saved pin')
  const changed = { ...selected, ...unresolvedRouteInput('unfinished point') }
  assert.equal(changed.value, '')
  assert.equal(changed.label, undefined)
  assert.equal(changed.precision, undefined)
  assert.equal(unresolvedRouteInput('0,0').value, '0.000000, 0.000000')
})

test('browser-local Base data rejects malformed or out-of-bounds stored values', () => {
  for (const raw of [
    null,
    'not json',
    '{}',
    '{"lat":91,"lon":0,"label":"Base"}',
    '{"lat":0,"lon":"1","label":"Base"}',
    '{"lat":0,"lon":1,"label":" "}',
  ])
    assert.equal(parseBrowserMapBase(raw), null)
  assert.deepEqual(parseBrowserMapBase('{"lat":0,"lon":0,"label":" Base "}'), {
    lat: 0,
    lon: 0,
    label: 'Base',
  })
})

test('map view bounds retain antimeridian coverage for coordinate navigation', () => {
  assert.deepEqual(normalizedMapBounds([170, -20, 195, 30]), [170, -20, -165, 30])
  assert.deepEqual(normalizedMapBounds([-400, -100, 400, 100]), [-180, -90, 180, 90])
  assert.equal(normalizedMapBounds([1, 30, 2, -20]), undefined)
  assert.equal(normalizedMapBounds([NaN, 0, 2, 3]), undefined)
})

test('saved Base recalls its coordinates without changing its label or requiring a country', () => {
  const base = parseBrowserMapBase('{"lat":-23.55,"lon":-46.63,"label":"Emergency Base"}')!
  const location = coordinateOmniboxPlace(`${base.lat}, ${base.lon}`)!
  const selected = resolvedRouteInput({
    ...location,
    label: base.label,
    precision: 'saved point',
    source: 'Base in this browser',
  })
  assert.equal(selected.value, '-23.550000, -46.630000')
  assert.equal(selected.query, 'Emergency Base')
  assert.equal(selected.source, 'Base in this browser')
  assert.equal(base.label, 'Emergency Base')
})
