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

export type MapMarkerResponse = {
  id: number
  name: string
  longitude: number
  latitude: number
  color: string
  notes?: string | null
  marker_type?: string
  route_id?: string | null
  route_order?: number | null
  created_at: string
  updated_at?: string
}
