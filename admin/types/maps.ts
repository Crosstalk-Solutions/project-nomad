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
  tileSize?: number
  minzoom?: number
  maxzoom?: number
  bounds?: [number, number, number, number]
}

export type MapLayer = {
  'id': string
  'type': string
  'source'?: string
  'source-layer'?: string
  [key: string]: any
}

export type MapArchiveKind = Extract<MapSource['type'], 'vector' | 'raster'>
export type MapArchiveRole = 'street' | 'aerial' | 'topographic'
export type MapTileFormat = 'mvt' | 'jpeg' | 'png' | 'webp'

type MapArchiveMetadataBase = {
  filename: string
  resourceId: string
  regionId?: string
  tileSize?: number
  minzoom?: number
  maxzoom?: number
  bounds?: [number, number, number, number]
  attribution?: string
  sourceUrl?: string
  sourceVersion?: string
  sha256?: string
  installedBytes?: number
  verifiedAt?: string
}

export type VectorMapArchiveMetadata = MapArchiveMetadataBase & {
  kind: 'vector'
  role: 'street'
  tileFormat: 'mvt'
}

export type RasterMapArchiveMetadata = MapArchiveMetadataBase & {
  kind: 'raster'
  role: Extract<MapArchiveRole, 'aerial' | 'topographic'>
  regionId: string
  tileFormat: Extract<MapTileFormat, 'jpeg' | 'png' | 'webp'>
  tileSize: number
  minzoom: number
  maxzoom: number
  bounds: [number, number, number, number]
  attribution: string
  sourceUrl: string
  sourceVersion: string
  sha256: string
  installedBytes: number
  verifiedAt: string
}

/**
 * Explicit sidecar metadata for an installed PMTiles archive.
 *
 * Existing archives without an entry remain supported as legacy vector maps.
 * Raster archives must have a valid entry before style generation will activate
 * them.
 */
export type MapArchiveMetadata = VectorMapArchiveMetadata | RasterMapArchiveMetadata

export type MapArchiveManifest = {
  schemaVersion: 1
  generatedAt?: string
  archives: Record<string, MapArchiveMetadata>
}

export type ParsedMapArchiveManifest = {
  status: 'absent' | 'valid' | 'invalid'
  archives: MapArchiveMetadata[]
  /**
   * Files explicitly mentioned by a manifest but rejected during validation.
   * Style generation must not fall back to treating these files as legacy
   * vector archives.
   */
  rejectedFilenames: string[]
}

/** Internal style-generation record retaining archive metadata with its source. */
export type MapSourceDefinition = {
  id: string
  source: MapSource
  archive: MapArchiveMetadata
}

/** ISO 3166-1 alpha-2 country code (e.g. "DE", "FR", "US"). */
export type CountryCode = string

export type Country = {
  code: CountryCode
  code3: string
  name: string
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
