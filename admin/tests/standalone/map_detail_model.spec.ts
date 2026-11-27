import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import { describeMapDetail, type DetailDemSource } from '../../inertia/components/maps/mapDetailModel.js'

type Bounds = [number, number, number, number]
const world: Bounds = [-180, -85.0511287798066, 180, 85.0511287798066]
const bend: Bounds = [-122.34375, 43.06888777416962, -120.9375, 44.087585028245165]
const camera = { longitude: -121.3, latitude: 44, zoom: 11.5, view: [-121.6, 43.8, -121.1, 44.04] as Bounds }

function raster(id: string, maxzoom: number | undefined, bounds: Bounds | undefined = world,
  options: { role?: string; tileSize?: number; hidden?: boolean; minzoom?: number } = {}) {
  return {
    source: { type: 'raster' as const, url: 'pmtiles:///' + id + '.pmtiles', maxzoom, bounds,
      tileSize: options.tileSize ?? 512, minzoom: options.minzoom ?? 0 },
    layer: { id, type: 'raster', source: id,
      metadata: { 'nomad:role': options.role ?? 'aerial', 'nomad:local-detail': id.startsWith('local-detail-') },
      ...(options.hidden ? { layout: { visibility: 'none' } } : {}),
    } as LayerSpecification,
  }
}
function style(...entries: ReturnType<typeof raster>[]): StyleSpecification {
  return { version: 8, sources: Object.fromEntries(entries.map(({ source, layer }) => [layer.id, source])), layers: entries.map(({ layer }) => layer) }
}
const satellite = () => style(raster('world-satellite', 11), raster('local-detail-41-93-satellite', 12, bend, { minzoom: 8 }))

test('finest installed regional data overrides world data and a fully covered view is not mixed', () => {
  const result = describeMapDetail({ style: satellite(), camera, mode: 'aerial' })
  assert.equal(result.availability, 'available'); assert.equal(result.centerNativeZoom, 12)
  assert.equal(result.centerSource?.label, 'Regional square AP94'); assert.equal(result.enlarged, false)
  assert.equal(result.mixed, false); assert.deepEqual(result.sourcesSummary.map(({ nativeZoom }) => nativeZoom), [12])
  assert.ok(result.sampleMeters! > 13 && result.sampleMeters! < 14)
})

test('mixed view reports both detail levels without painting a sharp center red', () => {
  const view: Bounds = [-122.6, 43.7, -121, 44.07]
  const result = describeMapDetail({ style: satellite(), camera: { ...camera, view }, mode: 'aerial' })
  assert.equal(result.centerNativeZoom, 12); assert.equal(result.enlarged, false); assert.equal(result.mixed, true)
  assert.equal(result.viewMinNativeZoom, 11); assert.equal(result.viewMaxNativeZoom, 12)
  assert.equal(result.coarserAreasEnlarged, true); assert.equal(result.missingInView, false)
  assert.equal(result.sourcesSummary.length, 2)
})

test('outside the square the world cap applies and zoom beyond it remains an informational state', () => {
  const result = describeMapDetail({ style: satellite(), camera: { longitude: -124, latitude: 44, zoom: 12.5, view: [-125, 43.5, -123, 44.5] }, mode: 'aerial' })
  assert.equal(result.centerNativeZoom, 11); assert.equal(result.enlarged, true)
  assert.equal(result.enlargementFactor, 2 ** 1.5); assert.equal(result.mixed, false)
})

test('adjacent squares of the same resolution hide the world without generating a false mixed status', () => {
  const input = style(raster('world', 11), raster('local-a', 12, [-2, 0, 0, 2]), raster('local-b', 12, [0, 0, 2, 2]))
  const result = describeMapDetail({ style: input, camera: { longitude: -.5, latitude: 1, zoom: 12, view: [-1, .5, 1, 1.5] }, mode: 'aerial' })
  assert.equal(result.mixed, false); assert.equal(result.missingInView, false)
  assert.equal(result.sourcesSummary.length, 2); assert.ok(result.sourcesSummary.every(({ nativeZoom }) => nativeZoom === 12))
})

test('the topmost visible source wins and hidden sources are excluded', () => {
  const input = style(raster('local-underneath', 12, bend), raster('world-topmost', 11), raster('hidden', 18, world, { hidden: true }))
  const result = describeMapDetail({ style: input, camera, mode: 'aerial' })
  assert.equal(result.centerSource?.id, 'world-topmost'); assert.equal(result.centerNativeZoom, 11)
  assert.equal(result.sourcesSummary.length, 1)
})

