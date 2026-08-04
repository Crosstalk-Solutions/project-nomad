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
import logger from '@adonisjs/core/services/logger'

/**
 * A gated source rejected this install's credentials (401/403).
 *
 * Permanent by nature: whether the entitlement key is baked in is a property of
 * the build, so no amount of retrying changes the answer. Declared here rather
 * than thrown as an UnrecoverableError directly so this module stays free of a
 * BullMQ dependency — RunDownloadJob translates it at the queue boundary.
 */
export class GatedContentAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GatedContentAuthError'
  }
}

// Some upstream mirrors reject requests with a missing or generic User-Agent.
// Notably, download.kiwix.org routes the large Wikimedia-family ZIMs (Wikipedia,
// Wikiversity, Wikibooks — including the flagship full Wikipedia) to
// dumps.wikimedia.org, which returns HTTP 403 for a default `axios/x` (or empty)
// User-Agent per Wikimedia's UA policy. Identify ourselves descriptively so
// those downloads succeed.
const DOWNLOAD_HEADERS: Record<string, string> = {
  'User-Agent': 'ProjectNOMAD/1.0 (+https://projectnomad.us)',
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
  onComplete,
  forceNew = false,
  allowedMimeTypes,
  requestHeaders,
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

  // Merge default headers with any caller-supplied headers (e.g. Creator Packs' Authorization)
  const headers: Record<string, string> = { ...DOWNLOAD_HEADERS, ...requestHeaders }

  // Get file info with HEAD request first. Gated sources (Creator Packs) require
  // the auth header on the HEAD too, or the probe 401s before the GET is reached.
  let headResponse
  try {
    headResponse = await axios.head(url, {
      signal,
      timeout,
      headers,
    })
  } catch (error: any) {
    // A 401/403 from a gated source is not a network problem and the raw axios
    // message ("Request failed with status code 401") reads like our server is
    // broken. Translate it, because the actual cause is almost always a build
    // without the entitlement key baked in — i.e. not an official release.
    // failedReason is surfaced verbatim on the downloads UI.
    const status = error?.response?.status
    if (status === 401 || status === 403) {
      throw new GatedContentAuthError(
        'This content is hosted by Project NOMAD and requires an official release build. ' +
          `The download server rejected this install's credentials (HTTP ${status}).`
      )
    }
    throw error
  }

  // Some upstream hosts (notably download.kiwix.org for .zim files) don't set a
  // Content-Type header at all. Per RFC 7231 §3.1.1.5, "if no Content-Type is
  // provided" the recipient may treat it as application/octet-stream — which is
  // already in every binary-content allowlist we use (ZIM, PMTILES, base assets).
  // Without this default, the validator below throws `MIME type  is not allowed`
  // and breaks all downloads from kiwix's primary host (#848).
  const contentType =
    headResponse.headers['content-type']?.toString() || 'application/octet-stream'
  const totalBytes = parseInt(headResponse.headers['content-length']?.toString() || '0', 10)
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

  // A .tmp bigger than the file now on the server cannot be a prefix of it — the
  // publisher replaced the file under the same name (openZIM rolls builds forward,
  // see #1189/#1187). Resuming would ask for a range past the end and get a 416 on
  // every attempt, with nothing deleting the .tmp, so the download could never
  // recover on its own. Discard and start clean.
  if (startByte > totalBytes && totalBytes > 0) {
    logger.warn(
      `[Download] Discarding stale partial for ${filepath}: .tmp is ${startByte}B but the server reports ${totalBytes}B`
    )
    await deleteFileIfExists(tempPath)
    startByte = 0
    appendMode = false
  }

  // Add Range header if resuming
  if (supportsRangeRequests && startByte > 0) {
    headers.Range = `bytes=${startByte}-`
  }

  const fetchStream = (headers: Record<string, string>) =>
    axios.get(url, {
      responseType: 'stream',
      headers,
      signal,
      timeout,
    })

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
