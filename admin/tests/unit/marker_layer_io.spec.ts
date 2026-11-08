import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildPinFile,
  CURRENT_FORMAT_VERSION,
  dedupeForMerge,
  exportFilename,
  MAX_IMPORT_LAYERS,
  MAX_IMPORT_MARKERS,
  parsePinFile,
  type PinRecord,
  remapRouteIds,
  summarizeMarkers,
  uniqueLayerName,
} from '../../app/utils/marker_layer_io.js'

// Map pin layer export/import (#1387).

function pin(overrides: Partial<PinRecord> = {}): PinRecord {
  return {
    name: 'Spring',
    latitude: 38.573936,
    longitude: -109.549839,
    color: 'blue',
    custom_color: '#2563eb',
    icon: 'star',
    icon_color: '#ffffff',
    visible: true,
    marker_type: 'pin',
    route_id: null,
    route_order: null,
    notes: 'Filter before drinking',
    ...overrides,
  }
}

function file(layers: unknown, extra: Record<string, unknown> = {}) {
  return { format: 'nomad-map-pins', format_version: CURRENT_FORMAT_VERSION, layers, ...extra }
}

test('export then parse returns every field unchanged', () => {
  const markers = [
    pin(),
    pin({ name: 'Trailhead', latitude: -33.8688197, longitude: 151.2092955, visible: false }),
    pin({ name: 'Leg 1', marker_type: 'waypoint', route_id: 'r1', route_order: 0, notes: null }),
  ]
  const exported = buildPinFile([{ name: 'Water sources', visible: false, markers }], '1.35.1')
  const parsed = parsePinFile(JSON.parse(JSON.stringify(exported)))
  assert.ok(parsed.ok)
  assert.equal(parsed.layers[0].name, 'Water sources')
  assert.equal(parsed.layers[0].visible, false)
  assert.deepEqual(parsed.layers[0].markers, markers)
})

test('rejects files that are not NOMAD pin files', () => {
  assert.equal(parsePinFile(null).ok, false)
  assert.equal(parsePinFile([]).ok, false)
  assert.equal(parsePinFile({ format: 'geojson', format_version: 1, layers: [] }).ok, false)
})

test('rejects a file from a newer NOMAD with a clear message', () => {
  const result = parsePinFile(file([{ name: 'A', markers: [] }], { format_version: 99 }))
  assert.equal(result.ok, false)
  assert.match(!result.ok ? result.errors[0] : '', /newer version/)
  assert.equal(parsePinFile(file([{ name: 'A', markers: [] }], { format_version: 1.5 })).ok, false)
})

test('rejects missing, empty or oversized layer lists', () => {
  assert.equal(parsePinFile(file('nope')).ok, false)
  assert.equal(parsePinFile(file([])).ok, false)
  const tooMany = Array.from({ length: MAX_IMPORT_LAYERS + 1 }, (_, i) => ({ name: `L${i}`, markers: [] }))
  assert.equal(parsePinFile(file(tooMany)).ok, false)
  const tooManyPins = [{ name: 'A', markers: Array.from({ length: MAX_IMPORT_MARKERS + 1 }, () => pin()) }]
  assert.equal(parsePinFile(file(tooManyPins)).ok, false)
})

