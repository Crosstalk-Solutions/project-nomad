import type { StyleSpecification } from 'maplibre-gl'
import type { MapLayerMode } from './LayerSelector.js'
import type { MapCamera } from './mapLayerStyles.js'
import { chooseElevationCoverage } from '../../../types/elevation_coverage.js'

type Bounds = [west: number, south: number, east: number, north: number]
type Rectangle = { west: number; south: number; east: number; north: number }
type Kind = 'raster' | 'vector'

export type DetailSourceSummary = {
  id: string
  label: string
  kind: Kind
  nativeZoom: number
  sourceMaxZoom: number
  tileSize: number
  regional: boolean
}

export type DetailDemSource = {
  id?: string
  filename?: string
  label?: string
  bounds: Bounds
  minzoom?: number
  maxzoom: number
  tileSize?: number
  regional?: boolean
}

export type MapDetailSummary = {
  availability: 'available' | 'unknown' | 'missing' | 'checking'
  currentZoom: number
  primaryKind?: Kind
  centerNativeZoom?: number
  enlarged: boolean
  enlargementFactor?: number
  /** Finest installed source sampling, not screen-pixel scale or positional accuracy. */
  sampleMeters?: number
  centerSource?: DetailSourceSummary
  mixed: boolean
  missingInView: boolean
  unknownInView?: boolean
  viewMinNativeZoom?: number
  viewMaxNativeZoom?: number
  coarserAreasEnlarged: boolean
  sourcesSummary: DetailSourceSummary[]
  contoursOnly?: boolean
  dem?: {
    nativeZoom: number
    sampleMeters: number
    enlarged: boolean
    regional: boolean
    sourceLabel: string
    coverage?: 'full' | 'partial'
  }
}

type Candidate = {
  id: string
  label: string
  kind: Kind
  max?: number
  tileSize: number
  regional: boolean
  bounds: Bounds
  priority: number
}
type Input = {
  /** Include available progressive zoom bands, even when the current LOD does not draw them. */
  style: StyleSpecification | null
  camera: MapCamera
  mode: MapLayerMode
  demSources?: DetailDemSource[]
  checking?: boolean
}

const EPS = 1e-8
const MERCATOR_LATITUDE = 85.0511287798066
const WORLD: Bounds = [-180, -MERCATOR_LATITUDE, 180, MERCATOR_LATITUDE]
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const normalize = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180
const enlarged = (zoom: number, native: number) => zoom > native + .001

function validBounds(value: unknown): value is Bounds {
  return Array.isArray(value) && value.length === 4 && value.every(finite)
    && value[1] < value[3] && value[1] >= -90 && value[3] <= 90
    && Math.abs(value[2] - value[0]) <= 360 + EPS
}

function sourceLabel(mode: MapLayerMode, regional: boolean, id: string) {
  if (regional) {
    const match = /local-detail-(\d+)-(\d+)/.exec(id)
    if (match) {
      let n = Number(match[1]) + 1, column = ''
      while (n > 0) { n--; column = String.fromCharCode(65 + n % 26) + column; n = Math.floor(n / 26) }
      return 'Regional square ' + column + (Number(match[2]) + 1)
    }
    return 'Regional ' + (mode === 'street' ? 'Street' : mode === 'aerial' ? 'satellite' : 'relief')
  }
  return mode === 'street' ? 'Worldwide Street' : mode === 'aerial' ? 'Worldwide satellite'
    : mode === 'topographic' ? 'Earth Relief' : 'Blue Marble'
}

