import type { WorldArchive } from './world_offline.js'

export const LOCAL_DETAIL_API = '/api/maps/local-detail'
export const LOCAL_DETAIL_GRID_ZOOM = 8
export const LOCAL_DETAIL_LEVELS = { satellite: 12, topography: 12, elevation: 12, street: 15 } as const
export const LOCAL_DETAIL_ROLES = ['satellite', 'topography', 'elevation', 'street'] as const
export type LocalDetailRole = typeof LOCAL_DETAIL_ROLES[number]
export type LocalDetailCoordinate = { x: number; y: number }
export type LocalDetailArchive = WorldArchive & { role: LocalDetailRole }
export type LocalDetailCell = LocalDetailCoordinate & {
  id: string; label: string; status: 'ready'; bounds: [number, number, number, number]
  archives: LocalDetailArchive[]
  installedBytes?: number
}
export type LocalDetailDeleteResult = {
  removed: LocalDetailCoordinate[]; alreadyAbsent: LocalDetailCoordinate[]; freedBytes: number
  cleanupPending: LocalDetailCoordinate[]; generation: string; job: LocalDetailJob | null
}
export type LocalDetailJob = {
  id: string; status: string; stage: string; cells: LocalDetailCoordinate[]
  downloadedBytes: number; totalBytes: number; speedBytesPerSecond: number; progress: number
  error?: string; message?: string; updatedAt?: string
  recovery?: LocalDetailRecovery
}
export type LocalDetailRecovery = { canRetry: boolean; canPrepareOffline: boolean; needsRecalculation: boolean; reason?: string }
export type LocalDetailQueue = {
  id: string; requestId?: string | null; status: string; batches: { quoteId: string; cells: LocalDetailCoordinate[]; status: string }[]
  batchIndex: number; totalBatches: number; completedCells: number; totalCells: number
  message?: string; recovery?: LocalDetailRecovery
}
export type LocalDetailTemporaryStorage = {
  savedPreparationBytes: number; expiredMetadataBytes: number; totalBytes: number; activeProtected: boolean
  canDiscard: boolean; canPrune: boolean; discardId?: string
}
export type LocalDetailInventory = {
  schemaVersion: 1; gridZoom: 8; levels: typeof LOCAL_DETAIL_LEVELS
  cells: LocalDetailCell[]; job: LocalDetailJob | null; generation?: string
  freeBytes?: number; serviceUnavailable?: boolean
  cleanupPending?: LocalDetailCoordinate[]
  queue?: LocalDetailQueue | null; temporaryStorage?: LocalDetailTemporaryStorage
}

export function localDetailColumn(x: number) {
  let n = x + 1, value = ''
  while (n > 0) { n--; value = String.fromCharCode(65 + n % 26) + value; n = Math.floor(n / 26) }
  return value
}
export function localDetailLabel({ x, y }: LocalDetailCoordinate) { return localDetailColumn(x) + (y + 1) }
export function localDetailId({ x, y }: LocalDetailCoordinate) { return `8/${x}/${y}` }
export function isLocalDetailCoordinate(value: unknown): value is LocalDetailCoordinate {
  const c = value as LocalDetailCoordinate
  return !!c && Number.isInteger(c.x) && c.x >= 0 && c.x < 256
    && Number.isInteger(c.y) && c.y >= 0 && c.y < 256
}
export function localDetailBounds({ x, y }: LocalDetailCoordinate): [number, number, number, number] {
  const latitude = (row: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * row / 256))) * 180 / Math.PI
  return [x / 256 * 360 - 180, latitude(y + 1), (x + 1) / 256 * 360 - 180, latitude(y)]
}
