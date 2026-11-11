import type { MapRegionCoverage } from '../../types/map_regions.js'

function inRing(lon: number, lat: number, ring: number[][]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i],
      [previousX, previousY] = ring[j]
    if (y > lat !== previousY > lat && lon < ((previousX - x) * (lat - y)) / (previousY - y) + x)
      inside = !inside
  }
  return inside
}
export function regionContains(coverage: MapRegionCoverage, point: { lat: number; lon: number }) {
  const [west, south, east, north] = coverage.bbox
  if (point.lon < west || point.lon > east || point.lat < south || point.lat > north) return false
  if (!coverage.polygon) return true
  const polygons = (
    coverage.polygon.type === 'Polygon'
      ? [coverage.polygon.coordinates]
      : coverage.polygon.coordinates
  ) as number[][][][]
  return polygons.some(
    (rings) =>
      rings.length &&
      inRing(point.lon, point.lat, rings[0]) &&
      !rings.slice(1).some((ring) => inRing(point.lon, point.lat, ring))
  )
}