function collect(style: StyleSpecification, mode: MapLayerMode) {
  const sources = new Map<string, Candidate>()
  let malformed = false
  style.layers.forEach((layer, index) => {
    if (!('source' in layer) || typeof layer.source !== 'string' || layer.layout?.visibility === 'none') return
    const source = style.sources[layer.source]
    if (!source || source.type !== 'raster' && source.type !== 'vector') return
    const metadata = layer.metadata as Record<string, unknown> | undefined
    const role = metadata?.['nomad:role']
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
    const relevant = mode === 'street'
      ? source.type === 'vector' && !role && sourceLayer !== 'hillshade-vectors'
      : mode === 'topographic'
        ? role === 'topographic' && (source.type === 'raster' || sourceLayer === 'hillshade-vectors')
        : role === mode
    if (!relevant) return
    if (source.bounds !== undefined && !validBounds(source.bounds)) { malformed = true; return }
    const bounds = [...(source.bounds ?? WORLD)] as Bounds
    // PMTiles stores bounds at E7 precision. Snap only the Mercator world
    // limits, avoiding a false missing strip a few millimetres wide.
    if (Math.abs(bounds[1] + MERCATOR_LATITUDE) < 1e-6) bounds[1] = -MERCATOR_LATITUDE
    if (Math.abs(bounds[3] - MERCATOR_LATITUDE) < 1e-6) bounds[3] = MERCATOR_LATITUDE
    const width = bounds[2] >= bounds[0] ? bounds[2] - bounds[0] : bounds[2] + 360 - bounds[0]
    const regional = metadata?.['nomad:local-detail'] === true
      || width < 359.999 || bounds[1] > -85 || bounds[3] < 85
    const maximum = finite(source.maxzoom) && source.maxzoom >= 0 && source.maxzoom <= 24 ? source.maxzoom : undefined
    const kind: Kind = source.type === 'raster' ? 'raster' : 'vector'
    const tileSize = source.type === 'raster' && finite(source.tileSize) && source.tileSize > 0 ? source.tileSize : 512
    sources.set(layer.source, {
      id: layer.source, label: sourceLabel(mode, regional, layer.source), kind,
      max: maximum, tileSize, regional, bounds: [...bounds] as Bounds, priority: index,
    })
  })
  return { candidates: [...sources.values()].sort((a, b) => b.priority - a.priority), malformed }
}

function nativeZoom(candidate: Candidate) {
  return candidate.max === undefined ? undefined : candidate.max
    + (candidate.kind === 'raster' ? Math.log2(candidate.tileSize / 512) : 0)
}

function summary(candidate: Candidate): DetailSourceSummary | undefined {
  const native = nativeZoom(candidate)
  return native === undefined || candidate.max === undefined ? undefined : {
    id: candidate.id, label: candidate.label, kind: candidate.kind, nativeZoom: native,
    sourceMaxZoom: candidate.max, tileSize: candidate.tileSize, regional: candidate.regional,
  }
}

function viewRectangle(camera: MapCamera): Rectangle | undefined {
  if (!camera.view || !camera.view.every(finite)) return
  const [west, south, rawEast, north] = camera.view
  let east = rawEast
  if (east < west) east += Math.ceil((west - east) / 360) * 360
  if (east - west > 360) east = west + 360
  const result = { west, east, south: Math.max(-MERCATOR_LATITUDE, south), north: Math.min(MERCATOR_LATITUDE, north) }
  return result.east - result.west > EPS && result.north - result.south > EPS ? result : undefined
}

function sourceRectangles(bounds: Bounds, view: Rectangle) {
  const [west, south, originalEast, north] = bounds
  const east = originalEast < west ? originalEast + 360 : originalEast
  if (east - west >= 360 - EPS) return [{ west: view.west, east: view.east, south, north }]
  const first = Math.floor((view.west - east) / 360), last = Math.ceil((view.east - west) / 360)
  const rectangles: Rectangle[] = []
  for (let copy = first; copy <= last; copy++) {
    const rectangle = { west: west + copy * 360, east: east + copy * 360, south, north }
    if (intersection(rectangle, view)) rectangles.push(rectangle)
  }
  return rectangles
}

