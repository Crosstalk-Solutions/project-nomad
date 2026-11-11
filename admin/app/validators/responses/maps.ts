import vine from '@vinejs/vine'
import { offlineRouteErrorCodes } from '../../utils/offline_route.js'

const component = () => vine.enum(['routing'] as const)
const coverage = () =>
  vine.object({
    bbox: vine.array(vine.number()).minLength(4).maxLength(4),
    polygon: vine
      .object({
        type: vine.enum(['Polygon', 'MultiPolygon'] as const),
        coordinates: vine.array(vine.any()),
      })
      .optional(),
  })
const source = () =>
  vine.object({
    url: vine.string(),
    format: vine.enum(['osm-pbf', 'cnefe-zip'] as const),
    sourceId: vine.enum(['geofabrik', 'ibge-cnefe'] as const),
    sizeBytes: vine.number().optional(),
    dataDate: vine.string().optional(),
    checksum: vine
      .object({ algorithm: vine.enum(['md5', 'sha256'] as const), value: vine.string() })
      .optional(),
  })
const update = () =>
  vine.object({
    status: vine.enum([
      'not_checked',
      'up_to_date',
      'available',
      'unknown',
      'unavailable',
    ] as const),
    checkedAt: vine.string().optional(),
    sourceDate: vine.string().optional(),
    error: vine.string().optional(),
    evidence: vine.enum(['checksum', 'metadata'] as const).optional(),
    remoteChecksum: vine.string().optional(),
  })
const provider = () =>
  vine.object({
    regionId: vine.string(),
    name: vine.string(),
    component: component(),
    version: vine.string(),
    sourceId: vine.enum(['geofabrik', 'ibge-cnefe'] as const),
    namespace: vine.enum(['regions'] as const),
    dataDate: vine.string().optional(),
  })
const operationState = () =>
  vine.object({
    id: vine.string(),
    type: vine.enum(['install', 'source_update', 'index_upgrade'] as const),
    phase: vine.string(),
    sourceMode: vine.enum(['cached', 'download'] as const).optional(),
    activity: vine
      .enum(['active', 'waiting', 'no_recent_progress', 'unavailable'] as const)
      .optional(),
    telemetry: vine.enum(['reported', 'legacy'] as const).optional(),
    queuedAt: vine.string().optional(),
    startedAt: vine.string().optional(),
    phaseStartedAt: vine.string().optional(),
    heartbeatAt: vine.string().optional(),
    lastProgressAt: vine.string().optional(),
    bytesTransferred: vine.number().optional(),
    totalBytes: vine.number().optional(),
    rateBytesPerSecond: vine.number().optional(),
    etaSeconds: vine.number().optional(),
    recordsProcessed: vine.number().optional(),
    recordsTotal: vine.number().optional(),
    recordsPerSecond: vine.number().optional(),
    workBytes: vine.number().optional(),
    workRateBytesPerSecond: vine.number().optional(),
    stageBytesProcessed: vine.number().optional(),
    stageTotalBytes: vine.number().optional(),
    stageRateBytesPerSecond: vine.number().optional(),
    activityEvidence: vine.enum(['output_growth', 'heartbeat'] as const).optional(),
    transferComplete: vine.boolean().optional(),
    queueReason: vine.string().optional(),
    waitingFor: vine.string().optional(),
    queuePosition: vine.number().optional(),
    attempt: vine.number().optional(),
    retryable: vine.boolean().optional(),
    errorCode: vine.string().optional(),
    detail: vine.string().optional(),
    workflowId: vine.string().optional(),
    workflowComponents: vine.array(component()).optional(),
    sourceFormat: vine.enum(['osm-pbf', 'cnefe-zip'] as const).optional(),
    sourceBytes: vine.number().optional(),
    phaseEtaMinSeconds: vine.number().optional(),
    phaseEtaMaxSeconds: vine.number().optional(),
    etaBasis: vine.enum(['history', 'measured'] as const).optional(),
    etaSamples: vine.number().optional(),
  })
const componentState = () =>
  vine.object({
    status: vine.enum([
      'available',
      'queued',
      'downloading',
      'preparing',
      'installed',
      'failed',
      'cancelling',
      'cancelled',
    ] as const),
    availability: vine
      .enum(['direct', 'inherited', 'available', 'unavailable'] as const)
      .optional(),
    providedBy: provider().optional(),
    pendingProvider: vine
      .object({
        regionId: vine.string(),
        name: vine.string(),
        component: component(),
        status: vine.enum(['queued', 'downloading', 'preparing', 'cancelling'] as const),
      })
      .optional(),
    dependents: vine.array(vine.object({ id: vine.string(), name: vine.string() })).optional(),
    update: update().optional(),
    updating: vine.boolean().optional(),
    progress: vine.number().optional(),
    bytesDownloaded: vine.number().optional(),
    totalBytes: vine.number().optional(),
    error: vine.string().optional(),
    installedVersion: vine.string().optional(),
    installedBytes: vine.number().optional(),
    records: vine.number().optional(),
    dataDate: vine.string().optional(),
    operation: operationState().optional(),
  })

