import * as assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { TileType, zxyToTileId } from 'pmtiles'
import sharp from 'sharp'
import { buildContourTile, lookupElevationContours } from '../../app/services/world_elevation_contours.js'
import { withElevationTiles, type LocalElevationArchive } from '../../app/services/world_elevation_service.js'
import {
  validateWorldElevationContoursQuery,
} from '../../app/validators/world_offline.js'

function varint(value: number) {
  const bytes = []
  while (value >= 128) {
    bytes.push(value % 128 + 128)
    value = Math.floor(value / 128)
  }
  bytes.push(value)
  return Buffer.from(bytes)
}

async function fixtureDirectory(context: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'nomad-elevation-test-'))
  const paths = new Set<string>()
  context.after(async () => {
    await Promise.all([...paths].map((path) => unlink(path)))
    await rmdir(directory)
  })
  return async (name: string, zoom: number, x: number, y: number,
    elevation: number | ((pixelX: number, pixelY: number) => number),
    options: { transparent?: boolean; width?: number } = {}) => {
    const width = options.width ?? 512
    const rgb = Buffer.alloc(width * width * 4)
    for (let i = 0; i < width * width; i += 1) {
      const height = typeof elevation === 'number' ? elevation : elevation(i % width, Math.floor(i / width))
      const encoded = Math.round((height + 32768) * 256)
      rgb[i * 4] = encoded >>> 16
      rgb[i * 4 + 1] = (encoded >>> 8) & 255
      rgb[i * 4 + 2] = encoded & 255
      rgb[i * 4 + 3] = options.transparent ? 0 : 255
    }
    const tile = await sharp(rgb, { raw: { width, height: width, channels: 4 } }).webp({ lossless: true }).toBuffer()
    // PMTiles v3 with one directory entry and one losslessly encoded WebP tile.
    const directoryBytes = Buffer.concat([Buffer.from([1]), varint(zxyToTileId(zoom, x, y)),
      Buffer.from([1]), varint(tile.length), Buffer.from([1])])
    const header = Buffer.alloc(127)
    header.write('PMTiles')
    header[7] = 3
    const dataOffset = header.length + directoryBytes.length
    for (const [offset, value] of [[8, header.length], [16, directoryBytes.length], [24, dataOffset],
      [40, dataOffset], [56, dataOffset], [64, tile.length], [72, 1], [80, 1], [88, 1]]) {
      header.writeBigUInt64LE(BigInt(value), offset)
    }
    header[96] = 1
    header[97] = 1
    header[98] = 1
    header[99] = TileType.Webp
    header[100] = zoom
    header[101] = zoom
    const bounds: LocalElevationArchive['archive']['bounds'] = [-180, -85.0511288, 180, 85.0511288]
    bounds.forEach((value, index) => header.writeInt32LE(Math.round(value * 1e7), 102 + 4 * index))
    const bytes = Buffer.concat([header, directoryBytes, tile])
    const path = join(directory, name)
    await writeFile(path, bytes)
    paths.add(path)
    return {
      path,
      archive: {
        filename: name, bounds, tileSize: 512, minzoom: zoom, maxzoom: zoom,
        installedBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
        attribution: '', format: 'webp', encoding: 'terrarium',
      },
    } satisfies LocalElevationArchive
  }
}

test('validates decimal viewport bounds and preserves antimeridian wraps', async () => {
  const query = { west: '179.5', south: '-1', east: '181.25', north: '1', zoom: '9.5' }
  assert.deepEqual(await validateWorldElevationContoursQuery(query), {
    west: 179.5, south: -1, east: 181.25, north: 1, zoom: 9.5,
  })
  await assert.rejects(validateWorldElevationContoursQuery({ ...query, zoom: '' }))
  await assert.rejects(validateWorldElevationContoursQuery({ ...query, east: ['180', '181'] }))
  await assert.rejects(validateWorldElevationContoursQuery({ ...query, north: 'Infinity' }))
})