function intersection(a: Rectangle, b: Rectangle): Rectangle | undefined {
  const rect = { west: Math.max(a.west, b.west), south: Math.max(a.south, b.south),
    east: Math.min(a.east, b.east), north: Math.min(a.north, b.north) }
  return rect.east - rect.west > EPS && rect.north - rect.south > EPS ? rect : undefined
}

function subtract(area: Rectangle, cut: Rectangle): Rectangle[] {
  const overlap = intersection(area, cut)
  if (!overlap) return [area]
  const rest: Rectangle[] = []
  if (overlap.south - area.south > EPS) rest.push({ ...area, north: overlap.south })
  if (area.north - overlap.north > EPS) rest.push({ ...area, south: overlap.north })
  if (overlap.west - area.west > EPS) rest.push({ west: area.west, east: overlap.west, south: overlap.south, north: overlap.north })
  if (area.east - overlap.east > EPS) rest.push({ west: overlap.east, east: area.east, south: overlap.south, north: overlap.north })
  return rest
}

function containsPoint(candidate: Candidate, longitude: number, latitude: number) {
  if (latitude < candidate.bounds[1] - EPS || latitude > candidate.bounds[3] + EPS) return false
  const [west, , rawEast] = candidate.bounds
  const east = rawEast < west ? rawEast + 360 : rawEast
  if (east - west >= 360 - EPS) return true
  const point = normalize(longitude), shift = Math.floor((west - point) / 360)
  return [shift, shift + 1].some((copy) => point + copy * 360 >= west - EPS && point + copy * 360 <= east + EPS)
}

function effectiveSources(candidates: Candidate[], view: Rectangle) {
  let uncovered = [view]
  const owners = new Map<string, Candidate>()
  for (const source of candidates) {
    for (const bounds of sourceRectangles(source.bounds, view)) {
      const next: Rectangle[] = []
      for (const piece of uncovered) {
        if (intersection(piece, bounds)) owners.set(source.id, source)
        next.push(...subtract(piece, bounds))
      }
      uncovered = next
      // An unusually fragmented inventory must remain an honest uncertainty, not stall map movement.
      if (uncovered.length > 4096) return { owners: [...owners.values()], missing: false, uncertain: true }
    }
    if (!uncovered.length) break
  }
  return { owners: [...owners.values()], missing: uncovered.length > 0, uncertain: false }
}

function sampling(source: DetailSourceSummary, latitude: number, mode: MapLayerMode) {
  if (source.kind !== 'raster') return undefined
  const pixel = 40075016.68557849 * Math.cos(Math.min(MERCATOR_LATITUDE, Math.abs(latitude)) * Math.PI / 180)
    / (source.tileSize * 2 ** source.sourceMaxZoom)
  const nasa = mode === 'blue-marble' ? ({ 4: 8000, 6: 2000, 8: 500 } as Record<number, number>)[source.sourceMaxZoom] : undefined
  return nasa === undefined ? pixel : Math.max(pixel, nasa)
}

function describeDem(input: Input): MapDetailSummary['dem'] {
  const candidates = (input.demSources ?? []).filter((source) => validBounds(source.bounds) && finite(source.maxzoom))
  if (!candidates.length) return
  const viewport = viewRectangle(input.camera)
  const query = viewport && {
    west: Math.floor((viewport.west - (viewport.east - viewport.west) * .15) * 1e6) / 1e6,
    east: Math.ceil((viewport.east + (viewport.east - viewport.west) * .15) * 1e6) / 1e6,
    south: Math.max(-MERCATOR_LATITUDE, Math.floor((viewport.south - (viewport.north - viewport.south) * .15) * 1e6) / 1e6),
    north: Math.min(MERCATOR_LATITUDE, Math.ceil((viewport.north + (viewport.north - viewport.south) * .15) * 1e6) / 1e6),
  }
  const plan = chooseElevationCoverage(candidates, query ? [query.west, query.south, query.east, query.north]
    : [input.camera.longitude - .000001, input.camera.latitude - .000001, input.camera.longitude + .000001, input.camera.latitude + .000001], 24)
  if (!plan) return
  const source = plan.sources[0]
  const count = plan.sources.filter((entry) => entry.regional ?? entry.filename?.startsWith('partial-z8-') ?? false).length
  const regional = count > 0
  return {
    nativeZoom: plan.dataZoom,
    sampleMeters: 40075016.68557849 * Math.cos(Math.min(MERCATOR_LATITUDE, Math.abs(input.camera.latitude)) * Math.PI / 180)
      / (plan.tileSize * 2 ** plan.dataZoom),
    enlarged: enlarged(input.camera.zoom, plan.dataZoom), regional,
    sourceLabel: (count > 1 ? `Regional elevation · ${count} squares` : source.label ?? (regional ? 'Regional elevation data' : 'Worldwide elevation data'))
      + (plan.complete ? '' : ' · partial coverage'), coverage: plan.complete ? 'full' : 'partial',
  }
}

