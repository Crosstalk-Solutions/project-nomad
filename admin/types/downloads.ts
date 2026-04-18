export type DoResumableDownloadParams = {
  url: string
  filepath: string
  timeout: number
  allowedMimeTypes: string[]
  signal?: AbortSignal
  onProgress?: (progress: DoResumableDownloadProgress) => void
  onComplete?: (url: string, path: string) => void | Promise<void>
  forceNew?: boolean
}

export type DoResumableDownloadWithRetryParams = DoResumableDownloadParams & {
  max_retries?: number
  retry_delay?: number
  onAttemptError?: (error: Error, attempt: number) => void
}

export type DoResumableDownloadProgress = {
  downloadedBytes: number
  totalBytes: number
  lastProgressTime: number
  lastDownloadedBytes: number
  url: string
}

export type DownloadProgressData = {
  percent: number
  downloadedBytes: number
  totalBytes: number
  lastProgressTime: number
}

export type RunDownloadJobParams = Omit<
  DoResumableDownloadParams,
  'onProgress' | 'onComplete' | 'signal'
> & {
  filetype: string
  title?: string
  totalBytes?: number
  resourceMetadata?: {
    resource_id: string
    version: string
    collection_ref: string | null
  }
}

export type DownloadJobWithProgress = {
  jobId: string
  url: string
  progress: number
  filepath: string
  filetype: string
  title?: string
  downloadedBytes?: number
  totalBytes?: number
  lastProgressTime?: number
  status?: 'active' | 'waiting' | 'delayed' | 'failed'
  failedReason?: string
}

// Wikipedia language definition
export type WikipediaLanguage = {
  iso1: string       // 2-letter code used in ZIM filenames (e.g. "es")
  iso3: string       // 3-letter code used in Kiwix API (e.g. "spa")
  name: string       // English name
  name_local: string // Native name
}

// Wikipedia selector types
export type WikipediaOption = {
  id: string
  name: string
  description: string
  size_mb: number
  url: string | null
  // New fields for dynamic resolution
  zim_name?: string    // template e.g. "wikipedia_{lang}_all"
  zim_flavour?: string // "maxi" | "nopic" | "mini"
  size_mb_by_lang?: Record<string, number>
}

export type WikipediaOptionsFile = {
  spec_version: string
  kiwix_api: string
  languages: WikipediaLanguage[]
  options: WikipediaOption[]
}

export type WikipediaCurrentSelection = {
  optionId: string
  status: 'none' | 'downloading' | 'installed' | 'failed'
  filename: string | null
  url: string | null
  language?: string // iso1 code of the selected language
}

export type WikipediaState = {
  options: WikipediaOption[]
  languages: WikipediaLanguage[]
  currentSelection: WikipediaCurrentSelection | null
  selectedLanguage: string // iso1 code, defaults to "en"
}