test('matches contour endpoints across both tile borders and keeps negative and zero intervals', () => {
  const grid = (column: number, row: number) => Float32Array.from({ length: 9 },
    (_, i) => 100 * (column + row + i % 3 + Math.floor(i / 3)) - 361)
  const first = buildContourTile(grid(0, 0), 2)
  const east = buildContourTile(grid(2, 0), 2)
  const south = buildContourTile(grid(0, 2), 2)
  assert.notEqual(first, 'too-dense')
  assert.notEqual(east, 'too-dense')
  assert.notEqual(south, 'too-dense')
  if (first === 'too-dense' || east === 'too-dense' || south === 'too-dense') return
  for (const level of [-100, 0]) {
    const firstPoints = first.byElevation.get(level)!.flat()
    const nearEast = firstPoints.find(([x]) => x === 2.5)
    const nearSouth = firstPoints.find(([, y]) => y === 2.5)
    assert.ok(nearEast)
    assert.ok(nearSouth)
    assert.ok(east.byElevation.get(level)!.flat().some(([x, y]) => x === 0.5 && y === nearEast[1]))
    assert.ok(south.byElevation.get(level)!.flat().some(([x, y]) => x === nearSouth[0] && y === 0.5))
  }

  const saddle = buildContourTile(Float32Array.of(150, -40, -40, 150), 1)
  assert.notEqual(saddle, 'too-dense')
  if (saddle === 'too-dense') return
  assert.equal(saddle.byElevation.get(0)!.length, 2)
  assert.equal(saddle.byElevation.get(100)!.length, 2)
  assert.deepEqual(buildContourTile(Float32Array.of(-50, 50, NaN, 50), 1),
    { byElevation: new Map(), coverage: null, positions: 0 })
})

test('returns distinct flat, missing, absent, and overly broad viewport states', async (context) => {
  const fixture = await fixtureDirectory(context)
  const world = await fixture('flat.pmtiles', 0, 0, 0, 0)
  const gap = await fixture('gap.pmtiles', 0, 0, 0, 0, { transparent: true })
  const viewport = { west: -2, south: -2, east: 2, north: 2, zoom: 9 }
  assert.deepEqual(await lookupElevationContours([], viewport), { status: 'not-installed' })
  assert.deepEqual(await lookupElevationContours([gap], viewport), { status: 'no-data' })
  assert.deepEqual(await lookupElevationContours([world], viewport), {
    status: 'ok', dataZoom: 0, intervalMeters: 100, geojson: { type: 'FeatureCollection', features: [] },
  })
  assert.deepEqual(await lookupElevationContours([world], { ...viewport, zoom: 7 }), { status: 'zoom-in' })
  assert.deepEqual(await lookupElevationContours([world], { ...viewport, west: -180, east: 180 }), { status: 'zoom-in' })
  const fine = await fixture('fine.pmtiles', 8, 128, 128, 0)
  assert.deepEqual(await lookupElevationContours([fine], { ...viewport, west: -20, east: 20 }), { status: 'zoom-in' })
  assert.deepEqual(await lookupElevationContours([fine], { ...viewport, west: 12, east: 13 }), { status: 'no-data' })
})

test('a zoomed crop remains available inside an otherwise too-dense tile', async (context) => {
  const fixture = await fixtureDirectory(context)
  const rough = await fixture('rough.pmtiles', 0, 0, 0, (x, y) => (x + y) % 2 ? 2_000 : -2_000)
  const broad = { west: -20, south: -15, east: 20, north: 15, zoom: 9 }
  assert.deepEqual(await lookupElevationContours([rough], broad), { status: 'zoom-in' })
  const narrow = { west: -0.4, south: -0.4, east: 0.4, north: 0.4, zoom: 15 }
  const result = await lookupElevationContours([rough], narrow)
  assert.equal(result.status, 'ok')
  assert.ok(result.geojson.features.length > 0)
})