export function describeMapDetail(input: Input): MapDetailSummary {
  const { camera, style, mode } = input
  const result: MapDetailSummary = { availability: input.checking ? 'checking' : 'missing', currentZoom: camera.zoom,
    enlarged: false, mixed: false, missingInView: false, coarserAreasEnlarged: false, sourcesSummary: [] }
  if (!finite(camera.zoom) || !finite(camera.longitude) || !finite(camera.latitude)) return { ...result, availability: 'unknown' }
  if (mode === 'topographic') result.dem = describeDem(input)
  if (!style) return { ...result, availability: input.checking ? 'checking' : 'unknown' }
  const { candidates, malformed } = collect(style, mode)
  const center = candidates.find((source) => containsPoint(source, camera.longitude, camera.latitude))
  const centerSummary = center && summary(center)
  const view = viewRectangle(camera)
  const visible = view ? effectiveSources(candidates, view) : { owners: center ? [center] : [], missing: !center, uncertain: false }
  result.sourcesSummary = visible.owners.flatMap((owner) => { const value = summary(owner); return value ? [value] : [] })
  const levels = [...new Set(result.sourcesSummary.map((source) => source.nativeZoom))].sort((a, b) => a - b)
  result.mixed = levels.length > 1
  result.missingInView = visible.missing
  result.unknownInView = visible.uncertain || visible.owners.some((source) => nativeZoom(source) === undefined)
  result.viewMinNativeZoom = levels[0]
  result.viewMaxNativeZoom = levels.at(-1)
  if (centerSummary) {
    result.availability = 'available'; result.centerSource = centerSummary; result.primaryKind = centerSummary.kind
    result.centerNativeZoom = centerSummary.nativeZoom; result.enlarged = enlarged(camera.zoom, centerSummary.nativeZoom)
    result.enlargementFactor = 2 ** Math.max(0, camera.zoom - centerSummary.nativeZoom)
    result.sampleMeters = sampling(centerSummary, camera.latitude, mode)
    result.coarserAreasEnlarged = levels.some((zoom) => zoom < centerSummary.nativeZoom - EPS && enlarged(camera.zoom, zoom))
  } else {
    result.availability = input.checking ? 'checking' : center || malformed ? 'unknown' : 'missing'
    result.primaryKind = center?.kind
  }
  if (!candidates.length && mode === 'topographic' && result.dem) {
    const dem = result.dem
    result.availability = 'available'; result.contoursOnly = true; result.primaryKind = 'raster'
    result.centerNativeZoom = dem.nativeZoom; result.enlarged = dem.enlarged
    result.enlargementFactor = 2 ** Math.max(0, camera.zoom - dem.nativeZoom)
    result.sampleMeters = dem.sampleMeters
    result.missingInView = dem.coverage === 'partial'
    result.viewMinNativeZoom = dem.nativeZoom; result.viewMaxNativeZoom = dem.nativeZoom
  }
  return result
}
