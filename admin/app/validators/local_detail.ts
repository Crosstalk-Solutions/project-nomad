import vine from '@vinejs/vine'
import { LOCAL_DETAIL_ROLES } from '../../types/local_detail.js'
const coordinate = () => vine.number({ strict: true }).min(0).max(255).withoutDecimals()
const cell = () => vine.object({ x: coordinate(), y: coordinate() })
const cells = () => vine.array(cell()).minLength(1).maxLength(64)
const bytes = () => vine.number().min(0)
const id = () => vine.string().regex(/^[a-f0-9]{32}$/)
export const localCalculateRequest = vine.compile(vine.object({ cells: cells() }))
export const localDeleteRequest = vine.compile(vine.object({ cells: cells() }))
export const localDownloadRequest = vine.compile(vine.object({ cells: cells(), quoteId: id(), requestId: vine.string().maxLength(128).optional() }))
export const localJobRequest = vine.compile(vine.object({ id: id() }))
export const localQueueRequest = vine.compile(vine.object({
  batches: vine.array(vine.object({ quoteId: id(),
    excludedCells: vine.array(vine.string().regex(/^8\/\d{1,3}\/\d{1,3}$/)).maxLength(64).optional(),
  })).minLength(1).maxLength(1024), requestId: vine.string().minLength(1).maxLength(128).optional(),
}))
export const localCleanupRequest = vine.compile(vine.object({
  scope: vine.enum(['saved-preparation', 'expired-metadata']), id: vine.string().regex(/^[a-f0-9]{64}$/).optional(),
}))
const recovery = () => vine.object({ canRetry: vine.boolean(), canPrepareOffline: vine.boolean(), needsRecalculation: vine.boolean(), reason: vine.string().optional() })
const queue = () => vine.object({ id: id(), requestId: vine.string().maxLength(128).nullable().optional(), status: vine.enum(['queued', 'running', 'ready', 'failed', 'cancelled']),
  batches: vine.array(vine.object({ quoteId: id(), cells: vine.array(cell()), status: vine.string() })),
  batchIndex: vine.number(), totalBatches: vine.number(), completedCells: vine.number(), totalCells: vine.number(),
  message: vine.string().optional(), recovery: recovery().optional(),
})
const job = () => vine.object({
  id: id(), status: vine.enum(['queued', 'downloading', 'preparing', 'verifying', 'ready', 'failed', 'cancelled']),
  stage: vine.string(), cells: vine.array(cell()), progress: vine.number().min(0).max(100),
  bytesDownloaded: bytes(), totalBytes: bytes(), speedBytesPerSecond: bytes(), message: vine.string().optional(),
  recovery: recovery().optional(),
})
const temporary = () => vine.object({ savedPreparationBytes: bytes(), expiredMetadataBytes: bytes(), totalBytes: bytes(),
  activeProtected: vine.boolean(), canDiscard: vine.boolean(), canPrune: vine.boolean(), discardId: vine.string().optional() })
export const localInventoryResponse = vine.compile(vine.object({
  schemaVersion: vine.number(), gridZoom: vine.number(), levels: vine.object({ satellite: vine.number(), topography: vine.number(), elevation: vine.number(), street: vine.number() }),
  cells: vine.array(vine.object({
    id: vine.string(), x: coordinate(), y: coordinate(), label: vine.string(), status: vine.enum(['ready']),
    bounds: vine.array(vine.number()).fixedLength(4), installedBytes: bytes().optional(), archives: vine.array(vine.object({
      filename: vine.string(), role: vine.enum(LOCAL_DETAIL_ROLES), installedBytes: bytes(), sha256: vine.string(),
      bounds: vine.array(vine.number()).fixedLength(4), minzoom: vine.number(), maxzoom: vine.number(),
      tileSize: vine.number(), attribution: vine.string(), format: vine.string(),
      sourceLayer: vine.string().optional(), encoding: vine.string().optional(),
    })),
  })), job: job().nullable(), generation: vine.string(), freeBytes: bytes().optional(), serviceUnavailable: vine.boolean().optional(),
  cleanupPending: vine.array(cell()).optional(),
  queue: queue().nullable().optional(), temporaryStorage: temporary().optional(),
}))
export const localQuoteResponse = vine.compile(vine.object({
  quoteId: id(), downloadBytes: bytes(), estimatedInstalledBytes: bytes(), requiredFreeBytes: bytes().optional(), freeBytes: bytes(),
  items: vine.array(vine.object({ id: vine.string(), x: coordinate(), y: coordinate(), label: vine.string(), downloadBytes: bytes(), estimatedInstalledBytes: bytes() })),
}))
export const localOperationResponse = vine.compile(vine.object({ job: job().nullable().optional(), queue: queue().nullable().optional() }))
export const localRecalculateResponse = vine.compile(vine.object({ cells: vine.array(cell()), job: job().nullable().optional(), queue: queue().nullable().optional() }))
export const localCleanupResponse = vine.compile(vine.object({ freedBytes: bytes(), temporaryStorage: temporary(), job: job().nullable().optional(), queue: queue().nullable().optional() }))
export const localDeleteResponse = vine.compile(vine.object({
  removed: vine.array(cell()), alreadyAbsent: vine.array(cell()), freedBytes: bytes(),
  cleanupPending: vine.array(cell()), generation: vine.string(), job: job().nullable(),
}))
