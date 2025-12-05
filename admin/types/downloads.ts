export type DoSimpleDownloadParams = {
  url: string
  filepath: string
  timeout: number
  signal?: AbortSignal
}

export type DoResumableDownloadParams = {
  url: string
  filepath: string
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

export type CuratedCollection = {
  name: string
  slug: string
  description: string
  icon: string
  language: string
  resources: {
    title: string
    description: string
    size_mb: number
    url: string
  }[]
}

export type CuratedCollectionWithStatus = CuratedCollection & {
  all_downloaded: boolean
}

export type CuratedCollectionsFile = {
  collections: CuratedCollection[]
}
