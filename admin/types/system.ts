import { Systeminformation } from 'systeminformation'

export type GpuHealthStatus = {
  status: 'ok' | 'passthrough_failed' | 'no_gpu' | 'ollama_not_installed'
  hasNvidiaRuntime: boolean
  hasRocmRuntime: boolean
  ollamaGpuAccessible: boolean
  gpuVendor?: 'nvidia' | 'amd'
}

export type SystemInformationResponse = {
  cpu: Systeminformation.CpuData
  mem: Systeminformation.MemData
  os: Systeminformation.OsData
  disk: NomadDiskInfo[]
  currentLoad: Systeminformation.CurrentLoadData
  fsSize: Systeminformation.FsSizeData[]
  uptime: Systeminformation.TimeData
  graphics: Systeminformation.GraphicsData
  gpuHealth?: GpuHealthStatus
}

// Type inferrence is not working properly with usePage and shared props, so we define this type manually
export type UsePageProps = {
  appVersion: string
  environment: string
}

export type LSBlockDevice = {
  name: string
  size: string
  type: string
  model: string | null
  serial: string | null
  vendor: string | null
  rota: boolean | null
  tran: string | null
  children?: LSBlockDevice[]
}

export type NomadDiskInfoRaw = {
  diskLayout: {
    blockdevices: LSBlockDevice[]
  }
  fsSize: {
    fs: string
    size: number
    used: number
    available: number
    use: number
    mount: string
  }[]
}

export type NomadDiskInfo = {
  name: string
  model: string
  vendor: string
  rota: boolean
  tran: string
  size: string
  totalUsed: number
  totalSize: number
  percentUsed: number
  filesystems: {
    fs: string
    mount: string
    used: number
    size: number
    percentUsed: number
  }[]
}

export type SystemUpdateStatus = {
  stage: 'idle' | 'starting' | 'pulling' | 'pulled' | 'recreating' | 'complete' | 'error'
  progress: number
  message: string
  timestamp: string
}


export type CheckLatestVersionResult = {
  success: boolean,
  updateAvailable: boolean,
  currentVersion: string,
  latestVersion: string,
  message?: string
}

export type AutoUpdateEligibleTarget = {
  version: string
  tag: string
  publishedAt: string
}

export type AutoUpdateStatus = {
  enabled: boolean
  windowStart: string
  windowEnd: string
  cooloffHours: number
  currentVersion: string
  withinWindow: boolean
  eligibleTarget: AutoUpdateEligibleTarget | null
  lastAttemptAt: string | null
  lastResult: string | null
  lastError: string | null
  consecutiveFailures: number
  autoDisabledReason: string | null
}

export type AppAutoUpdateAppStatus = {
  service_name: string
  friendly_name: string | null
  auto_update_enabled: boolean
  current_version: string
  available_update_version: string | null
  first_seen_at: string | null
  eligible: boolean
  reason: string
  cooloff_remaining_hours: number | null
  consecutive_failures: number
  auto_disabled_reason: string | null
}

export type AppAutoUpdateStatus = {
  enabled: boolean
  windowStart: string
  windowEnd: string
  cooloffHours: number
  withinWindow: boolean
  lastAttemptAt: string | null
  lastResult: string | null
  apps: AppAutoUpdateAppStatus[]
}

export type ContentAutoUpdateResourceStatus = {
  resource_id: string
  resource_type: 'zim' | 'map'
  current_version: string
  available_update_version: string | null
  size_bytes: number | null
  eligible: boolean
  reason: string
  cooloff_remaining_hours: number | null
  exceeds_cap: boolean
  consecutive_failures: number
  auto_disabled_reason: string | null
}

export type ContentAutoUpdateStatus = {
  enabled: boolean
  windowStart: string
  windowEnd: string
  cooloffHours: number
  maxBytesPerWindow: number
  withinWindow: boolean
  windowBytesUsed: number
  lastAttemptAt: string | null
  lastResult: string | null
  lastError: string | null
  autoDisabledReason: string | null
  resources: ContentAutoUpdateResourceStatus[]
}