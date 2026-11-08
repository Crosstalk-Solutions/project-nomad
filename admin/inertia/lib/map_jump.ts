/**
 * Pure helpers behind the map's "Jump to: region or lat,lng" box. Kept free of
 * React/MapLibre so they can be unit tested.
 */

export type JumpRegion = {
  file: string
  label: string
  /** Root-relative URL the region's .pmtiles file is served from */
  url: string
}

export type LngLatBounds = {
  west: number
  south: number
  /** Eastern edge. Exceeds 180 for a region that crosses the antimeridian, which MapLibre's
   *  fitBounds accepts and frames across the date line instead of around the whole world. */
  east: number
  north: number
}

export type { MapPlaceResult as PlaceResult } from '../../types/maps.js'

/** Lowercase without diacritics, for client-side matching ("Bosna i Herceg" ~ "bosna"). */
export function foldForMatch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim()
}

/** Downloaded regions whose label contains the query (all of them for an empty query). */
export function filterRegions<T extends JumpRegion>(query: string, regions: T[]): T[] {
  const wanted = foldForMatch(query)
  if (!wanted) return regions
  return regions.filter((region) => foldForMatch(region.label).includes(wanted))
}

/** "tram_stop" -> "Tram stop" */
export function placeKindLabel(kind: string): string {
  const words = kind.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** How far to zoom in on a picked place: a city shows the city, a shop shows the street. */
export function zoomForPlace(layer: string, kind: string): number {
  if (layer === 'places') {
    if (kind === 'country') return 6
    if (kind === 'region') return 8
    if (kind === 'city') return 12
    if (kind === 'town') return 13
    if (kind === 'village' || kind === 'macrohood') return 14
    return 15
  }
  if (layer === 'water') return 14
  if (layer === 'roads') return 16
  if (layer === 'earth') return 12
  return 17
}

/** "850 m" / "12 km" / "0.4 mi" for the search results, following the map scale unit. */
export function formatPlaceDistance(km: number, unit: string | null): string {
  if (unit === 'imperial') {
    const miles = km / 1.609344
    return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`
  }
  if (unit === 'nautical') {
    const nm = km / 1.852
    return nm < 10 ? `${nm.toFixed(1)} nm` : `${Math.round(nm)} nm`
  }
  if (km < 1) return `${Math.round(km * 1000)} m`
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}

/** Parse "lat,lng" (spaces allowed). Returns null for anything else or out-of-range values. */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const parts = text.split(',').map((value) => value.trim())
  if (parts.length !== 2 || parts.some((p) => p === '')) return null

  const lat = Number(parts[0])
  const lng = Number(parts[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

/**
 * The region whose label exactly matches the text, ignoring case and surrounding spaces.
 * Exact matching (not prefix matching) is deliberate: picking from the datalist fills the
 * box with the full label without a keypress, and that is the moment to jump.
 */
export function findRegionByLabel<T extends JumpRegion>(text: string, regions: T[]): T | null {
  const wanted = text.trim().toLowerCase()
  if (!wanted) return null
  return regions.find((region) => region.label.toLowerCase() === wanted) ?? null
}

/** Header bounds spanning more than this many degrees are treated as "crosses the antimeridian". */
export const ANTIMERIDIAN_SPAN_THRESHOLD = 350

export function crossesAntimeridian(bounds: LngLatBounds): boolean {
  return bounds.east - bounds.west > ANTIMERIDIAN_SPAN_THRESHOLD
}

/**
 * Given which of the `n` equal-width tile columns at some zoom contain data (column 0 starts
 * at -180°), find the longitude range that covers the data by cutting the world at the
 * largest run of empty columns, wrapping around the antimeridian.
 *
 * Returns null when no column has data. When every column has data the region really does
 * span the globe, and the full [-180, 180] range is returned.
 */
export function lngRangeFromOccupiedColumns(
  occupied: boolean[]
): { west: number; east: number } | null {
  const n = occupied.length
  if (n === 0 || !occupied.some(Boolean)) return null
  if (occupied.every(Boolean)) return { west: -180, east: 180 }

  // Longest circular run of empty columns.
  let bestStart = 0
  let bestLength = 0
  for (let start = 0; start < n; start++) {
    if (occupied[start] || !occupied[(start - 1 + n) % n]) continue // only start runs after data
    let length = 0
    while (length < n && !occupied[(start + length) % n]) length++
    if (length > bestLength) {
      bestLength = length
      bestStart = start
    }
  }

  const width = 360 / n
  // Data starts right after the gap and ends right before it.
  const firstDataColumn = (bestStart + bestLength) % n
  const lastDataColumn = (bestStart - 1 + n) % n

  const west = -180 + firstDataColumn * width
  let east = -180 + (lastDataColumn + 1) * width
  if (east <= west) east += 360
  return { west, east }
}

/** Web-mercator tile row containing a latitude at zoom z (clamped to the valid range). */
export function latToTileY(lat: number, z: number): number {
  const n = 2 ** z
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat))
  const rad = (clamped * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n)
  return Math.max(0, Math.min(n - 1, y))
}
