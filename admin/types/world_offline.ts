export const WORLD_OFFLINE_API = '/api/maps/world-offline'

export const WORLD_PACK_IDS = [
  'blue-marble-z4', 'blue-marble', 'blue-marble-z8',
  'satellite-z8', 'satellite-z9', 'satellite-z10', 'satellite-z11', 'satellite-z12',
  'earth-relief-z8', 'earth-relief-z9', 'earth-relief-z10', 'earth-relief-z11', 'earth-relief-z12',
] as const

export type WorldPackId = (typeof WORLD_PACK_IDS)[number]
export type WorldJobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'discarded'

export type WorldArchive = {
  filename: string
  bounds: [number, number, number, number]
  minzoom: number
  maxzoom: number
  tileSize: number
  attribution: string
  installedBytes: number
  sha256: string
  month?: number
  format?: string
  sourceLayer?: string
}

export type WorldPack = {
  id: string
  role?: 'blue-marble' | 'satellite' | 'topography'
  maxZoom?: number
  minZoom?: number
  metersPerPixel?: number
  downloadBytes: number
  installed: boolean
  installedBytes?: number
  archives?: WorldArchive[]
  covered?: boolean
  legacy?: boolean
  estimatedInstalledBytes?: number
  additionalDownloadBytes?: number
  temporaryBytes?: number
  requiredFreeBytes?: number
  reclaimBytes?: number
  resumable?: boolean
}

export type WorldJob = {
  id: string
  packIds: string[]
  status: WorldJobStatus
  stage: string
  operation?: string
  updatedAt?: string
  message?: string
  bytesDownloaded: number
  totalBytes: number
  speedBytesPerSecond: number
  completedMonths: number
  currentMonth?: number | null
  pauseRequested?: boolean
  cancelRequested?: boolean
}

export type WorldInventory = {
  packs: WorldPack[]
  job: WorldJob | null
  generation?: string
  freeBytes?: number
  serviceUnavailable?: boolean
  canPause?: boolean
}
