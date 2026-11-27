import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildMapSourceDefinitions,
  composeMapStyle,
  parseMapArchiveManifest,
  parseMapArchiveManifestJson,
  readLegacyMapMaxZooms,
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
      status: 'valid',
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

test('rejects vector metadata with raster roles or tile formats', () => {
  const baseVectorMetadata = {
    filename: 'us_20260728_z15.pmtiles',
    resourceId: 'street-us',
    kind: 'vector',
    role: 'street',
    tileFormat: 'mvt',
  }

  for (const metadata of [
    { ...baseVectorMetadata, role: 'aerial' },
    { ...baseVectorMetadata, tileFormat: 'jpeg' },
  ]) {
    const parsed = parseMapArchiveManifest({
      schemaVersion: 1,
      archives: {
        [metadata.filename]: metadata,
      },
    })

    assert.deepEqual(parsed.archives, [])
    assert.deepEqual(parsed.rejectedFilenames, [metadata.filename])
  }
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

test('rejects archive arrays because the manifest schema is filename-keyed', () => {
  const parsed = parseMapArchiveManifest({
    schemaVersion: 1,
    archives: [rasterMetadata('us-ok')],
  })

  assert.equal(parsed.status, 'invalid')
  assert.deepEqual(parsed.archives, [])
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

test('blocks arbitrary PMTiles filenames from vector fallback when the manifest is malformed', () => {
  const parsed = parseMapArchiveManifestJson('{not valid json')
  const sources = buildMapSourceDefinitions(
    'http://nomad.test/maps/pmtiles',
    [file('provider-aerial-ok.pmtiles'), file('oklahoma.pmtiles')],
    parsed
  )

  assert.equal(parsed.status, 'invalid')
  assert.deepEqual(sources, [])
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
    { status: 'valid', archives: metadata, rejectedFilenames: [] }
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
    { status: 'valid', archives: [vector, raster], rejectedFilenames: [] }
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

function vectorHeader(maxZoom: number, minZoom = 0, tileType = 1) {
  const bytes = Buffer.alloc(127)
  bytes.write('PMTiles', 0, 'ascii')
  bytes[7] = 3
  bytes[99] = tileType
  bytes[100] = minZoom
  bytes[101] = maxZoom
  return bytes
}

async function withHeaderFiles(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'nomad-vector-headers-'))
  try {
    await run(directory)
  } finally {
    // These fixtures contain only our explicitly generated flat files.
    for (const filename of await readdir(directory)) await unlink(join(directory, filename))
    await rmdir(directory)
  }
}

test('reads bounded legacy vector headers including maxzoom zero and ignores unusable headers', async () => {
  await withHeaderFiles(async (directory) => {
    const valid = vectorHeader(15)
    const wrongVersion = vectorHeader(15); wrongVersion[7] = 2
    const entries = [
      ['detail.pmtiles', valid], ['zero.pmtiles', vectorHeader(0)],
      ['truncated.pmtiles', valid.subarray(0, 126)], ['invalid.pmtiles', Buffer.alloc(127, 65)],
      ['version.pmtiles', wrongVersion], ['out-of-range.pmtiles', vectorHeader(31)],
      ['inverted.pmtiles', vectorHeader(15, 16)], ['unmanifested-aerial.pmtiles', vectorHeader(12, 0, 2)],
    ] as const
    for (const [name, header] of entries) await writeFile(join(directory, name), header)
    const regions: FileEntry[] = [...entries.map(([name]) => ({ type: 'file' as const, name, key: join(directory, name) })),
      { type: 'file', name: 'missing.pmtiles', key: join(directory, 'missing.pmtiles') }]
    const zooms = await readLegacyMapMaxZooms(regions)
    assert.equal(zooms.get('detail.pmtiles'), 15)
    assert.equal(zooms.get('zero.pmtiles'), 0)
    for (const [name] of entries.slice(2)) assert.equal(zooms.get(name), null, name)
    assert.equal(zooms.get('missing.pmtiles'), null)
    const zero = buildMapSourceDefinitions('http://nomad.test/pmtiles', regions, undefined, zooms)
      .find(({ id }) => id === 'zero')!
    assert.equal(zero.source.maxzoom, 0)
  })
})

test('header reading follows exact selected versions and leaves manifests, rejected files and raster names alone', async () => {
  await withHeaderFiles(async (directory) => {
    const metadata = rasterMetadata('us-ok')
    const regions: FileEntry[] = ['region_2025-11.pmtiles', 'region_2025-12.pmtiles', metadata.filename,
      'raster-unverified.pmtiles', 'rejected.pmtiles'].map((name) => ({ type: 'file', name, key: join(directory, name) }))
    for (const region of regions) if (region.type === 'file') await writeFile(region.key, vectorHeader(15))
    const explicit: MapArchiveMetadata = {
      filename: 'manifest-vector.pmtiles', resourceId: 'manifest-vector', kind: 'vector', role: 'street', tileFormat: 'mvt', maxzoom: 13,
    }
    regions.push({ type: 'file', name: explicit.filename, key: join(directory, explicit.filename) })
    const manifest = { status: 'valid' as const, archives: [metadata, explicit], rejectedFilenames: ['rejected.pmtiles'] }
    const zooms = await readLegacyMapMaxZooms(regions, manifest)
    assert.deepEqual([...zooms], [['region_2025-12.pmtiles', 15]])
    assert.equal((await readLegacyMapMaxZooms(regions, { status: 'invalid', archives: [], rejectedFilenames: [] })).size, 0)
  })
})

test('replacing a legacy archive invalidates its bounded header cache and concurrent reads agree', async () => {
  await withHeaderFiles(async (directory) => {
    const filename = 'region.pmtiles'
    const key = join(directory, filename)
    const regions: FileEntry[] = [{ type: 'file', name: filename, key }]
    await writeFile(key, vectorHeader(12))
    const initial = await Promise.all([readLegacyMapMaxZooms(regions), readLegacyMapMaxZooms(regions)])
    assert.deepEqual(initial.map((result) => result.get(filename)), [12, 12])
    const replacement = join(directory, 'replacement.tmp')
    await writeFile(replacement, vectorHeader(15))
    await rename(replacement, key)
    assert.equal((await readLegacyMapMaxZooms(regions)).get(filename), 15)
  })
})

test('stacks coarse vectors before fine vectors regardless of input order, without changing raster metadata', () => {
  const raster = rasterMetadata('us-ok')
  const explicit: MapArchiveMetadata = {
    filename: 'explicit.pmtiles', resourceId: 'street-explicit', kind: 'vector', role: 'street', tileFormat: 'mvt', minzoom: 3, maxzoom: 14,
  }
  const zooms = new Map<string, number | null>([['country.pmtiles', 12], ['city.pmtiles', 15], ['overview.pmtiles', 0]])
  const files = ['city.pmtiles', raster.filename, 'country.pmtiles', explicit.filename, 'overview.pmtiles']
  const manifest = { status: 'valid' as const, archives: [raster, explicit], rejectedFilenames: [] }
  const first = buildMapSourceDefinitions('http://nomad.test/pmtiles', files.map(file), manifest, zooms)
  const reversed = buildMapSourceDefinitions('http://nomad.test/pmtiles', [...files].reverse().map(file), manifest, zooms)
  const vectors = (sources: MapSourceDefinition[]) => sources.filter(({ archive }) => archive.kind === 'vector').map(({ id }) => id)
  assert.deepEqual(vectors(first), ['overview', 'country', 'street-explicit', 'city'])
  assert.deepEqual(vectors(reversed), vectors(first))
  assert.deepEqual(first.find(({ id }) => id === raster.resourceId)?.archive, raster)
  assert.deepEqual(first.find(({ id }) => id === 'street-explicit')?.source.minzoom, 3)
  const style = composeMapStyle(vectorTemplate(), first, '/sprites', '/fonts')
  const roads = style.layers.filter((layer) => layer.id.startsWith('roads-')).map((layer) => layer.source)
  assert.deepEqual(roads, ['overview', 'country', 'street-explicit', 'city'])
  assert.ok(style.layers.findIndex((layer) => layer.type === 'raster') < style.layers.findIndex((layer) => layer.source === 'overview'))
})

test('vector ties and unknown headers have deterministic fallback order, while explicit source IDs keep precedence', () => {
  const metadata: MapArchiveMetadata = {
    filename: 'explicit.pmtiles', resourceId: 'region', kind: 'vector', role: 'street', tileFormat: 'mvt', maxzoom: 15,
  }
  const manifest = { status: 'valid' as const, archives: [metadata], rejectedFilenames: [] }
  const filenames = ['unknown-z.pmtiles', 'region.pmtiles', 'b.pmtiles', metadata.filename, 'a.pmtiles', 'unknown-a.pmtiles']
  const zooms = new Map<string, number | null>([['region.pmtiles', 30], ['a.pmtiles', 15], ['b.pmtiles', 15], ['unknown-a.pmtiles', null]])
  const definitions = buildMapSourceDefinitions('/pmtiles', filenames.map(file), manifest, zooms)
  const reversed = buildMapSourceDefinitions('/pmtiles', [...filenames].reverse().map(file), manifest, zooms)
  assert.deepEqual(definitions.map(({ id }) => id), ['a', 'b', 'region', 'unknown-a', 'unknown-z'])
  assert.deepEqual(reversed.map(({ id }) => id), definitions.map(({ id }) => id))
  assert.equal(definitions.filter(({ id }) => id === 'region').length, 1)
  assert.equal(definitions.find(({ id }) => id === 'region')?.archive.filename, metadata.filename)
  assert.equal(definitions.find(({ id }) => id === 'unknown-a')?.source.maxzoom, undefined)
})
