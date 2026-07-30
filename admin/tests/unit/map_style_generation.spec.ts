import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildMapSourceDefinitions,
  composeMapStyle,
  parseMapArchiveManifest,
} from '../../app/utils/map_styles.js'
import type { BaseStylesFile, MapArchiveMetadata, MapSourceDefinition } from '../../types/maps.js'
import type { FileEntry } from '../../types/files.js'

const file = (name: string): FileEntry => ({
  type: 'file',
  key: `/storage/maps/pmtiles/${name}`,
  name,
})

const vectorTemplate = (): BaseStylesFile => ({
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#eee' } },
    { 'id': 'land', 'type': 'fill', 'source': 'template', 'source-layer': 'land' },
    { 'id': 'roads', 'type': 'line', 'source': 'template', 'source-layer': 'roads' },
  ],
  sprite: '',
  glyphs: '',
})

const rasterMetadata = (
  regionId: string,
  role: 'aerial' | 'topographic' = 'aerial'
): MapArchiveMetadata => ({
  filename: `raster-usgs-${role}-${regionId}-2026-07-z14.pmtiles`,
  resourceId: `${role}-${regionId}`,
  kind: 'raster',
  role,
  regionId,
  tileFormat: 'jpeg',
  tileSize: 256,
  minzoom: 0,
  maxzoom: 14,
  bounds: [-103, 33, -94, 37],
  attribution: 'USDA, USGS The National Map: Orthoimagery.',
  sourceUrl: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer',
  sourceVersion: '2026-07',
  sha256: 'a'.repeat(64),
  installedBytes: 1024,
  verifiedAt: '2026-07-30T12:00:00.000Z',
})

test('uses explicit vector archive metadata instead of inferring the source type', () => {
  const metadata: MapArchiveMetadata = {
    filename: 'us_20260728_z15.pmtiles',
    resourceId: 'street-us',
    kind: 'vector',
    role: 'street',
    tileFormat: 'mvt',
    attribution: 'OpenStreetMap',
    maxzoom: 15,
  }

  const sources = buildMapSourceDefinitions(
    'http://nomad.test/maps/pmtiles',
    [file(metadata.filename)],
    {
      archives: [metadata],
      rejectedFilenames: [],
    }
  )

  assert.equal(sources.length, 1)
  assert.equal(sources[0].id, 'street-us')
  assert.equal(sources[0].source.type, 'vector')
  assert.equal(sources[0].source.attribution, 'OpenStreetMap')
  assert.equal(sources[0].source.maxzoom, 15)
})

test('parses a filename-keyed manifest for an arbitrary region ID', () => {
  const metadata = rasterMetadata('us-ok')
  const parsed = parseMapArchiveManifest({
    schemaVersion: 1,
    archives: {
      [metadata.filename]: metadata,
    },
  })

  assert.deepEqual(parsed.archives, [metadata])
  assert.deepEqual(parsed.rejectedFilenames, [])
})

test('rejects invalid raster metadata and blocks legacy-vector fallback for that file', () => {
  const metadata = {
    ...rasterMetadata('us-ok'),
    sha256: 'not-a-sha256',
  }
  const parsed = parseMapArchiveManifest({
    schemaVersion: 1,
    archives: {
      [metadata.filename]: metadata,
    },
  })
  const sources = buildMapSourceDefinitions(
    'http://nomad.test/maps/pmtiles',
    [file('us_20260728_z15.pmtiles'), file(metadata.filename)],
    parsed
  )

  assert.deepEqual(parsed.archives, [])
  assert.deepEqual(parsed.rejectedFilenames, [metadata.filename])
  assert.deepEqual(
    sources.map((source) => source.id),
    ['us_20260728_z15']
  )
})

test('requires complete provenance and verification metadata for raster archives', () => {
  const requiredFields = [
    'role',
    'regionId',
    'tileFormat',
    'tileSize',
    'minzoom',
    'maxzoom',
    'bounds',
    'attribution',
    'sourceUrl',
    'sourceVersion',
    'sha256',
    'installedBytes',
    'verifiedAt',
  ] as const

  for (const field of requiredFields) {
    const metadata = rasterMetadata('us-ok') as Record<string, unknown>
    delete metadata[field]
    const parsed = parseMapArchiveManifest({
      schemaVersion: 1,
      archives: { [String(metadata.filename)]: metadata },
    })
    assert.equal(parsed.archives.length, 0, `${field} should be required`)
  }
})

