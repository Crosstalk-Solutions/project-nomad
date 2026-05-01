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
