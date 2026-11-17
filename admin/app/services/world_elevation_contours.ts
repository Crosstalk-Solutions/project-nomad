import { setImmediate } from 'node:timers/promises'
import {
  withElevationTiles, type ElevationTile, type LocalElevationArchive, type ReadElevationTile,
} from './world_elevation_service.js'
import type { ElevationContourGeoJSON, ElevationContoursLookup } from '../../types/world_offline.js'

const intervalMeters = 100
const minimumCameraZoom = 8
const maximumOwnerTiles = 16
const maximumTileSegments = 75_000
const maximumResponsePositions = 45_000
const maximumMercatorLatitude = 85.0511287798066
const maximumCachedTiles = 24
const maximumCachedPositions = 160_000

type Point = [number, number]
type Segment = [Point, Point]
type Rectangle = { left: number; top: number; right: number; bottom: number }
type Viewport = { west: number; south: number; east: number; north: number; zoom: number }
type TileContours = {
  coverage: 'full' | Uint8Array | null
  byElevation: Map<number, Point[][]>
  positions: number
}

const emptyTile: TileContours = { coverage: null, byElevation: new Map(), positions: 0 }
const contourCache = new Map<string, TileContours | 'too-dense'>()
let cachedPositions = 0
const wrap = (value: number, limit: number) => ((value % limit) + limit) % limit
const coordinateKey = ([x, y]: Point) => `${x},${y}`
const samePoint = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1]

function stitchSegments(segments: Segment[]) {
  const edges = new Map<string, Array<{ index: number; other: Point }>>()
  const unique = new Set<string>()
  const used = new Uint8Array(segments.length)
  for (let index = 0; index < segments.length; index += 1) {
    const [a, b] = segments[index]
    const from = coordinateKey(a)
    const to = coordinateKey(b)
    const key = from < to ? `${from}:${to}` : `${to}:${from}`
    if (from === to || unique.has(key)) {
      used[index] = 1
      continue
    }
    unique.add(key)
    if (!edges.has(from)) edges.set(from, [])
    if (!edges.has(to)) edges.set(to, [])
    edges.get(from)!.push({ index, other: b })
    edges.get(to)!.push({ index, other: a })
  }

  const lines: Point[][] = []
  function visit(start: Point, firstEdge: { index: number; other: Point }) {
    const line: Point[] = [start]
    let edge = firstEdge
    while (!used[edge.index]) {
      used[edge.index] = 1
      line.push(edge.other)
      const neighbours = edges.get(coordinateKey(edge.other))!
      if (neighbours.length !== 2) break
      edge = neighbours[0].index === edge.index ? neighbours[1] : neighbours[0]
    }
    if (line.length > 1) lines.push(line)
  }

  // Start at junctions and ends so a chain that crosses the tile has only one line.
  for (const neighbours of edges.values()) {
    if (neighbours.length === 2) continue
    for (const edge of neighbours) {
      const [a, b] = segments[edge.index]
      visit(samePoint(a, edge.other) ? b : a, edge)
    }
  }
  for (let index = 0; index < segments.length; index += 1) {
    if (!used[index]) visit(segments[index][0], { index, other: segments[index][1] })
  }
  return lines
}

