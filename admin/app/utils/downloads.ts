import {
  DoResumableDownloadParams,
  DoResumableDownloadWithRetryParams,
} from '../../types/downloads.js'
import axios from 'axios'
import { Transform } from 'stream'
import { deleteFileIfExists, ensureDirectoryExists, getFileStatsIfExists } from './fs.js'
import { createWriteStream } from 'fs'
import { rename } from 'fs/promises'
import path from 'path'

/**
 * Perform a resumable download with progress tracking
 * @param param0 - Download parameters. Leave allowedMimeTypes empty to skip mime type checking.
 * Otherwise, mime types should be in the format "application/pdf", "image/png", etc.
 * @returns Path to the downloaded file
 */
export async function doResumableDownload({
  url,
  filepath,
  timeout = 30000,
  signal,
  onProgress,
  onComplete,
  forceNew = false,
  allowedMimeTypes,
}: DoResumableDownloadParams): Promise<string> {
  const dirname = path.dirname(filepath)
  await ensureDirectoryExists(dirname)

  // Stage download to a .tmp file so consumers (e.g. Kiwix) never see a partial file
  const tempPath = filepath + '.tmp'

  // Check if partial .tmp file exists for resume
  let startByte = 0
  let appendMode = false

  const existingStats = await getFileStatsIfExists(tempPath)
  if (existingStats && !forceNew) {
    startByte = Number(existingStats.size)
    appendMode = true
  }

  // Get file info with HEAD request first
  const headResponse = await axios.head(url, {
    signal,
    timeout,
  })

  const contentType = headResponse.headers['content-type'] || ''
  const totalBytes = parseInt(headResponse.headers['content-length'] || '0')
  const supportsRangeRequests = headResponse.headers['accept-ranges'] === 'bytes'

  // If allowedMimeTypes is provided, check content type
  if (allowedMimeTypes && allowedMimeTypes.length > 0) {
    const isMimeTypeAllowed = allowedMimeTypes.some((mimeType) => contentType.includes(mimeType))
    if (!isMimeTypeAllowed) {
      throw new Error(`MIME type ${contentType} is not allowed`)
    }
  }

  // If final file already exists at correct size, return early (idempotent)
  const finalFileStats = await getFileStatsIfExists(filepath)
  if (finalFileStats && Number(finalFileStats.size) === totalBytes && totalBytes > 0 && !forceNew) {
    return filepath
  }

  // If .tmp file is already at correct size (complete but never renamed), just rename it
  if (startByte === totalBytes && totalBytes > 0 && !forceNew) {
    await rename(tempPath, filepath)
    if (onComplete) {
      await onComplete(url, filepath)
    }
    return filepath
  }

  // If server doesn't support range requests and we have a partial .tmp file, delete it
  if (!supportsRangeRequests && startByte > 0) {
    await deleteFileIfExists(tempPath)
    startByte = 0
    appendMode = false
  }

  const headers: Record<string, string> = {}
  if (supportsRangeRequests && startByte > 0) {
    headers.Range = `bytes=${startByte}-`
  }

  const fetchStream = (hdrs: Record<string, string>) =>
    axios.get(url, { responseType: 'stream', headers: hdrs, signal, timeout })

  let response = await fetchStream(headers)

  if (response.status !== 200 && response.status !== 206) {
    throw new Error(`Failed to download: HTTP ${response.status}`)
  }

  // If we requested a range but the server returned 200 (ignored the Range header),
  // appending would corrupt the .tmp file — delete it and restart from byte 0.
  if (headers.Range && response.status === 200) {
    response.data.destroy()
    await deleteFileIfExists(tempPath)
    startByte = 0
    appendMode = false
    delete headers.Range
    response = await fetchStream(headers)
    if (response.status !== 200 && response.status !== 206) {
      throw new Error(`Failed to download: HTTP ${response.status}`)
    }
  }

  return new Promise((resolve, reject) => {
    let downloadedBytes = startByte
    let lastProgressTime = Date.now()
    let lastDownloadedBytes = startByte

    // Stall detection: if no data arrives for 5 minutes, abort the download
    const STALL_TIMEOUT_MS = 5 * 60 * 1000
    let stallTimer: ReturnType<typeof setTimeout> | null = null

    const clearStallTimer = () => {
      if (stallTimer) {
        clearTimeout(stallTimer)
        stallTimer = null
      }
    }

    const resetStallTimer = () => {
      clearStallTimer()
      stallTimer = setTimeout(() => {
        cleanup(new Error('Download stalled - no data received for 5 minutes'))
      }, STALL_TIMEOUT_MS)
    }

    // Progress tracking stream to monitor data flow
    const progressStream = new Transform({
      transform(chunk: Buffer, _: any, callback: Function) {
        downloadedBytes += chunk.length
        resetStallTimer()

        // Update progress tracking
        const now = Date.now()
        if (onProgress && now - lastProgressTime >= 500) {
          lastProgressTime = now
          lastDownloadedBytes = downloadedBytes
          onProgress({
            downloadedBytes,
            totalBytes,
            lastProgressTime,
            lastDownloadedBytes,
            url,
          })
        }

        this.push(chunk)
        callback()
      },
    })

    const writeStream = createWriteStream(tempPath, {
      flags: appendMode ? 'a' : 'w',
    })

    const cleanup = (error?: Error) => {
      clearStallTimer()
      progressStream.destroy()
      response.data.destroy()
      writeStream.destroy()
      if (error) {
        reject(error)
      }
    }

    response.data.on('error', cleanup)
    progressStream.on('error', cleanup)
    writeStream.on('error', cleanup)

    signal?.addEventListener('abort', () => {
      cleanup(new Error('Download aborted'))
    })

    writeStream.on('finish', async () => {
      clearStallTimer()
      try {
        // Atomically move the completed .tmp file to the final path
        await rename(tempPath, filepath)
      } catch (renameError) {
        // A parallel job may have completed the same file first — treat as success
        // if the destination already exists at the expected size.
        const existing = await getFileStatsIfExists(filepath)
        if (existing && Number(existing.size) === totalBytes && totalBytes > 0) {
          // fall through to resolve
        } else {
          reject(renameError)
          return
        }
      }
      if (onProgress) {
        onProgress({
          downloadedBytes,
          totalBytes,
          lastProgressTime: Date.now(),
          lastDownloadedBytes: downloadedBytes,
          url,
        })
      }
      if (onComplete) {
        await onComplete(url, filepath)
      }
      resolve(filepath)
    })

    // Start stall timer and pipe: response -> progressStream -> writeStream
    resetStallTimer()
    response.data.pipe(progressStream).pipe(writeStream)
  })
}

