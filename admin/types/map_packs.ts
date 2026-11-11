import type { MapRegionTerritoryScope } from './map_regions.js'

export type MapPackProfile = 'auto' | 'pedestrian'

/** A Valhalla graph tar is used directly; it is never extracted by NOMAD. */
export interface MapPackArtifact {
  url: string
  filename: 'routing.tar'
  size_bytes: number
  sha256: string
}

export interface MapPackManifest {
  schema_version: 1
  id: string
  name: string
  version: string
  description?: string
  source?: string
  created_at?: string
  attribution?: string
  coverage: {
    /** Longitude/latitude: west, south, east, north. */
    bbox: [number, number, number, number]
    description?: string
    /** Administrator-verified territory of this particular artifact. */
    territory_scope?: MapRegionTerritoryScope
    country_codes?: string[]
  }
  routing: {
    engine: 'valhalla'
    profiles: MapPackProfile[]
    artifact: MapPackArtifact
  }
}

export interface MapPackCatalog {
  schema_version: 1
  packages: MapPackManifest[]
}

export type MapPackStatus =
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'installed'
  | 'active'
  | 'failed'

export interface MapPackState extends MapPackManifest {
  status: MapPackStatus
  progress?: number
  error?: string
  installedVersion?: string
}

export interface MapPacksState {
  packages: MapPackState[]
  activePackageId: string | null
  routerReady: boolean
  routerError?: string
}