// Each cell starts at a centre in this tile. One extra row/column from adjacent
// tiles closes the east/south seams. Samples without data are represented by NaN.
export function buildContourTile(grid: Float32Array, size: number, bounds?: Rectangle): TileContours | 'too-dense' {
  const stride = size + 1
  const coverage = new Uint8Array(size * size)
  const segmentsByElevation = new Map<number, Segment[]>()
  let covered = 0
  let segments = 0

  const firstX = bounds ? Math.max(0, Math.floor(bounds.left - 0.5)) : 0
  const lastX = bounds ? Math.min(size - 1, Math.floor(bounds.right - 0.5)) : size - 1
  const firstY = bounds ? Math.max(0, Math.floor(bounds.top - 0.5)) : 0
  const lastY = bounds ? Math.min(size - 1, Math.floor(bounds.bottom - 0.5)) : size - 1
  for (let y = firstY; y <= lastY; y += 1) {
    for (let x = firstX; x <= lastX; x += 1) {
      const index = y * stride + x
      const tl = grid[index]
      const tr = grid[index + 1]
      const bl = grid[index + stride]
      const br = grid[index + stride + 1]
      const low = Math.min(tl, tr, bl, br)
      if (Number.isNaN(low)) continue
      coverage[y * size + x] = 1
      covered += 1

      const high = Math.max(tl, tr, bl, br)
      const left = x + 0.5
      const top = y + 0.5
      for (let level = (Math.floor(low / intervalMeters) + 1) * intervalMeters; level <= high; level += intervalMeters) {
        const points: Point[] = []
        // Orient shared edges the same way in both cells to preserve identical
        // interpolation at their common endpoint, including across a tile seam.
        if ((tl >= level) !== (tr >= level)) points.push([left + (level - tl) / (tr - tl), top])
        if ((tr >= level) !== (br >= level)) points.push([left + 1, top + (level - tr) / (br - tr)])
        if ((bl >= level) !== (br >= level)) points.push([left + (level - bl) / (br - bl), top + 1])
        if ((tl >= level) !== (bl >= level)) points.push([left, top + (level - tl) / (bl - tl)])
        if (points.length < 2) continue

        let lines = segmentsByElevation.get(level)
        if (!lines) segmentsByElevation.set(level, lines = [])
        if (points.length === 2) {
          if (!samePoint(points[0], points[1])) {
            lines.push([points[0], points[1]])
            segments += 1
          }
        } else {
          // The bilinear saddle's determinant picks the same topology on repeat requests.
          const determinant = (tl - level) * (br - level) - (tr - level) * (bl - level)
          if (determinant >= 0) lines.push([points[0], points[1]], [points[2], points[3]])
          else lines.push([points[0], points[3]], [points[1], points[2]])
          segments += 2
        }
        if (segments > maximumTileSegments) return 'too-dense'
      }
    }
  }

  const byElevation = new Map<number, Point[][]>()
  let positions = 0
  for (const [level, segmentsAtLevel] of segmentsByElevation) {
    const lines = stitchSegments(segmentsAtLevel)
    if (lines.length === 0) continue
    byElevation.set(level, lines)
    for (const line of lines) positions += line.length
  }
  return { coverage: covered === size * size ? 'full' : covered ? coverage : null, byElevation, positions }
}

function loadGrid(readTile: ReadElevationTile, zoom: number, size: number) {
  const count = 2 ** zoom
  const decoded = new Map<string, Promise<ElevationTile | null>>()
  function tile(x: number, y: number) {
    if (y >= count) return Promise.resolve(null)
    const canonicalX = wrap(x, count)
    const key = `${canonicalX}/${y}`
    const present = decoded.get(key)
    if (present) return present
    if (decoded.size === 8) decoded.delete(decoded.keys().next().value!)
    const reading = readTile(zoom, canonicalX, y)
    decoded.set(key, reading)
    return reading
  }

  return async (x: number, y: number) => {
    const centre = await tile(x, y)
    if (!centre) return null
    const [east, south, southeast] = await Promise.all([tile(x + 1, y), tile(x, y + 1), tile(x + 1, y + 1)])
    const stride = size + 1
    const grid = new Float32Array(stride ** 2)
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) grid[row * stride + col] = centre(row * size + col) ?? NaN
      grid[row * stride + size] = east?.(row * size) ?? NaN
      grid[size * stride + row] = south?.(row) ?? NaN
    }
    grid[grid.length - 1] = southeast?.(0) ?? NaN
    return grid
  }
}

