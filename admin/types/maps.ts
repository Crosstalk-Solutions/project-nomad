export type BaseStylesFile = {
  version: number
  sources: {
    [key: string]: MapSource
  }
  layers: MapLayer[]
  sprite: string
  glyphs: string
}

export type MapSource = {
  type: 'vector' | 'raster' | 'raster-dem' | 'geojson' | 'image' | 'video'
  attribution?: string
  url: string
}

export type MapLayer = {
  'id': string
  'type': string
  'source'?: string
  'source-layer'?: string
  [key: string]: any
}

/** ISO 3166-1 alpha-2 country code (e.g. "DE", "FR", "US"). */
export type CountryCode = string

export type Country = {
  code: CountryCode
  code3: string
  /** Short display name from Natural Earth (`NAME`), abbreviated for some countries ("Bosnia and Herz.") */
  name: string
  /** Full English name (`NAME_EN`, e.g. "Bosnia and Herzegovina"); falls back to `name` */
  fullName: string
  continent: string
  subregion: string
  population: number
}

export type CountryGroup = {
  id: string
  name: string
  description: string
  countries: CountryCode[]
}

export type MapExtractRequest = {
  countries: CountryCode[]
  maxzoom?: number
}

export type MapExtractPreflight = {
  tiles: number
  bytes: number
  source: {
    url: string
    date: string
    key: string
  }
}

export type CreateMapMarkerPayload = {
  name: string
  notes?: string | null
  longitude: number
  latitude: number
  color?: string
  custom_color?: string | null
  icon?: string | null
  icon_color?: string | null
  visible?: boolean
}

export type UpdateMapMarkerPayload = Partial<CreateMapMarkerPayload>

export type MapMarkerResponse = {
  id: number
  name: string
  longitude: number
  latitude: number
  color: string
  custom_color?: string | null
  icon?: string | null
  icon_color?: string | null
  visible?: boolean
  notes?: string | null
  created_at: string
  updated_at?: string
}

/** A place found by offline place search (GET /api/maps/search) */
export type MapPlaceResult = {
  name: string
  nameEn: string | null
  /** Tile kind, e.g. "city", "museum", "minor_road" */
  kind: string
  /** Tile layer: places, pois, water, roads or earth */
  layer: string
  lat: number
  lng: number
  /** From the lat/lng passed with the query, when given */
  distanceKm: number | null
}

/** How many downloaded regions are searchable (counted per .pmtiles file) */
export type MapPlaceIndexStatus = {
  ready: number
  /** Queued, being indexed, or changed since they were indexed */
  pending: number
  failed: number
  places: number
}

export type MapPlaceSearchResponse = {
  results: MapPlaceResult[]
  status: MapPlaceIndexStatus
}
