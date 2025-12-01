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