async function readContours(key: string, size: number, grid: () => Promise<Float32Array | null>, signal?: AbortSignal) {
  const cached = contourCache.get(key)
  if (cached) {
    contourCache.delete(key)
    contourCache.set(key, cached)
    return cached
  }
  const samples = await grid()
  // Allow request cancellation to run between decoding and processing owner tiles.
  await setImmediate(undefined, { signal })
  const result = samples ? buildContourTile(samples, size) : emptyTile
  if (contourCache.has(key)) return result
  const positions = result === 'too-dense' ? 0 : result.positions
  while (contourCache.size >= maximumCachedTiles || cachedPositions + positions > maximumCachedPositions) {
    const oldest = contourCache.keys().next().value!
    const entry = contourCache.get(oldest)!
    if (entry !== 'too-dense') cachedPositions -= entry.positions
    contourCache.delete(oldest)
  }
  contourCache.set(key, result)
  cachedPositions += positions
  return result
}

function hasVisibleData(coverage: TileContours['coverage'], bounds: Rectangle, size: number) {
  if (!coverage) return false
  const firstX = Math.max(0, Math.floor(bounds.left - 0.5))
  const lastX = Math.min(size - 1, Math.floor(bounds.right - 0.5))
  const firstY = Math.max(0, Math.floor(bounds.top - 0.5))
  const lastY = Math.min(size - 1, Math.floor(bounds.bottom - 0.5))
  if (coverage === 'full') return firstX <= lastX && firstY <= lastY
  for (let y = firstY; y <= lastY; y += 1) {
    for (let x = firstX; x <= lastX; x += 1) {
      if (coverage[y * size + x]) return true
    }
  }
  return false
}

function clipSegment(start: Point, end: Point, bounds: Rectangle): Segment | null {
  if (Math.max(start[0], end[0]) < bounds.left || Math.min(start[0], end[0]) > bounds.right ||
      Math.max(start[1], end[1]) < bounds.top || Math.min(start[1], end[1]) > bounds.bottom) return null
  if (Math.min(start[0], end[0]) >= bounds.left && Math.max(start[0], end[0]) <= bounds.right &&
      Math.min(start[1], end[1]) >= bounds.top && Math.max(start[1], end[1]) <= bounds.bottom) return [start, end]
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  let enter = 0
  let exit = 1
  // Liang–Barsky clipping retains endpoints from segments that cross the viewport.
  for (const [p, q] of [
    [-dx, start[0] - bounds.left], [dx, bounds.right - start[0]],
    [-dy, start[1] - bounds.top], [dy, bounds.bottom - start[1]],
  ]) {
    if (p === 0) {
      if (q < 0) return null
    } else if (p < 0) {
      enter = Math.max(enter, q / p)
    } else {
      exit = Math.min(exit, q / p)
    }
    if (enter >= exit) return null
  }
  return [enter === 0 ? start : [start[0] + dx * enter, start[1] + dy * enter],
    exit === 1 ? end : [start[0] + dx * exit, start[1] + dy * exit]]
}

function *clipLine(line: Point[], bounds: Rectangle) {
  let part: Point[] = []
  for (let index = 1; index < line.length; index += 1) {
    const clipped = clipSegment(line[index - 1], line[index], bounds)
    if (clipped && part.length && samePoint(part[part.length - 1], clipped[0])) {
      part.push(clipped[1])
      continue
    }
    if (part.length) yield part
    part = clipped ?? []
  }
  if (part.length) yield part
}

