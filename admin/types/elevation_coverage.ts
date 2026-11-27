/** Shared, offline source planning for the contour renderer and its detail indicator. */
export type ElevationBounds = [west: number, south: number, east: number, north: number]
export type ElevationCoverageSource = {
  bounds: ElevationBounds; minzoom?: number; maxzoom: number; tileSize?: number
  filename?: string; id?: string
}
export type ElevationCoverage<T> = { sources: T[]; dataZoom: number; tileSize: number; complete: boolean }
type Rectangle = { west: number; south: number; east: number; north: number }
const EPS = 1e-8
const LAT = 85.0511287798066
const wrap = (v: number) => ((v + 180) % 360 + 360) % 360 - 180

export function elevationView(bounds: ElevationBounds): Rectangle | undefined {
  if (!bounds.every(Number.isFinite) || bounds[1] >= bounds[3]) return
  const west = wrap(bounds[0])
  let span = bounds[2] - bounds[0]
  if (span < 0) span = (span % 360 + 360) % 360
  if (span <= EPS || span > 360 + EPS) return
  return { west, east: west + span, south: Math.max(-LAT, bounds[1]), north: Math.min(LAT, bounds[3]) }
}

function intersect(a: Rectangle, b: Rectangle): Rectangle | undefined {
  const value = { west: Math.max(a.west, b.west), south: Math.max(a.south, b.south),
    east: Math.min(a.east, b.east), north: Math.min(a.north, b.north) }
  return value.east - value.west > EPS && value.north - value.south > EPS ? value : undefined
}

function pieces(bounds: ElevationBounds, view: Rectangle) {
  const [west, rawSouth, rawEast, rawNorth] = bounds
  const south = Math.abs(rawSouth + LAT) < 1e-6 ? -LAT : rawSouth
  const north = Math.abs(rawNorth - LAT) < 1e-6 ? LAT : rawNorth
  const east = rawEast < west ? rawEast + 360 : rawEast
  if (east - west >= 360 - EPS) return [{ west: view.west, east: view.east, south, north }]
  const result: Rectangle[] = []
  for (let shift = Math.floor((view.west - east) / 360); shift <= Math.ceil((view.east - west) / 360); shift++) {
    const value = { west: west + shift * 360, east: east + shift * 360, south, north }
    if (intersect(value, view)) result.push(value)
  }
  return result
}

function subtract(area: Rectangle, cut: Rectangle) {
  const overlap = intersect(area, cut)
  if (!overlap) return [area]
  const result: Rectangle[] = []
  if (overlap.south - area.south > EPS) result.push({ ...area, north: overlap.south })
  if (area.north - overlap.north > EPS) result.push({ ...area, south: overlap.north })
  if (overlap.west - area.west > EPS) result.push({ west: area.west, east: overlap.west, south: overlap.south, north: overlap.north })
  if (area.east - overlap.east > EPS) result.push({ west: overlap.east, east: area.east, south: overlap.south, north: overlap.north })
  return result
}

function ownership<T extends ElevationCoverageSource>(sources: T[], view: Rectangle) {
  let uncovered = [view]
  const owners: T[] = []
  for (const source of sources) {
    let used = false
    for (const rectangle of pieces(source.bounds, view)) {
      const next: Rectangle[] = []
      for (const area of uncovered) {
        if (intersect(area, rectangle)) used = true
        next.push(...subtract(area, rectangle))
      }
      uncovered = next
      if (uncovered.length > 4096) return { owners, complete: false }
    }
    if (used) owners.push(source)
    if (!uncovered.length) break
  }
  return { owners, complete: uncovered.length === 0 }
}

export function elevationContains(bounds: ElevationBounds, longitude: number, latitude: number) {
  if (latitude < bounds[1] - EPS || latitude > bounds[3] + EPS) return false
  const [west, , rawEast] = bounds, east = rawEast < west ? rawEast + 360 : rawEast
  if (east - west >= 360 - EPS) return true
  const point = wrap(longitude), shift = Math.floor((west - point) / 360)
  return [shift, shift + 1].some((copy) => point + copy * 360 >= west - EPS && point + copy * 360 <= east + EPS)
}

/** One native grid per response: union adjacent sources or fall back coherently. */
export function chooseElevationCoverage<T extends ElevationCoverageSource>(
  available: T[], bounds: ElevationBounds, requestedZoom: number,
): ElevationCoverage<T> | undefined {
  const view = elevationView(bounds)
  if (!view || !Number.isFinite(requestedZoom)) return
  const sources = available.filter((source) => Array.isArray(source.bounds) && source.bounds.length === 4
    && source.bounds.every(Number.isFinite) && source.bounds[1] < source.bounds[3]
    && Number.isInteger(source.maxzoom) && source.maxzoom >= 0 && source.maxzoom <= 24
    && Number.isInteger(source.minzoom ?? 0) && (source.minzoom ?? 0) <= source.maxzoom
    && [256, 512].includes(source.tileSize ?? 512))
    .sort((a, b) => b.maxzoom - a.maxzoom || ((a.filename ?? a.id ?? '') < (b.filename ?? b.id ?? '') ? -1
      : (a.filename ?? a.id ?? '') === (b.filename ?? b.id ?? '') ? 0 : 1))
  const maximum = Math.min(Math.floor(requestedZoom), sources.reduce((max, source) => Math.max(max, source.maxzoom), -1))
  let partial: ElevationCoverage<T> | undefined
  for (let zoom = maximum; zoom >= 0; zoom--) {
    const eligible = sources.filter((source) => (source.minzoom ?? 0) <= zoom && source.maxzoom >= zoom)
    for (const tileSize of [512, 256]) {
      const group = eligible.filter((source) => (source.tileSize ?? 512) === tileSize)
      if (!group.length) continue
      // A complete single archive avoids mixing revisions needlessly at a
      // coarse zoom. Otherwise the ordered regional sources form one mosaic.
      const single = group.find((source) => ownership([source], view).complete)
      if (single) return { sources: [single], dataZoom: zoom, tileSize, complete: true }
      const covered = ownership(group, view)
      if (covered.complete) return { sources: covered.owners, dataZoom: zoom, tileSize, complete: true }
      if (!partial && covered.owners.length) partial = { sources: covered.owners, dataZoom: zoom, tileSize, complete: false }
    }
  }
  return partial
}
