import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { StyleSpecification } from 'maplibre-gl'
import { isLocalDetailCoordinate, localDetailBounds, localDetailColumn, localDetailId, localDetailLabel,
  type LocalDetailCell } from '../../types/local_detail.js'
import { withLocalDetail, localDetailInView } from '../../inertia/components/maps/localDetailStyles.js'
import { hasCoverage, localArchiveUrl, readOfflineLayers, styleWithOfflineLayer } from '../../inertia/components/maps/mapLayerStyles.js'

Object.defineProperty(globalThis, 'window', { value: { location: { origin: 'http://localhost:8082' } }, configurable: true })
const cell: LocalDetailCell = {
  x: 41, y: 93, id: '8/41/93', label: 'AP94', status: 'ready', bounds: localDetailBounds({ x: 41, y: 93 }),
  archives: (['satellite', 'topography', 'elevation', 'street'] as const).map((role) => ({
    role, filename: `partial-z8-41-93-${role}.pmtiles`, installedBytes: 1000, sha256: role.padEnd(64, 'a'),
    bounds: localDetailBounds({ x: 41, y: 93 }), minzoom: 0, maxzoom: role === 'street' ? 15 : 12,
    attribution: 'Public source', tileSize: 512, format: role === 'street' || role === 'topography' ? 'mvt' : 'webp',
    ...(role === 'topography' ? { sourceLayer: 'hillshade-vectors' } : {}),
    ...(role === 'elevation' ? { encoding: 'terrarium' } : {}),
  })),
}
const base: StyleSpecification = { version: 8, sources: { world: { type: 'vector', url: 'pmtiles://http://localhost:8082/pmtiles/world.pmtiles' } },
  layers: [{ id: 'background', type: 'background' }, { id: 'earth-world', type: 'fill', source: 'world', 'source-layer': 'earth' },
    { id: 'water-world', type: 'fill', source: 'world', 'source-layer': 'water' },
    { id: 'roads-world', type: 'line', source: 'world', 'source-layer': 'roads', filter: ['==', ['get', 'kind'], 'highway'],
      paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 15, 5] } }],
}

test('grid IDs are fixed worldwide and invalid coordinates cannot escape the catalog', () => {
  assert.equal(localDetailColumn(0), 'A'); assert.equal(localDetailColumn(255), 'IV')
  assert.equal(localDetailLabel({ x: 41, y: 93 }), 'AP94'); assert.equal(localDetailId(cell), '8/41/93')
  for (const bad of [null, { x: -1, y: 0 }, { x: 256, y: 0 }, { x: '41', y: 93 }, { x: 41.5, y: 93 }, { x: NaN, y: 3 }]) assert.equal(isLocalDetailCoordinate(bad), false)
  assert.ok(isLocalDetailCoordinate({ x: 0, y: 255 }))
  assert.equal(localDetailBounds({ x: 0, y: 0 })[0], -180)
  assert.equal(localDetailBounds({ x: 255, y: 255 })[2], 180)
})

test('regional composition is opt-in and never mutates or replaces the world source', () => {
  assert.equal(withLocalDetail(base, []), base)
  const before = JSON.stringify(base), style = withLocalDetail(base, [cell])
  assert.equal(JSON.stringify(base), before); assert.deepEqual(style.sources.world, base.sources.world)
  assert.deepEqual(style.layers.slice(0, base.layers.length), base.layers)
  assert.equal(new Set(style.layers.map(({ id }) => id)).size, style.layers.length)
  assert.match(localArchiveUrl(cell.archives[0]), /\/local-detail\/pmtiles\/partial-z8-/)
  assert.equal((style.sources['local-detail-41-93-street'] as { maxzoom: number }).maxzoom, 15)
  const roads = style.layers.find(({ id }) => id === 'roads-world-local-detail-41-93')!
  assert.deepEqual('filter' in roads && roads.filter, 'filter' in base.layers[3] && base.layers[3].filter)
})

test('local imagery overzooms only in its coverage and uses the neutral topography road composition', () => {
  const style = withLocalDetail(base, [cell]), layers = readOfflineLayers(style)
  assert.equal(layers.aerial.length, 1); assert.equal(layers.topographic.length, 4)
  const [west, south, east, north] = cell.bounds
  assert.equal(hasCoverage(layers.aerial[0], { longitude: (west + east) / 2, latitude: (south + north) / 2, zoom: 17 }), true)
  assert.equal(hasCoverage(layers.aerial[0], { longitude: 30, latitude: 30, zoom: 12 }), false)
  const topo = styleWithOfflineLayer(style, 'topographic', layers.topographic, true, true)
  assert.ok(topo.layers.some(({ id }) => id === 'lab-earth-relief-local-detail-41-93-dark'))
  assert.ok(topo.layers.some(({ id }) => id === 'roads-world-local-detail-41-93'))
  const water = topo.layers.find(({ id }) => id === 'lab-earth-relief-local-detail-41-93-water')!
  assert.deepEqual('filter' in water && water.filter, ['==', ['geometry-type'], 'Polygon'])
  assert.ok(!topo.layers.some((layer) => layer.type === 'raster'))
})

test('regional sources stay bounded to the nearby view and never weigh down the worldwide overview', () => {
  assert.deepEqual(localDetailInView([cell], { longitude: -121.3, latitude: 44.05, zoom: 4 }), [])
  assert.equal(localDetailInView([cell], { longitude: -121.3, latitude: 44.05, zoom: 12 }).length, 1)
  assert.deepEqual(localDetailInView([cell], { longitude: 30, latitude: 30, zoom: 12 }), [])
  const withoutWorld = { ...base, sources: { country: base.sources.world }, layers: base.layers.map((layer) =>
    'source' in layer ? { ...layer, id: layer.id.replace('world', 'country'), source: 'country' } : layer) } as StyleSpecification
  const fallback = withLocalDetail(withoutWorld, [cell])
  assert.ok(fallback.layers.some(({ id }) => id === 'roads-country-local-detail-41-93'))
})