const mercatorY = (lat: number, width: number) =>
  (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * width
const longitudeX = (lng: number, width: number) => (lng + 180) / 360 * width

export async function lookupElevationContours(
  archives: LocalElevationArchive[], viewport: Viewport, signal?: AbortSignal,
): Promise<ElevationContoursLookup> {
  if (!archives.length) return { status: 'not-installed' }
  const span = viewport.east - viewport.west
  if (viewport.zoom < minimumCameraZoom || Math.abs(span) >= 360) return { status: 'zoom-in' }
  if (span === 0 || viewport.north <= viewport.south) return { status: 'no-data' }
  const west = wrap(viewport.west + 180, 360) - 180
  const east = west + wrap(span, 360)
  const installedMax = Math.max(...archives.map(({ archive }) => archive.maxzoom))
  const dataZoom = Math.min(Math.floor(viewport.zoom), installedMax)
  const entry = archives.find(({ archive }) => archive.minzoom <= dataZoom && archive.maxzoom >= dataZoom)
  if (!entry) return { status: 'no-data' }
  const { archive } = entry
  const [westLimit, southLimit, eastLimit, northLimit] = archive.bounds
  const north = Math.min(viewport.north, maximumMercatorLatitude, northLimit)
  const south = Math.max(viewport.south, -maximumMercatorLatitude, southLimit)
  if (north <= south) return { status: 'no-data' }

  const tileCount = 2 ** dataZoom
  const size = archive.tileSize
  const width = size * tileCount
  const left = longitudeX(west, width)
  const right = longitudeX(east, width)
  const top = mercatorY(north, width)
  const bottom = mercatorY(south, width)
  const firstX = Math.floor((left - 0.5) / size)
  const lastX = Math.floor((right - 0.5) / size)
  const firstY = Math.max(0, Math.floor((top - 0.5) / size))
  const lastY = Math.min(tileCount - 1, Math.floor((bottom - 0.5) / size))
  if ((lastX - firstX + 1) * (lastY - firstY + 1) > maximumOwnerTiles) return { status: 'zoom-in' }

  const result = await withElevationTiles(entry, async (readTile): Promise<ElevationContoursLookup> => {
    const grid = loadGrid(readTile, dataZoom, size)
    const byElevation = new Map<number, Point[][]>()
    let visibleData = false
    let positions = 0
    for (let y = firstY; y <= lastY; y += 1) {
      for (let x = firstX; x <= lastX; x += 1) {
        signal?.throwIfAborted()
        const key = `${archive.sha256}/${dataZoom}/${size}/${wrap(x, tileCount)}/${y}`
        const fullTile = await readContours(key, size, () => grid(x, y), signal)
        const denseGrid = fullTile === 'too-dense' ? await grid(x, y) : null
        const originX = x * size
        const originY = y * size
        // Cut at the antimeridian before converting to GeoJSON longitudes.
        // The preceding owner tile can contain the first half pixel of a world copy.
        for (let world = Math.floor(x / tileCount); world <= Math.floor((x + 1) / tileCount); world += 1) {
          const worldX = world * width
          const bounds = {
            left: Math.max(left, worldX + longitudeX(westLimit, width)) - originX,
            right: Math.min(right, worldX + longitudeX(eastLimit, width)) - originX,
            top: top - originY, bottom: bottom - originY,
          }
          if (bounds.right <= bounds.left) continue
          // At high camera zoom only a small part of a very rough DEM tile is
          // visible. Restrict work to those cells so zooming in can still help.
          const tile = fullTile === 'too-dense'
            ? denseGrid ? buildContourTile(denseGrid, size, bounds) : emptyTile
            : fullTile
          if (tile === 'too-dense') return { status: 'zoom-in' }
          visibleData ||= hasVisibleData(tile.coverage, bounds, size)
          for (const [level, lines] of tile.byElevation) {
            for (const line of lines) {
              for (const part of clipLine(line, bounds)) {
                positions += part.length
                if (positions > maximumResponsePositions) return { status: 'zoom-in' }
                let destination = byElevation.get(level)
                if (!destination) byElevation.set(level, destination = [])
                const geographic: Point[] = part.map(([px, py]) => [
                  Math.max(-180, Math.min(180, (px + originX - worldX) / width * 360 - 180)),
                  Math.atan(Math.sinh(Math.PI * (1 - (py + originY) / width * 2))) * 180 / Math.PI,
                ])
                destination.push(geographic)
              }
            }
          }
        }
      }
    }

    if (!visibleData) return { status: 'no-data' }
    const geojson: ElevationContourGeoJSON = { type: 'FeatureCollection', features: [] }
    for (const [elevationMeters, lines] of [...byElevation].sort(([a], [b]) => a - b)) {
      geojson.features.push({
        type: 'Feature', properties: { elevationMeters },
        geometry: lines.length === 1
          ? { type: 'LineString', coordinates: lines[0] }
          : { type: 'MultiLineString', coordinates: lines },
      })
    }
    return { status: 'ok', dataZoom, intervalMeters, geojson }
  }, signal)
  return result ?? { status: 'no-data' }
}
