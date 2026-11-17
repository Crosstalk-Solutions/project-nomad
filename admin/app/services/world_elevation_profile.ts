import type { ElevationProfileLookup, ElevationProfileSample, WorldArchive } from '../../types/world_offline.js'
import { elevationTilePixel, type LocalElevationArchive, withElevationTiles, withinElevationCoverage } from './world_elevation_service.js'

const earthMeanRadius = 6_371_008.8
const equatorialCircumference = 2 * Math.PI * 6_378_137
const toRadians = Math.PI / 180
const maxSamples = 512
const maxTiles = 128
type Point = Pick<ElevationProfileSample, 'lat' | 'lng'>
type Vector = [number, number, number]
type TileSamples = { x: number; y: number; pixels: { sample: ElevationProfileSample; offset: number }[] }

function unitVector({ lat, lng }: Point): Vector {
  const phi = lat * toRadians
  const lambda = lng * toRadians
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)]
}

function cross([ax, ay, az]: Vector, [bx, by, bz]: Vector): Vector {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]
}

function geodesic(a: Point, b: Point) {
  const start = unitVector(a)
  const end = unitVector(b)
  const normal = cross(start, end)
  const sine = Math.hypot(...normal)
  const cosine = start[0] * end[0] + start[1] * end[1] + start[2] * end[2]
  const angle = Math.atan2(sine, cosine)
  if (angle < 1e-12) return { distanceMeters: 0, point: () => a }

  // Antipodes have no unique shortest path. Use a deterministic eastward tangent.
  const tangent = sine > 1e-12
    ? cross([normal[0] / sine, normal[1] / sine, normal[2] / sine], start)
    : [-Math.sin(a.lng * toRadians), Math.cos(a.lng * toRadians), 0] as Vector

  return {
    distanceMeters: angle * earthMeanRadius,
    point(fraction: number): Point {
      if (fraction === 0) return a
      if (fraction === 1) return b
      const c = Math.cos(angle * fraction)
      const s = Math.sin(angle * fraction)
      const x = c * start[0] + s * tangent[0]
      const y = c * start[1] + s * tangent[1]
      const z = c * start[2] + s * tangent[2]
      return { lat: Math.atan2(z, Math.hypot(x, y)) / toRadians, lng: Math.atan2(y, x) / toRadians }
    },
  }
}

function planSamples(path: ReturnType<typeof geodesic>, segments: number, archive: WorldArchive) {
  const stepMeters = segments ? path.distanceMeters / segments : 0
  const samples: ElevationProfileSample[] = []
  const groups = new Map<string, TileSamples>()
  for (let i = 0; i <= segments; i += 1) {
    const { lat, lng } = path.point(segments ? i / segments : 0)
    const sample = { lat, lng, distanceMeters: i === segments ? path.distanceMeters : stepMeters * i, elevationMeters: null, zoom: null }
    samples.push(sample)
    const longitude = lng === 180 ? -180 : lng
    if (!withinElevationCoverage(archive, lat, longitude)) continue

    const { tileX, tileY, pixelOffset } = elevationTilePixel(lat, longitude, archive.maxzoom, archive.tileSize)
    const key = `${tileX}/${tileY}`
    if (!groups.has(key)) groups.set(key, { x: tileX, y: tileY, pixels: [] })
    groups.get(key)!.pixels.push({ sample, offset: pixelOffset })
  }
  return { stepMeters, samples, groups }
}

export async function lookupElevationProfile(
  archives: LocalElevationArchive[],
  a: Point,
  b: Point,
  signal?: AbortSignal,
): Promise<ElevationProfileLookup> {
  if (!archives.length) return { status: 'not-installed' }
  const entry = archives.reduce((highest, candidate) =>
    candidate.archive.maxzoom > highest.archive.maxzoom ? candidate : highest)
  const { archive } = entry
  const path = geodesic(a, b)
  const nativeSpacing = equatorialCircumference * Math.cos(path.point(0.5).lat * toRadians) /
    (archive.tileSize * 2 ** archive.maxzoom)
  let segments = Math.min(maxSamples - 1, Math.ceil(path.distanceMeters / Math.max(1, nativeSpacing)))
  let plan = planSamples(path, segments, archive)
  while (plan.groups.size > maxTiles) {
    segments = Math.ceil(segments / 2)
    plan = planSamples(path, segments, archive)
  }

  if (!plan.groups.size) return { status: 'no-data' }
  const hasSamples = await withElevationTiles(entry, async (readTile) => {
    let found = false
    for (const group of plan.groups.values()) {
      const tile = await readTile(archive.maxzoom, group.x, group.y)
      if (!tile) continue
      // Decode once for this tile and release its pixels before reading the next tile.
      for (const { sample, offset } of group.pixels) {
        const elevation = tile(offset)
        if (elevation === null) continue
        sample.elevationMeters = elevation
        sample.zoom = archive.maxzoom
        found = true
      }
    }
    signal?.throwIfAborted()
    return found
  }, signal)

  return hasSamples
    ? { status: 'ok', distanceMeters: path.distanceMeters, stepMeters: plan.stepMeters, samples: plan.samples }
    : { status: 'no-data' }
}