export async function doResumableDownloadWithRetry({
  url,
  filepath,
  signal,
  timeout = 30000,
  onProgress,
  max_retries = 3,
  retry_delay = 2000,
  onAttemptError,
  allowedMimeTypes,
}: DoResumableDownloadWithRetryParams): Promise<string> {
  const dirname = path.dirname(filepath)
  await ensureDirectoryExists(dirname)

  let attempt = 0
  let lastError: Error | null = null

  while (attempt < max_retries) {
    try {
      const result = await doResumableDownload({
        url,
        filepath,
        signal,
        timeout,
        allowedMimeTypes,
        onProgress,
      })

      return result // return on success
    } catch (error: any) {
      attempt++
      lastError = error as Error

      const isAborted = error.name === 'AbortError' || error.code === 'ABORT_ERR'
      const isNetworkError =
        error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT'

      onAttemptError?.(error, attempt)
      if (isAborted) {
        throw new Error(`Download aborted for URL: ${url}`)
      }

      if (attempt < max_retries && isNetworkError) {
        await delay(retry_delay)
        continue
      }

      // If max retries reached or non-retriable error, throw
      if (attempt >= max_retries || !isNetworkError) {
        throw error
      }
    }
  }

  // should not reach here, but TypeScript needs a return
  throw lastError || new Error('Unknown error during download')
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
