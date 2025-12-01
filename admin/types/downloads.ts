export type DoResumableDownloadParams = {
  url: string
  path: string
  timeout: number
  allowedMimeTypes: string[]
  signal?: AbortSignal
  onProgress?: (progress: DoResumableDownloadProgress) => void
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

export type DoBackgroundDownloadParams = Omit<
  DoResumableDownloadWithRetryParams,
  'onProgress' | 'onAttemptError' | 'signal'
> & {
  channel: string
  activeDownloads: Map<string, AbortController>
  onComplete?: (url: string, path: string) => void | Promise<void>
}
