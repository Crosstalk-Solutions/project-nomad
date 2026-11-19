/**
 * Distance and area math for the map's Measure tool. Pure (no MapLibre/React) so it can be
 * unit tested. Coordinates are [lng, lat] in degrees, matching GeoJSON.
 */

export type LngLat = [number, number]
export type MeasureUnit = 'metric' | 'imperial' | 'nautical'

/** WGS84 equatorial radius, the sphere radius commonly used for both haversine and area. */
const EARTH_RADIUS_M = 6378137

const toRad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance between two points, in meters. */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Length of each consecutive segment, in meters. */
export function segmentLengthsMeters(points: LngLat[]): number[] {
  const lengths: number[] = []
  for (let i = 1; i < points.length; i++) lengths.push(haversineMeters(points[i - 1], points[i]))
  return lengths
}

/** Total length of a path, in meters. Pass closed=true to include the segment back to the start. */
export function pathLengthMeters(points: LngLat[], closed = false): number {
  const ring = closed && points.length > 2 ? [...points, points[0]] : points
  return segmentLengthsMeters(ring).reduce((sum, length) => sum + length, 0)
}

/**
 * Area enclosed by a ring on the sphere, in square meters (the spherical-excess formula from
 * Chamberlain & Duquette, "Some Algorithms for Polygons on a Sphere", as used by turf.js).
 * The ring may be open or closed; orientation doesn't matter.
 */
export function polygonAreaSqMeters(points: LngLat[]): number {
  if (points.length < 3) return 0
  let total = 0
  for (let i = 0; i < points.length; i++) {
    const lower = points[i]
    const middle = points[(i + 1) % points.length]
    const upper = points[(i + 2) % points.length]
    total += (toRad(upper[0]) - toRad(lower[0])) * Math.sin(toRad(middle[1]))
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2)
}

const METERS_PER_FOOT = 0.3048
const METERS_PER_MILE = 1609.344
const METERS_PER_NAUTICAL_MILE = 1852

function round(value: number, digits: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** "850 m" / "12.34 km", "420 ft" / "3.10 mi", "0.45 nm", matching the map's scale unit. */
export function formatDistance(meters: number, unit: MeasureUnit): string {
  if (unit === 'imperial') {
    const feet = meters / METERS_PER_FOOT
    if (feet < 1000) return `${round(feet, 0)} ft`
    const miles = meters / METERS_PER_MILE
    return `${round(miles, miles < 100 ? 2 : 1)} mi`
  }
  if (unit === 'nautical') {
    const nm = meters / METERS_PER_NAUTICAL_MILE
    return `${round(nm, nm < 100 ? 2 : 1)} nm`
  }
  if (meters < 1000) return `${round(meters, 0)} m`
  const km = meters / 1000
  return `${round(km, km < 100 ? 2 : 1)} km`
}

/** "640 m²" / "3.20 ha" / "45.10 km²", "2.50 acres" / "1.20 mi²", "0.80 nm²". */
export function formatArea(squareMeters: number, unit: MeasureUnit): string {
  if (unit === 'imperial') {
    const acres = squareMeters / 4046.8564224
    if (acres < 640) return `${round(acres, 2)} acres`
    return `${round(squareMeters / METERS_PER_MILE ** 2, 2)} mi²`
  }
  if (unit === 'nautical') {
    return `${round(squareMeters / METERS_PER_NAUTICAL_MILE ** 2, 2)} nm²`
  }
  if (squareMeters < 10_000) return `${round(squareMeters, 0)} m²`
  if (squareMeters < 1_000_000) return `${round(squareMeters / 10_000, 2)} ha`
  return `${round(squareMeters / 1_000_000, 2)} km²`
}
