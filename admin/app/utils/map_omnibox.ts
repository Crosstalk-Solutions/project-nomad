import { formatMapPoint, parseMapPoint } from './map_route_link.js'

export type OmniboxPlace = {
  id: string
  label: string
  lat: number
  lon: number
  kind: string
  precision: string
  source: string
  regionId: string
  bbox?: [number, number, number, number]
}
export type SearchCenter = { lat: number; lon: number }
export type SearchBounds = [number, number, number, number]
export type SearchMapView = SearchCenter & { bounds?: SearchBounds }
export type BrowserMapBase = SearchCenter & { label: string }
export const MAP_BASE_STORAGE_KEY = 'nomad:map-search-base:v1'
const WEB_MERCATOR_LATITUDE = (Math.atan(Math.sinh(Math.PI)) * 180) / Math.PI

/** Map events can come from a repeated world copy outside the WGS84 longitude range. */
export function normalizeMapEventPoint(point: SearchCenter): SearchCenter {
  const { lat, lon } = point
  return {
    lat,
    lon: Math.abs(lon) <= 180 ? lon : ((((lon + 180) % 360) + 360) % 360) - 180,
  }
}

/** Limit the camera frame to the projection, leaving the original points intact. */
export function mapFramingBounds(bounds: SearchBounds): SearchBounds | null {
  const [west, south, east, north] = bounds
  if (!bounds.every(Number.isFinite) || south > north) return null
  const latitude = (value: number) =>
    Math.max(-WEB_MERCATOR_LATITUDE, Math.min(WEB_MERCATOR_LATITUDE, value))
  return [west, latitude(south), east, latitude(north)]
}

export function validSearchCenter(value: unknown): value is SearchCenter {
  const point = value as SearchCenter | null
  return (
    !!point &&
    typeof point.lat === 'number' &&
    typeof point.lon === 'number' &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180
  )
}

export function parseBrowserMapBase(raw: string | null): BrowserMapBase | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    const label = value && typeof value === 'object' ? value.label : undefined
    if (
      !validSearchCenter(value) ||
      typeof label !== 'string' ||
      !label.trim() ||
      label.length > 180
    )
      return null
    return { lat: value.lat, lon: value.lon, label: label.trim() }
  } catch {
    return null
  }
}

/** The field resolves coordinates locally; it never performs a data lookup. */
export function classifyOmniboxQuery(
  query: string
): 'coordinates' | 'invalid-coordinates' | 'unsupported' | 'empty' {
  const text = query.trim()
  if (!text) return 'empty'
  if (parseMapPoint(text)) return 'coordinates'
  if (text.includes(',') && /^[\d+\-.,\seE]+$/.test(text) && /\d/.test(text))
    return 'invalid-coordinates'
  return 'unsupported'
}

export function coordinateOmniboxPlace(query: string): OmniboxPlace | null {
  const point = parseMapPoint(query)
  return point
    ? {
        ...point,
        id: 'coordinates:' + formatMapPoint(point),
        label: formatMapPoint(point),
        kind: 'coordinates',
        precision: 'coordinates',
        source: 'Entered coordinates',
        regionId: 'coordinates',
      }
    : null
}

/** MapLibre can report world copies beyond +/-180; preserve antimeridian extents. */
export function normalizedMapBounds(raw: number[]): SearchBounds | undefined {
  if (raw.length !== 4 || !raw.every(Number.isFinite) || raw[1] > raw[3]) return undefined
  const longitude = (value: number) => ((((value + 180) % 360) + 360) % 360) - 180
  const [west, south, east, north] = raw
  const wholeWorld = Math.abs(east - west) >= 360
  const latitude = (value: number) => Math.max(-90, Math.min(90, value))
  return [
    wholeWorld ? -180 : longitude(west),
    latitude(south),
    wholeWorld ? 180 : east === 180 ? 180 : longitude(east),
    latitude(north),
  ]
}

export function unresolvedRouteInput(query: string) {
  const point = parseMapPoint(query)
  return {
    query,
    value: point ? formatMapPoint(point) : '',
    label: undefined,
    precision: undefined,
    source: undefined,
  }
}

export function resolvedRouteInput(place: OmniboxPlace) {
  return {
    value: formatMapPoint(place),
    query: place.label,
    label: place.label,
    precision: place.precision,
    source: place.source,
  }
}