test('clips contours at the viewport and antimeridian at one native DEM resolution', async (context) => {
  const fixture = await fixtureDirectory(context)
  const world = await fixture('world.pmtiles', 0, 0, 0, (_x, y) => 50 * (y - 255))
  const viewport = { west: 178, south: -2, east: -178, north: 2, zoom: 10 }
  const wrapped = await lookupElevationContours([world], viewport)
  assert.deepEqual(wrapped, await lookupElevationContours([world], { ...viewport, east: 182 }))
  assert.equal(wrapped.status, 'ok')
  assert.equal(wrapped.dataZoom, 0)
  assert.ok(wrapped.geojson.features.length > 1)
  for (const { geometry } of wrapped.geojson.features) {
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
    const points = lines.flat()
    assert.ok(lines.every((line) => Math.max(...line.map(([lng]) => lng)) - Math.min(...line.map(([lng]) => lng)) <= 2.00001))
    assert.ok(points.every(([lng, lat]) => Math.abs(lng) >= 177.99999 && Math.abs(lng) <= 180 && Math.abs(lat) <= 2.00001))
    assert.ok(points.some(([lng]) => lng === 180))
    assert.ok(points.some(([lng]) => lng === -180))
  }
})

test('reuses decoded Terrarium samples across requests and retains zero and negative elevations', async (context) => {
  const fixture = await fixtureDirectory(context)
  const pack = await fixture('decoded.pmtiles', 0, 0, 0, (pixel) => pixel < 256 ? -6.5 : 0)
  const first = await withElevationTiles(pack, (read) => read(0, 0, 0))
  assert.equal(first?.(0), -6.5)
  assert.equal(first?.(256), 0)
  const repeated = await withElevationTiles(pack, (read) => read(0, 0, 0))
  assert.equal(first, repeated)
  await assert.rejects(withElevationTiles(pack, (read) => read(0, 0, 0), AbortSignal.abort()), { name: 'AbortError' })
})

test('rejects invalid dimensions and replaces cached samples with a new source revision', async (context) => {
  const fixture = await fixtureDirectory(context)
  const invalid = await fixture('invalid.pmtiles', 0, 0, 0, 0, { width: 16 })
  await assert.rejects(withElevationTiles(invalid, (read) => read(0, 0, 0)), /invalid elevation tile dimensions/i)
  const first = await fixture('replacement.pmtiles', 0, 0, 0, 20)
  const original = await withElevationTiles(first, (read) => read(0, 0, 0))
  assert.equal(original?.(0), 20)
  const next = await fixture('replacement.pmtiles', 0, 0, 0, 23)
  const changed = await withElevationTiles(next, (read) => read(0, 0, 0))
  assert.notEqual(first.archive.sha256, next.archive.sha256)
  assert.notEqual(original, changed)
  assert.equal(changed?.(0), 23)
})

test('keeps block geometry stable on nearby views and invalidates contours by source digest', async (context) => {
  const fixture = await fixtureDirectory(context)
  const view = { west: -3, south: -2, east: 3, north: 2, zoom: 10 }
  const original = await fixture('contours.pmtiles', 0, 0, 0, (_x, y) => 50 * (y - 255))
  const first = await lookupElevationContours([original], view)
  const pan = await lookupElevationContours([original], { ...view, west: -2, east: 4 })
  assert.equal(first.status, 'ok')
  assert.equal(pan.status, 'ok')
  assert.deepEqual(first.geojson.features.map(({ properties }) => properties),
    pan.geojson.features.map(({ properties }) => properties))
  const next = await fixture('contours.pmtiles', 0, 0, 0, (_x, y) => 1000 + 50 * (y - 255))
  const changed = await lookupElevationContours([next], view)
  assert.equal(changed.status, 'ok')
  assert.deepEqual(first.geojson.features.map(({ properties }) => properties.elevationMeters + 1000),
    changed.geojson.features.map(({ properties }) => properties.elevationMeters))
  await assert.rejects(lookupElevationContours([next], view, AbortSignal.abort()), { name: 'AbortError' })
})