test('Blue Marble tile256 package8 maps to camera7 and sampling never promises more than the NASA source', () => {
  const input = style(raster('marble', 8, world, { role: 'blue-marble', tileSize: 256 }))
  const result = describeMapDetail({ style: input, camera: { ...camera, zoom: 7.5 }, mode: 'blue-marble' })
  assert.equal(result.centerNativeZoom, 7); assert.equal(result.enlarged, true); assert.equal(result.sampleMeters, 500)
  assert.equal(describeMapDetail({ style: input, camera: { ...camera, zoom: 7 + 1e-8 }, mode: 'blue-marble' }).enlarged, false)
})

test('progressive relief bands retain the finest installed available cap before its drawing LOD starts', () => {
  const input: StyleSpecification = { version: 8, sources: {}, layers: [] }
  for (const zoom of [8, 9, 10]) {
    const id = 'relief-' + zoom
    input.sources[id] = { type: 'vector', minzoom: zoom === 8 ? 0 : zoom, maxzoom: zoom, bounds: world }
    input.layers.push({ id, source: id, 'source-layer': 'hillshade-vectors', type: 'fill', minzoom: zoom === 8 ? 0 : zoom,
      ...(zoom < 10 ? { maxzoom: zoom + 1 } : {}), metadata: { 'nomad:role': 'topographic' } })
  }
  input.sources.street = { type: 'vector', minzoom: 0, maxzoom: 15, bounds: world }
  input.layers.push({ id: 'water-mask', source: 'street', 'source-layer': 'water', type: 'fill', metadata: { 'nomad:role': 'topographic' } })
  const result = describeMapDetail({ style: input, camera: { ...camera, zoom: 9.5 }, mode: 'topographic' })
  assert.equal(result.centerNativeZoom, 10); assert.equal(result.primaryKind, 'vector')
  assert.equal(result.enlarged, false); assert.equal(result.sampleMeters, undefined)
})

test('Street overlays cannot reduce satellite detail and vectors do not invent a pixel-resolution claim', () => {
  const input = satellite()
  input.sources.street = { type: 'vector', maxzoom: 3, bounds: world }
  input.layers.push({ id: 'street', source: 'street', 'source-layer': 'roads', type: 'line', minzoom: 14 })
  assert.equal(describeMapDetail({ style: input, camera, mode: 'aerial' }).centerNativeZoom, 12)
  const vectors = describeMapDetail({ style: input, camera: { ...camera, zoom: 16 }, mode: 'street' })
  assert.equal(vectors.centerNativeZoom, 3); assert.equal(vectors.primaryKind, 'vector')
  assert.equal(vectors.sampleMeters, undefined); assert.equal(vectors.enlarged, true)
})

test('unknown metadata and missing coverage are distinct from enlarged data', () => {
  const unknown = describeMapDetail({ style: style(raster('unknown', undefined)), camera, mode: 'aerial' })
  assert.equal(unknown.availability, 'unknown'); assert.equal(unknown.enlarged, false)
  const missing = describeMapDetail({ style: style(raster('local', 12, [0, 0, 1, 1])), camera, mode: 'aerial' })
  assert.equal(missing.availability, 'missing'); assert.equal(missing.missingInView, true); assert.equal(missing.enlarged, false)
  const checking = describeMapDetail({ style: null, camera, mode: 'aerial', checking: true })
  assert.equal(checking.availability, 'checking')
  const noBounds = describeMapDetail({ style: style(raster('unbounded', 11, undefined)), camera, mode: 'aerial' })
  assert.equal(noBounds.centerNativeZoom, 11)
})

test('a partially covered view reports missing coverage independently of known resolution', () => {
  const result = describeMapDetail({ style: style(raster('local', 12, [-1, -1, 1, 1])), camera: { longitude: 0, latitude: 0, zoom: 11, view: [-2, -2, 2, 2] }, mode: 'aerial' })
  assert.equal(result.availability, 'available'); assert.equal(result.missingInView, true)
  assert.equal(result.mixed, false); assert.equal(result.enlarged, false)
})