test('rejects the whole file when any pin is invalid', () => {
  const bad = [
    { latitude: 91 },
    { longitude: -181 },
    { latitude: '38.5' },
    { latitude: Number.POSITIVE_INFINITY },
    { name: '' },
    { name: 'x'.repeat(256) },
    { notes: 'x'.repeat(501) },
    { route_order: -1 },
    { route_order: 1.5 },
    { route_id: 'x'.repeat(65) },
    { marker_type: 'x'.repeat(21) },
  ]
  for (const overrides of bad) {
    const result = parsePinFile(file([{ name: 'A', markers: [pin(), { ...pin(), ...overrides }] }]))
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(overrides).slice(0, 60)}`)
    if (!result.ok) assert.match(result.errors[0], /layers\[0\]\.markers\[1\]/)
  }
})

test('rejects an invalid layer name', () => {
  assert.equal(parsePinFile(file([{ name: '   ', markers: [] }])).ok, false)
  assert.equal(parsePinFile(file([{ name: 'x'.repeat(101), markers: [] }])).ok, false)
})

test('drops unknown keys and ignores __proto__', () => {
  const raw = JSON.parse(
    `{"format":"nomad-map-pins","format_version":1,"layers":[{"name":"A","markers":[` +
      `{"name":"P","latitude":1,"longitude":2,"id":7,"layer_id":3,"__proto__":{"polluted":true}}]}]}`
  )
  const result = parsePinFile(raw)
  assert.ok(result.ok)
  const marker = result.layers[0].markers[0] as unknown as Record<string, unknown>
  assert.equal(marker.id, undefined)
  assert.equal(marker.layer_id, undefined)
  assert.equal(({} as Record<string, unknown>).polluted, undefined)
  assert.equal(marker.polluted, undefined)
})

test('coerces bad style colours to null and fills defaults', () => {
  const result = parsePinFile(
    file([{ name: 'A', markers: [{ name: 'P', latitude: 0, longitude: 0, custom_color: 'red', icon_color: '#12345' }] }])
  )
  assert.ok(result.ok)
  const marker = result.layers[0].markers[0]
  assert.equal(marker.custom_color, null)
  assert.equal(marker.icon_color, null)
  assert.equal(marker.color, 'orange')
  assert.equal(marker.marker_type, 'pin')
  assert.equal(marker.visible, true)
})

test('remapRouteIds gives each route a new id and keeps order', () => {
  let n = 0
  const layers = remapRouteIds(
    [
      {
        name: 'A',
        visible: true,
        markers: [
          pin({ route_id: 'old', route_order: 0 }),
          pin({ route_id: 'old', route_order: 1 }),
          pin({ route_id: 'other', route_order: 0 }),
          pin(),
        ],
      },
      { name: 'B', visible: true, markers: [pin({ route_id: 'old', route_order: 0 })] },
    ],
    () => `new-${++n}`
  )
  const a = layers[0].markers
  assert.equal(a[0].route_id, a[1].route_id)
  assert.notEqual(a[0].route_id, 'old')
  assert.notEqual(a[2].route_id, a[0].route_id)
  assert.equal(a[3].route_id, null)
  assert.deepEqual(a.map((m) => m.route_order), [0, 1, 0, null])
  // The same old id in a different layer is a different route.
  assert.notEqual(layers[1].markers[0].route_id, a[0].route_id)
})

test('dedupeForMerge skips exact duplicates only', () => {
  const existing = [pin(), pin({ name: 'Camp', latitude: 1, longitude: 2 })]
  const incoming = [pin(), pin({ latitude: 38.5739361 }), pin({ name: 'Spring 2' })]
  const { kept, skipped } = dedupeForMerge(existing, incoming)
  assert.equal(skipped, 1)
  assert.equal(kept.length, 2)
})

test('importing the same file twice skips everything, including routes', () => {
  const markers = [
    pin(),
    pin({ name: 'Leg 1', route_id: 'a', route_order: 0 }),
    pin({ name: 'Leg 2', route_id: 'a', route_order: 1 }),
  ]
  const reimport = markers.map((m) => (m.route_id ? { ...m, route_id: 'fresh' } : m))
  assert.deepEqual(dedupeForMerge(markers, reimport), { kept: [], skipped: 3 })
})

test('a route is kept whole when only some of its points match', () => {
  const existing = [pin({ name: 'Leg 1', route_id: 'a', route_order: 0 })]
  const incoming = [
    pin({ name: 'Leg 1', route_id: 'b', route_order: 0 }),
    pin({ name: 'Leg 2', route_id: 'b', route_order: 1 }),
  ]
  const { kept, skipped } = dedupeForMerge(existing, incoming)
  assert.equal(skipped, 0)
  assert.equal(kept.length, 2)
})

test('summarizeMarkers counts pins and distinct routes', () => {
  assert.deepEqual(
    summarizeMarkers([pin(), pin({ route_id: 'a' }), pin({ route_id: 'a' }), pin({ route_id: 'b' })]),
    { pins: 4, routes: 2 }
  )
})

test('uniqueLayerName adds a suffix when a name is taken', () => {
  assert.equal(uniqueLayerName('Rally points', ['My Pins']), 'Rally points')
  assert.equal(uniqueLayerName('Rally points', ['rally points']), 'Rally points (2)')
  assert.equal(uniqueLayerName('A', ['A', 'A (2)']), 'A (3)')
  assert.ok(uniqueLayerName('x'.repeat(100), ['x'.repeat(100)]).length <= 100)
})

test('exportFilename is header-safe', () => {
  const date = new Date('2026-11-08T12:00:00Z')
  assert.equal(exportFilename('Trip: Moab 2026', date), 'nomad-pins-trip-moab-2026-20261108.json')
  assert.equal(exportFilename('"\r\n;', date), 'nomad-pins-layer-20261108.json')
})
