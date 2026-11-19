/**
 * Turns features under a map click into the "place info" shown in a popup. Pure (no MapLibre)
 * so it can be unit tested. Property names follow the Protomaps basemap tiles NOMAD serves:
 * `name`, `name:en`, `kind`, `kind_detail`, `elevation`.
 */

/** Tile layers whose labels can be clicked for details, in order of preference. */
export const PLACE_SOURCE_LAYERS = ['pois', 'places', 'water', 'roads'] as const

export type ClickedFeature = {
  sourceLayer?: string
  properties: Record<string, unknown> | null | undefined
  /** The feature's own point, when it is a point feature; lines/areas use the click location */
  point?: [number, number] | null
}

export type PlaceInfo = {
  name: string
  /** English name, only when it differs from `name` */
  englishName: string | null
  /** Readable type, e.g. "Supermarket", "Town", "Street" */
  type: string
  /** Meters, for peaks and other features that carry it */
  elevation: number | null
  /** [lng, lat] of the feature if it is a point, else null (the caller uses the click) */
  point: [number, number] | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** "bus_stop" -> "Bus stop" */
export function humanizeKind(kind: string): string {
  const words = kind.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const PLACE_KINDS: Record<string, string> = {
  country: 'Country',
  region: 'Region',
  macrohood: 'District',
  neighbourhood: 'Neighbourhood',
  microhood: 'Neighbourhood',
}

const ROAD_KINDS: Record<string, string> = {
  highway: 'Highway',
  major_road: 'Main road',
  minor_road: 'Street',
  path: 'Path',
  rail: 'Railway',
  ferry: 'Ferry route',
  aerialway: 'Aerial lift',
}

function typeLabel(sourceLayer: string, kind: string | null, detail: string | null): string {
  if (sourceLayer === 'places') {
    // Localities carry their size in kind_detail: city / town / village / hamlet …
    if (kind === 'locality' && detail) return humanizeKind(detail)
    if (detail === 'quarter' || detail === 'suburb') return humanizeKind(detail)
    if (kind && PLACE_KINDS[kind]) return PLACE_KINDS[kind]
  }
  if (sourceLayer === 'roads') {
    if (kind === 'minor_road' && detail === 'service') return 'Service road'
    if (kind && ROAD_KINDS[kind]) return ROAD_KINDS[kind]
  }
  if (kind) return humanizeKind(kind)
  if (detail) return humanizeKind(detail)
  return 'Place'
}

/** Place info for one feature, or null if it has no name worth showing. */
export function describePlace(feature: ClickedFeature): PlaceInfo | null {
  const props = feature.properties ?? {}
  const name = text(props.name) ?? text(props['name:en'])
  if (!name) return null

  const english = text(props['name:en'])
  const elevationRaw = props.elevation ?? props.ele
  const elevation =
    typeof elevationRaw === 'number' && Number.isFinite(elevationRaw)
      ? Math.round(elevationRaw)
      : typeof elevationRaw === 'string' && Number.isFinite(Number(elevationRaw))
        ? Math.round(Number(elevationRaw))
        : null

  return {
    name,
    englishName: english && english.toLowerCase() !== name.toLowerCase() ? english : null,
    type: typeLabel(feature.sourceLayer ?? '', text(props.kind), text(props.kind_detail)),
    elevation,
    point: feature.point ?? null,
  }
}

/**
 * The most useful place among the features under a click: points of interest first, then
 * settlements, water, and street names (see PLACE_SOURCE_LAYERS). Within a layer, the
 * topmost rendered feature (first in the list) wins.
 */
export function pickPlace(features: ClickedFeature[]): PlaceInfo | null {
  for (const layer of PLACE_SOURCE_LAYERS) {
    for (const feature of features) {
      if (feature.sourceLayer !== layer) continue
      const place = describePlace(feature)
      if (place) return place
    }
  }
  return null
}

/** "43.856300, 18.413100": lat,lng in the same form the map's coordinate box accepts. */
export function formatLatLng(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}