test('wrapped and unwrapped antimeridian views retain exact regional ownership', () => {
  const input = style(raster('world', 11), raster('wrapped-region', 12, [170, -20, -170, 20]))
  for (const c of [
    { longitude: 181, latitude: 0, zoom: 11.5, view: [175, -5, -175, 5] as Bounds },
    { longitude: 541, latitude: 0, zoom: 11.5, view: [535, -5, 545, 5] as Bounds },
  ]) {
    const result = describeMapDetail({ style: input, camera: c, mode: 'aerial' })
    assert.equal(result.centerNativeZoom, 12); assert.equal(result.mixed, false); assert.equal(result.missingInView, false)
  }
  assert.equal(describeMapDetail({ style: input, camera: { longitude: 179, latitude: 0, zoom: 11.5, view: [160, -5, -160, 5] }, mode: 'aerial' }).mixed, true)
})

test('contour DEM availability follows the buffered whole-view regional eligibility, independently from relief', () => {
  const input: StyleSpecification = { version: 8, sources: {
    relief: { type: 'vector', maxzoom: 12, bounds: [-1, 0, 1, 2] },
  }, layers: [{ id: 'relief', type: 'fill', source: 'relief', 'source-layer': 'hillshade-vectors', metadata: { 'nomad:role': 'topographic' } }] }
  const demSources: DetailDemSource[] = [
    { filename: 'world-elevation.pmtiles', bounds: world, maxzoom: 8, tileSize: 512 },
    { filename: 'partial-z8-0-0-elevation.pmtiles', bounds: [-1, 0, 1, 2], maxzoom: 12, tileSize: 512, regional: true },
  ]
  const inside = describeMapDetail({ style: input, camera: { longitude: 0, latitude: 1, zoom: 11, view: [-.5, .5, .5, 1.5] }, mode: 'topographic', demSources })
  assert.equal(inside.centerNativeZoom, 12); assert.equal(inside.dem?.nativeZoom, 12); assert.equal(inside.dem?.regional, true)
  const edge = describeMapDetail({ style: input, camera: { longitude: 0, latitude: 1, zoom: 11, view: [-.8, .5, .95, 1.5] }, mode: 'topographic', demSources })
  assert.equal(edge.centerNativeZoom, 12); assert.equal(edge.enlarged, false); assert.equal(edge.dem?.nativeZoom, 8)
  assert.equal(edge.dem?.enlarged, true); assert.equal(edge.dem?.regional, false)
})

test('DEM-only topography remains informative without inventing an Earth Relief package', () => {
  const result = describeMapDetail({ style: { version: 8, sources: {}, layers: [] }, camera,
    mode: 'topographic', demSources: [{ bounds: world, maxzoom: 8, tileSize: 512 }] })
  assert.equal(result.availability, 'available'); assert.equal(result.contoursOnly, true)
  assert.equal(result.centerNativeZoom, 8); assert.equal(result.enlarged, true)
})

test('adjacent installed DEM squares retain fine detail across their shared boundary', () => {
  const demSources: DetailDemSource[] = [
    { filename: 'world.pmtiles', bounds: world, maxzoom: 8, tileSize: 512 },
    { filename: 'partial-z8-127-127-elevation.pmtiles', bounds: [-2, -2, 0, 2], maxzoom: 12, tileSize: 512, regional: true },
    { filename: 'partial-z8-128-127-elevation.pmtiles', bounds: [0, -2, 2, 2], maxzoom: 12, tileSize: 512, regional: true },
  ]
  const result = describeMapDetail({ style: { version: 8, sources: {}, layers: [] },
    camera: { longitude: 0, latitude: 0, zoom: 12, view: [-.5, -.5, .5, .5] }, mode: 'topographic', demSources })
  assert.equal(result.dem?.nativeZoom, 12); assert.equal(result.dem?.sourceLabel, 'Regional elevation · 2 squares')
  assert.equal(result.enlarged, false); assert.equal(result.missingInView, false)
})

test('PMTiles E7 world bounds do not create false polar missing-coverage strips', () => {
  const result = describeMapDetail({ style: style(raster('world-header', 11, [-180, -85.0511287, 180, 85.0511287])),
    camera: { longitude: 0, latitude: 0, zoom: 1, view: world }, mode: 'aerial' })
  assert.equal(result.missingInView, false); assert.equal(result.mixed, false)
})
