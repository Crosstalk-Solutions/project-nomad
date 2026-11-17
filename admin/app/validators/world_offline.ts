import vine from '@vinejs/vine'
import { WORLD_PACK_IDS } from '../../types/world_offline.js'

const id = () => vine.string().regex(/^[a-f0-9]{32}$/)
const bytes = () => vine.number().min(0).withoutDecimals()
const zoom = () => vine.number().min(0).max(24).withoutDecimals()
const latitude = () => vine.number({ strict: true }).min(-90).max(90)

export const worldDownloadValidator = vine.compile(vine.object({
  packIds: vine.array(vine.enum(WORLD_PACK_IDS)).minLength(1).maxLength(1),
}))

export const worldRemoveValidator = vine.compile(vine.object({ packId: vine.enum(WORLD_PACK_IDS) }))
export const worldJobActionValidator = vine.compile(vine.object({ id: id() }))
export const worldErrorResponse = vine.compile(vine.object({ message: vine.string() }))
const viewportLongitude = () => vine.number({ strict: true }).min(-1e6).max(1e6)
export const worldElevationContoursQuery = vine.compile(vine.object({
  west: viewportLongitude(),
  south: latitude(),
  east: viewportLongitude(),
  north: latitude(),
  zoom: vine.number({ strict: true }).min(0).max(24),
}))

function parseElevationCoordinate(value: unknown) {
  // Vine's default numeric coercion would turn a blank query parameter into zero.
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
  return typeof value === 'string' && decimal.test(value.trim()) ? Number(value) : value
}

export function validateWorldElevationContoursQuery(query: Record<string, unknown>) {
  return worldElevationContoursQuery.validate({
    west: parseElevationCoordinate(query.west), south: parseElevationCoordinate(query.south),
    east: parseElevationCoordinate(query.east), north: parseElevationCoordinate(query.north),
    zoom: parseElevationCoordinate(query.zoom),
  })
}

export const worldElevationContoursResponse = vine.compile(vine.object({
  status: vine.enum(['ok', 'not-installed', 'no-data', 'zoom-in']),
  dataZoom: zoom().optional(),
  intervalMeters: vine.number().min(100).max(100).optional(),
  geojson: vine.object({
    type: vine.enum(['FeatureCollection']),
    features: vine.array(vine.object({
      type: vine.enum(['Feature']),
      properties: vine.object({ elevationMeters: vine.number() }),
      geometry: vine.object({
        type: vine.enum(['LineString', 'MultiLineString']),
        coordinates: vine.array(vine.any()),
      }),
    })),
  }).optional(),
}))

const archive = () => vine.object({
  filename: vine.string(),
  bounds: vine.array(vine.number()).fixedLength(4),
  minzoom: zoom(),
  maxzoom: zoom(),
  tileSize: vine.number().withoutDecimals(),
  installedBytes: bytes(),
  sha256: vine.string(),
  attribution: vine.string(),
  month: vine.number().min(1).max(12).withoutDecimals().optional(),
  format: vine.string().optional(),
  encoding: vine.enum(['terrarium']).optional(),
  sourceLayer: vine.string().optional(),
})

const job = () => vine.object({
  id: id(),
  packIds: vine.array(vine.string()),
  status: vine.enum(['queued', 'running', 'paused', 'completed', 'failed', 'cancelled', 'discarded']),
  stage: vine.string(),
  operation: vine.string().optional(),
  updatedAt: vine.string().optional(),
  message: vine.string().optional(),
  bytesDownloaded: bytes(),
  totalBytes: bytes(),
  speedBytesPerSecond: bytes(),
  completedMonths: vine.number().min(0).max(12).withoutDecimals(),
  currentMonth: vine.number().min(1).max(12).withoutDecimals().nullable().optional(),
  pauseRequested: vine.boolean().optional(),
  cancelRequested: vine.boolean().optional(),
})

export const worldInventoryResponse = vine.compile(vine.object({
  packs: vine.array(vine.object({
    id: vine.string(),
    role: vine.enum(['blue-marble', 'satellite', 'topography', 'elevation']).optional(),
    minZoom: zoom().optional(),
    maxZoom: zoom().optional(),
    metersPerPixel: vine.number().min(0).optional(),
    installed: vine.boolean(),
    downloadBytes: bytes(),
    installedBytes: bytes().optional(),
    archives: vine.array(archive()).optional(),
    covered: vine.boolean().optional(),
    legacy: vine.boolean().optional(),
    estimatedInstalledBytes: bytes().optional(),
    additionalDownloadBytes: bytes().optional(),
    temporaryBytes: bytes().optional(),
    requiredFreeBytes: bytes().optional(),
    reclaimBytes: bytes().optional(),
    resumable: vine.boolean().optional(),
  })),
  job: job().nullable(),
  generation: vine.string(),
  freeBytes: bytes().optional(),
  serviceUnavailable: vine.boolean().optional(),
  canPause: vine.boolean().optional(),
}))

export const worldOperationResponse = vine.compile(vine.object({
  job: job().nullable().optional(),
  skipped: vine.boolean().optional(),
  removed: vine.boolean().optional(),
  removedBytes: bytes().optional(),
  freedDiskBytes: bytes().optional(),
  message: vine.string().optional(),
}))
