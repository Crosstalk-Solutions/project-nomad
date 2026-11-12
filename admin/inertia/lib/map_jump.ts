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
