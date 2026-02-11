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

export type RunDownloadJobParams = Omit<
  DoResumableDownloadParams,
  'onProgress' | 'onComplete' | 'signal'
> & {
  filetype: string
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
}

// Wikipedia selector types
export type WikipediaOption = {
  id: string
  name: string
  description: string
  size_mb: number
  url: string | null
}

export type WikipediaOptionsFile = {
  options: WikipediaOption[]
}

export type WikipediaCurrentSelection = {
  optionId: string
  status: 'none' | 'downloading' | 'installed' | 'failed'
  filename: string | null
  url: string | null
}

export type WikipediaState = {
  options: WikipediaOption[]
  currentSelection: WikipediaCurrentSelection | null
}