test('creates non-colliding raster sources for multiple regions and roles', () => {
  const metadata = [
    rasterMetadata('us-tx'),
    rasterMetadata('us-ok'),
    rasterMetadata('us-ga', 'topographic'),
  ]

  const sources = buildMapSourceDefinitions(
    'http://nomad.test/maps/pmtiles',
    metadata.map((archive) => file(archive.filename)),
    { archives: metadata, rejectedFilenames: [] }
  )

  assert.deepEqual(
    sources.map((source) => source.id),
    ['aerial-us-tx', 'aerial-us-ok', 'topographic-us-ga']
  )
  assert.equal(new Set(sources.map((source) => source.id)).size, 3)
  for (const source of sources) {
    assert.equal(source.source.type, 'raster')
    assert.equal(source.source.tileSize, 256)
    assert.equal(source.source.minzoom, 0)
    assert.equal(source.source.maxzoom, 14)
    assert.deepEqual(source.source.bounds, [-103, 33, -94, 37])
  }
})

test('places hidden raster layers below cloned vector layers without mutating the template', () => {
  const raster = rasterMetadata('us-ok')
  const vector: MapArchiveMetadata = {
    filename: 'us_20260728_z15.pmtiles',
    resourceId: 'street-us',
    kind: 'vector',
    role: 'street',
    tileFormat: 'mvt',
  }
  const sources: MapSourceDefinition[] = buildMapSourceDefinitions(
    'http://nomad.test/maps/pmtiles',
    [file(vector.filename), file(raster.filename)],
    { archives: [vector, raster], rejectedFilenames: [] }
  )
  const template = vectorTemplate()
  const original = structuredClone(template)

  const style = composeMapStyle(
    template,
    sources,
    'http://nomad.test/sprites',
    'http://nomad.test/fonts/{fontstack}/{range}.pbf'
  )

  const rasterLayer = style.layers.find((layer) => layer.id === 'raster-aerial-us-ok')
  const vectorLayers = style.layers.filter((layer) => layer.source === 'street-us')

  assert.deepEqual(template, original)
  assert.ok(rasterLayer)
  assert.equal(rasterLayer.type, 'raster')
  assert.equal(rasterLayer.source, 'aerial-us-ok')
  assert.deepEqual(rasterLayer.layout, { visibility: 'none' })
  assert.deepEqual(rasterLayer.metadata, {
    'nomad:role': 'aerial',
    'nomad:regionId': 'us-ok',
  })
  assert.deepEqual(
    vectorLayers.map((layer) => layer.id),
    ['land-street-us', 'roads-street-us']
  )
  assert.equal(
    style.layers.some((layer) => layer.id === 'land-aerial-us-ok'),
    false
  )
  assert.ok(style.layers.indexOf(rasterLayer) < style.layers.indexOf(vectorLayers[0]))
})

test('preserves legacy vector deduplication by keeping the newest dated archive', () => {
  const sources = buildMapSourceDefinitions('http://nomad.test/maps/pmtiles', [
    file('washington_2025-11.pmtiles'),
    file('washington.pmtiles'),
    file('washington_2025-12.pmtiles'),
  ])

  assert.equal(sources.length, 1)
  assert.equal(sources[0].id, 'washington')
  assert.match(sources[0].source.url, /washington_2025-12\.pmtiles$/)
  assert.equal(sources[0].source.type, 'vector')
})

test('does not guess reserved unmanifested raster archives as vector maps', () => {
  const sources = buildMapSourceDefinitions('http://nomad.test/maps/pmtiles', [
    file('raster-usgs-aerial-us-ok-2026-07-z14.pmtiles'),
    file('oklahoma.pmtiles'),
  ])

  assert.deepEqual(
    sources.map((source) => source.id),
    ['oklahoma']
  )
})
