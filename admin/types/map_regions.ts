export type MapRegionComponent = 'routing' | 'search'
export type MapRegionSourceId = 'geofabrik' | 'ibge-cnefe'
export type MapRegionSourceFormat = 'osm-pbf' | 'cnefe-zip'
export type MapRegionTerritoryScope = 'collection' | 'country' | 'subregion' | 'multi_country'

export interface MapRegionCoverage {
  bbox: [number, number, number, number]
  polygon?: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown[] }
}

export interface MapRegionSource {
  url: string
  format: MapRegionSourceFormat
  sourceId: MapRegionSourceId
  sizeBytes?: number
  checksum?: { algorithm: 'md5' | 'sha256'; value: string }
  dataDate?: string
}

export interface MapRegionDefinition {
  id: string
  name: string
  parentId?: string
  coverage: MapRegionCoverage
  sources: Partial<Record<MapRegionComponent, MapRegionSource>>
  attribution?: string
  dataDate?: string
  collectionChildren?: string[]
  territoryScope?: MapRegionTerritoryScope
  countryCodes?: string[]
}

export interface MapRegionCatalog {
  schema_version: 2
  regions: MapRegionDefinition[]
  updatedAt?: string
  sourceUrl?: string
}

export type MapRegionComponentStatus =
  | 'available'
  | 'queued'
  | 'downloading'
  | 'preparing'
  | 'installed'
  | 'failed'
  | 'cancelling'
  | 'cancelled'

export interface MapRegionPendingProvider {
  regionId: string
  name: string
  component: MapRegionComponent
  status: 'queued' | 'downloading' | 'preparing' | 'cancelling'
}

export interface MapRegionUpdateState {
  status: 'not_checked' | 'up_to_date' | 'available' | 'unknown' | 'unavailable'
  checkedAt?: string
  sourceDate?: string
  error?: string
  evidence?: 'checksum' | 'metadata'
  remoteChecksum?: string
}

export interface MapRegionProvider {
  regionId: string
  name: string
  component: MapRegionComponent
  version: string
  sourceId: MapRegionSourceId
  namespace: 'regions'
  dataDate?: string
}

export interface MapRegionLocalAsset {
  id: string
  name: string
  component: 'routing'
  version: string
  sizeBytes: number
  namespace: 'packs'
  coverageLabel: string
  partial: boolean
}

export interface MapRegionComponentState {
  status: MapRegionComponentStatus
  availability?: 'direct' | 'inherited' | 'available' | 'unavailable'
  providedBy?: MapRegionProvider
  pendingProvider?: MapRegionPendingProvider
  dependents?: { id: string; name: string }[]
  update?: MapRegionUpdateState
  updating?: boolean
  progress?: number
  bytesDownloaded?: number
  totalBytes?: number
  error?: string
  installedVersion?: string
  installedBytes?: number
  records?: number
  dataDate?: string
  searchSchemaVersion?: number
  postalCountries?: string[]
  postalCoverage?: 'available' | 'empty'
  searchUpgradeAvailable?: boolean
  searchSourceCached?: boolean
  searchRebuilding?: boolean
  operation?: MapRegionOperation
}

export interface MapRegionOperation {
  id: string
  type: 'install' | 'source_update' | 'index_upgrade'
  phase: string
  sourceMode?: 'cached' | 'download'
  activity?: 'active' | 'waiting' | 'no_recent_progress' | 'unavailable'
  telemetry?: 'reported' | 'legacy'
  queuedAt?: string
  startedAt?: string
  phaseStartedAt?: string
  heartbeatAt?: string
  lastProgressAt?: string
  bytesTransferred?: number
  totalBytes?: number
  rateBytesPerSecond?: number
  etaSeconds?: number
  recordsProcessed?: number
  recordsTotal?: number
  recordsPerSecond?: number
  stageBytesProcessed?: number
  stageTotalBytes?: number
  stageRateBytesPerSecond?: number
  workBytes?: number
  workRateBytesPerSecond?: number
  activityEvidence?: 'output_growth' | 'heartbeat'
  transferComplete?: boolean
  queueReason?: string
  waitingFor?: string
  queuePosition?: number
  attempt?: number
  retryable?: boolean
  errorCode?: string
  detail?: string
  workflowId?: string
  workflowComponents?: MapRegionComponent[]
  sourceFormat?: MapRegionSourceFormat
  sourceBytes?: number
  /** Remaining time for the current phase/detail, never the entire region. */
  phaseEtaMinSeconds?: number
  phaseEtaMaxSeconds?: number
  etaBasis?: 'history' | 'measured'
  etaSamples?: number
}

export interface MapRegionOperations {
  operations: {
    regionId: string
    name: string
    components: Partial<Record<MapRegionComponent, MapRegionComponentState>>
  }[]
  observedAt: string
  builderReady?: boolean
  searchBuilderReady?: boolean
}

export interface MapRegionState extends MapRegionDefinition {
  components: Partial<Record<MapRegionComponent, MapRegionComponentState>>
  localAssets?: MapRegionLocalAsset[]
  summary?: 'installed' | 'partial' | 'available' | 'collection'
  visual?: { available: boolean; basemap: boolean; sources: string[] }
}

export interface MapRegionsState {
  schema_version: 2
  regions: MapRegionState[]
  builderReady: boolean
  searchBuilderReady?: boolean
  searchSchemaVersion?: number
  postalCountries?: string[]
  postalCoverage?: 'available' | 'empty'
  builderError?: string
  engineVersion?: string
  updatedAt?: string
  sourceUrl?: string
  visual?: { available: boolean; reused: boolean; message?: string }
}

/** Published metadata is independent of the source's mutable latest URL. */
export interface MapRegionInstalledComponent {
  schema_version: 2
  regionId: string
  name: string
  component: MapRegionComponent
  version: string
  coverage: MapRegionCoverage
  artifactPath: string
  relativePath: string
  sizeBytes: number
  sha256: string
  source: MapRegionSource & {
    sha256: string
    downloadedAt: string
    lastModified?: string
    etag?: string
  }
  records?: number
  dataDate?: string
  engineVersion?: string
  createdAt: string
  attribution?: string
  searchSchemaVersion?: number
  postalCountries?: string[]
  postalCoverage?: 'available' | 'empty'
  territoryScope?: MapRegionTerritoryScope
  countryCodes?: string[]
}

export interface MapRegionBuildRequest {
  jobId: string
  regionId: string
  component: MapRegionComponent
  source: {
    relativePath: string
    format: MapRegionSourceFormat
    sourceId: MapRegionSourceId
    sha256: string
    dataDate?: string
  }
  outputRelativePath: string
  coverage: MapRegionCoverage
  operationKind?: MapRegionOperation['type']
}

export interface MapRegionBuildStatus {
  jobId?: string
  status: 'queued' | 'preparing' | 'completed' | 'failed' | 'cancelling' | 'cancelled'
  progress?: number
  error?: string
  artifact?: { relativePath: string; sizeBytes: number; sha256: string }
  records?: number
  dataDate?: string
  engineVersion?: string
  searchSchemaVersion?: number
  postalCountries?: string[]
  postalCoverage?: 'available' | 'empty'
  telemetryVersion?: number
  operationKind?: MapRegionOperation['type']
  phase?: string
  detail?: string
  queuedAt?: string
  startedAt?: string
  heartbeatAt?: string
  lastProgressAt?: string
  recordsProcessed?: number
  recordsTotal?: number
  bytesProcessed?: number
  totalBytes?: number
  bytesPerSecond?: number
  recordsPerSecond?: number
  etaSeconds?: number
}
