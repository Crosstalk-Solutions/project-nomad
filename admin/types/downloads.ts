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

export type RunDownloadJobParams = Omit<
  DoResumableDownloadParams,
  'onProgress' | 'onComplete' | 'signal'
> & {
  filetype: string
}

export type DownloadJobWithProgress = {
  jobId: string
  url: string
  progress: number
  filepath: string
  filetype: string
}
