/* General file transfer/download utility types */

export type FileEntry =
  | {
      type: 'file'
      key: string
      name: string
    }
  | {
      type: 'directory'
      prefix: string
      name: string
    }

export type DownloadProgress = {
  downloaded_bytes: number
  total_bytes: number
  percentage: number
  speed: string
  time_remaining: number
}

export type DownloadOptions = {
  max_retries?: number
  retry_delay?: number
  chunk_size?: number
  timeout?: number
  onError?: (error: Error) => void
  onComplete?: (filepath: string) => void
}

export type DownloadCollectionOperation = (slug: string) => Promise<string[] | null>
export type DownloadRemoteSuccessCallback = (urls: string[], restart: boolean) => Promise<void>