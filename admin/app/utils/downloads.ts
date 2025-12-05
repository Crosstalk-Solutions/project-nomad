import {
  DoBackgroundDownloadParams,
  DoResumableDownloadParams,
  DoResumableDownloadProgress,
  DoResumableDownloadWithRetryParams,
  DoSimpleDownloadParams,
} from '../../types/downloads.js'
import axios from 'axios'
import { Transform } from 'stream'
import { deleteFileIfExists, ensureDirectoryExists, getFileStatsIfExists } from './fs.js'
import { createWriteStream } from 'fs'
import { formatSpeed } from './misc.js'
import { DownloadProgress } from '../../types/files.js'
import transmit from '@adonisjs/transmit/services/main'
import logger from '@adonisjs/core/services/logger'
import path from 'path'

export async function doSimpleDownload({
  url,
  filepath,
  timeout = 30000,
  signal,
}: DoSimpleDownloadParams): Promise<string> {
  const dirname = path.dirname(filepath)
  await ensureDirectoryExists(dirname)

  const response = await axios.get(url, {
    responseType: 'stream',
    signal,
    timeout,
  })
  const writer = createWriteStream(filepath)
  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      resolve(filepath)
    })
    writer.on('error', (error) => {
      reject(error)
    })
  })
}

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
  forceNew = false,
  allowedMimeTypes,
}: DoResumableDownloadParams): Promise<string> {
  const dirname = path.dirname(filepath)
  await ensureDirectoryExists(dirname)

  // Check if partial file exists for resume
  let startByte = 0
  let appendMode = false

  const existingStats = await getFileStatsIfExists(filepath)
  if (existingStats && !forceNew) {
    startByte = existingStats.size
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

  // If file is already complete and not forcing overwrite just return filepath
  if (startByte === totalBytes && totalBytes > 0 && !forceNew) {
    return filepath
  }

  // If server doesn't support range requests and we have a partial file, delete it
  if (!supportsRangeRequests && startByte > 0) {
    await deleteFileIfExists(filepath)
    startByte = 0
    appendMode = false
  }

  const headers: Record<string, string> = {}
  if (supportsRangeRequests && startByte > 0) {
    headers.Range = `bytes=${startByte}-`
  }

  const response = await axios.get(url, {
    responseType: 'stream',
    headers,
    signal,
    timeout,
  })

  if (response.status !== 200 && response.status !== 206) {
    throw new Error(`Failed to download: HTTP ${response.status}`)
  }

  return new Promise((resolve, reject) => {
    let downloadedBytes = startByte
    let lastProgressTime = Date.now()
    let lastDownloadedBytes = startByte

    // Progress tracking stream to monitor data flow
    const progressStream = new Transform({
      transform(chunk: Buffer, _: any, callback: Function) {
        downloadedBytes += chunk.length

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

    const writeStream = createWriteStream(filepath, {
      flags: appendMode ? 'a' : 'w',
    })

    // Handle errors and cleanup
    const cleanup = (error?: Error) => {
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
    writeStream.on('error', cleanup)

    signal?.addEventListener('abort', () => {
      cleanup(new Error('Download aborted'))
    })

    writeStream.on('finish', () => {
      if (onProgress) {
        onProgress({
          downloadedBytes,
          totalBytes,
          lastProgressTime: Date.now(),
          lastDownloadedBytes: downloadedBytes,
          url,
        })
      }
      resolve(filepath)
    })

    // Pipe: response -> progressStream -> writeStream
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
    } catch (error) {
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

export async function doBackgroundDownload(params: DoBackgroundDownloadParams): Promise<void> {
  const { url, filepath, channel, activeDownloads, onComplete, ...restParams } = params

  try {
    const dirname = path.dirname(filepath)
    await ensureDirectoryExists(dirname)

    const abortController = new AbortController()
    activeDownloads.set(url, abortController)

    await doResumableDownloadWithRetry({
      url,
      filepath,
      signal: abortController.signal,
      ...restParams,
      onProgress: (progressData) => {
        sendProgressBroadcast(channel, progressData)
      },
    })

    sendCompletedBroadcast(channel, url, filepath)

    if (onComplete) {
      await onComplete(url, filepath)
    }
  } catch (error) {
    logger.error(`Background download failed for ${url}: ${error.message}`)
    sendErrorBroadcast(channel, url, error.message)
  } finally {
    activeDownloads.delete(url)
  }
}

export function sendProgressBroadcast(
  channel: string,
  progressData: DoResumableDownloadProgress,
  status = 'in_progress'
) {
  const { downloadedBytes, totalBytes, lastProgressTime, lastDownloadedBytes, url } = progressData
  const now = Date.now()
  const timeDiff = (now - lastProgressTime) / 1000
  const bytesDiff = downloadedBytes - lastDownloadedBytes
  const rawSpeed = timeDiff > 0 ? bytesDiff / timeDiff : 0
  const timeRemaining = rawSpeed > 0 ? (totalBytes - downloadedBytes) / rawSpeed : 0
  const speed = formatSpeed(rawSpeed)

  const progress: DownloadProgress = {
    downloaded_bytes: downloadedBytes,
    total_bytes: totalBytes,
    percentage: totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0,
    speed,
    time_remaining: timeRemaining,
  }

  transmit.broadcast(channel, { url, progress, status })
}

export function sendCompletedBroadcast(channel: string, url: string, path: string) {
  transmit.broadcast(channel, {
    url,
    path,
    status: 'completed',
    progress: {
      downloaded_bytes: 0,
      total_bytes: 0,
      percentage: 100,
      speed: '0 B/s',
      time_remaining: 0,
    },
  })
}

export function sendErrorBroadcast(channel: string, url: string, errorMessage: string) {
  transmit.broadcast(channel, { url, error: errorMessage, status: 'failed' })
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