export const mapMessageResponse = vine.compile(vine.object({ message: vine.string() }))
export const mapRegionOperationsResponse = vine.compile(
  vine.object({
    observedAt: vine.string(),
    builderReady: vine.boolean().optional(),
    operations: vine.array(
      vine.object({
        regionId: vine.string(),
        name: vine.string(),
        components: vine.object({
          routing: componentState().optional(),
        }),
      })
    ),
  })
)
export const mapValidationResponse = vine.compile(
  vine.object({
    message: vine.string().optional(),
    errors: vine
      .array(
        vine.object({
          message: vine.string(),
          field: vine.string(),
          rule: vine.string(),
          meta: vine.any().optional(),
        })
      )
      .optional(),
  })
)
export const mapAcceptedResponse = vine.compile(
  vine.object({ success: vine.boolean(), alreadyCurrent: vine.boolean().optional() })
)
export const mapRoutingSettingsResponse = vine.compile(
  vine.object({
    mode: vine.enum(['automatic', 'fixed'] as const),
    regionId: vine.string().optional(),
    available: vine.boolean(),
    regionName: vine.string().optional(),
    message: vine.string().optional(),
  })
)
export const mapRegionEstimateResponse = vine.compile(
  vine.object({
    regionId: vine.string(),
    components: vine.array(component()),
    operation: vine.enum(['install', 'update'] as const),
    collection: vine.boolean(),
    packages: vine.number(),
    totalSourceBytes: vine.number().optional(),
    remainingDownloadBytes: vine.number().optional(),
    reusableBytes: vine.number(),
    minimumFreeBytes: vine.number().optional(),
    availableFreeBytes: vine.number().optional(),
    spaceSufficient: vine.boolean().optional(),
    diskCheckError: vine.string().optional(),
    complete: vine.boolean(),
    checkedAt: vine.string(),
    sources: vine.array(
      vine.object({
        url: vine.string(),
        regionId: vine.string(),
        bytes: vine.number().optional(),
        cachedBytes: vine.number(),
        status: vine.enum(['known', 'unknown'] as const),
        checkedAt: vine.string().optional(),
        stale: vine.boolean().optional(),
        message: vine.string().optional(),
      })
    ),
    message: vine.string().optional(),
  })
)
export const mapRegionsResponse = vine.compile(
  vine.object({
    schema_version: vine.number(),
    regions: vine.array(
      vine.object({
        id: vine.string(),
        name: vine.string(),
        parentId: vine.string().optional(),
        coverage: coverage(),
        territoryScope: vine
          .enum(['collection', 'country', 'subregion', 'multi_country'] as const)
          .optional(),
        countryCodes: vine.array(vine.string()).optional(),
        sources: vine.object({ routing: source().optional() }),
        attribution: vine.string().optional(),
        dataDate: vine.string().optional(),
        collectionChildren: vine.array(vine.string()).optional(),
        components: vine.object({
          routing: componentState().optional(),
        }),
        summary: vine.enum(['installed', 'partial', 'available', 'collection'] as const).optional(),
        visual: vine
          .object({
            available: vine.boolean(),
            basemap: vine.boolean(),
            sources: vine.array(vine.string()),
          })
          .optional(),
        localAssets: vine
          .array(
            vine.object({
              id: vine.string(),
              name: vine.string(),
              component: vine.enum(['routing'] as const),
              version: vine.string(),
              sizeBytes: vine.number(),
              namespace: vine.enum(['packs'] as const),
              coverageLabel: vine.string(),
              partial: vine.boolean(),
            })
          )
          .optional(),
      })
    ),
    builderReady: vine.boolean(),
    builderError: vine.string().optional(),
    engineVersion: vine.string().optional(),
    updatedAt: vine.string().optional(),
    sourceUrl: vine.string().optional(),
    visual: vine
      .object({
        available: vine.boolean(),
        reused: vine.boolean(),
        message: vine.string().optional(),
      })
      .optional(),
  })
)
export const mapUpdateCheckResponse = vine.compile(
  vine.object({
    checked: vine.number(),
    results: vine.array(
      vine.object({ regionId: vine.string(), component: component(), update: update() })
    ),
  })
)
export const mapCatalogRefreshResponse = vine.compile(
  vine.object({
    success: vine.boolean(),
    regions: vine.number(),
    updatedAt: vine.string().optional(),
  })
)
export const mapRoutingCoverageResponse = vine.compile(
  vine.object({
    regions: vine.array(
      vine.object({
        id: vine.string(),
        packageId: vine.string(),
        version: vine.string(),
        name: vine.string(),
        coverage: coverage(),
        profiles: vine.array(vine.enum(['auto', 'pedestrian'] as const)),
        namespace: vine.enum(['packs', 'regions'] as const),
        territoryScope: vine.enum(['country', 'subregion'] as const),
        countryCodes: vine.array(vine.string()).minLength(1).maxLength(1),
      })
    ),
    routerReady: vine.boolean(),
  })
)
export const mapRouteErrorResponse = vine.compile(
  vine.object({
    message: vine.string(),
    code: vine.enum(offlineRouteErrorCodes),
    engineCode: vine.number().optional(),
    distanceLimitMeters: vine.number().min(0).optional(),
  })
)
export const mapRouteResponse = vine.compile(
  vine.object({
    packageId: vine.string(),
    packageVersion: vine.string(),
    profile: vine.enum(['auto', 'pedestrian'] as const),
    regionId: vine.string().optional(),
    regionName: vine.string().optional(),
    geometry: vine.object({
      type: vine.enum(['LineString'] as const),
      coordinates: vine.array(vine.array(vine.number()).minLength(2).maxLength(2)),
    }),
    distanceMeters: vine.number(),
    durationSeconds: vine.number(),
    legs: vine
      .array(
        vine.object({
          fromIndex: vine.number().min(0).max(5),
          toIndex: vine.number().min(1).max(6),
          distanceMeters: vine.number(),
          durationSeconds: vine.number(),
          maneuvers: vine.array(
            vine.object({
              instruction: vine.string(),
              distanceMeters: vine.number(),
              durationSeconds: vine.number(),
            })
          ),
        })
      )
      .minLength(1)
      .maxLength(6),
    maneuvers: vine.array(
      vine.object({
        instruction: vine.string(),
        distanceMeters: vine.number(),
        durationSeconds: vine.number(),
      })
    ),
  })
)
