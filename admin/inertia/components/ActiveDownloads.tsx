import { useRef, useState, useCallback } from 'react'
import useDownloads, { useDownloadsProps } from '~/hooks/useDownloads'
import { extractFileName, formatBytes } from '~/lib/util'
import StyledSectionHeader from './StyledSectionHeader'
import { IconAlertTriangle, IconX, IconLoader2 } from '@tabler/icons-react'
import api from '~/lib/api'

interface ActiveDownloadProps {
  filetype?: useDownloadsProps['filetype']
  withHeader?: boolean
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0 B/s'
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

type DownloadStatus = 'queued' | 'active' | 'stalled' | 'failed'

function getDownloadStatus(download: {
  progress: number
  lastProgressTime?: number
  status?: string
}): DownloadStatus {
  if (download.status === 'failed') return 'failed'
  if (download.progress === 0 && !download.lastProgressTime) return 'queued'
  if (download.lastProgressTime) {
    const elapsed = Date.now() - download.lastProgressTime
    if (elapsed > 60_000) return 'stalled'
  }
  return 'active'
}

const ActiveDownloads = ({ filetype, withHeader = false }: ActiveDownloadProps) => {
  const { data: downloads, invalidate } = useDownloads({ filetype })
  const [cancellingJobs, setCancellingJobs] = useState<Set<string>>(new Set())
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null)

  // Track previous downloadedBytes for speed calculation
  const prevBytesRef = useRef<Map<string, { bytes: number; time: number }>>(new Map())
  const speedRef = useRef<Map<string, number[]>>(new Map())

  const getSpeed = useCallback(
    (jobId: string, currentBytes?: number): number => {
      if (!currentBytes || currentBytes <= 0) return 0

      const prev = prevBytesRef.current.get(jobId)
      const now = Date.now()

      if (prev && prev.bytes > 0 && currentBytes > prev.bytes) {
        const deltaBytes = currentBytes - prev.bytes
        const deltaSec = (now - prev.time) / 1000
        if (deltaSec > 0) {
          const instantSpeed = deltaBytes / deltaSec

          // Simple moving average (last 5 samples)
          const samples = speedRef.current.get(jobId) || []
          samples.push(instantSpeed)
          if (samples.length > 5) samples.shift()
          speedRef.current.set(jobId, samples)

          const avg = samples.reduce((a, b) => a + b, 0) / samples.length
          prevBytesRef.current.set(jobId, { bytes: currentBytes, time: now })
          return avg
        }
      }

      // Only set initial observation; never advance timestamp when bytes unchanged
      if (!prev) {
        prevBytesRef.current.set(jobId, { bytes: currentBytes, time: now })
      }
      return speedRef.current.get(jobId)?.at(-1) || 0
    },
    []
  )

  const handleDismiss = async (jobId: string) => {
    await api.removeDownloadJob(jobId)
    invalidate()
  }

  const handleCancel = async (jobId: string) => {
    setCancellingJobs((prev) => new Set(prev).add(jobId))
    setConfirmingCancel(null)
    try {
      await api.cancelDownloadJob(jobId)
      // Clean up speed tracking refs
      prevBytesRef.current.delete(jobId)
      speedRef.current.delete(jobId)
    } finally {
      setCancellingJobs((prev) => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
      invalidate()
    }
  }

  return (
    <>
      {withHeader && <StyledSectionHeader title="Active Downloads" className="mt-12 mb-4" />}
      <div className="space-y-4">
        {downloads && downloads.length > 0 ? (
          downloads.map((download) => {
            const filename = extractFileName(download.filepath) || download.url
            const status = getDownloadStatus(download)
            const speed = getSpeed(download.jobId, download.downloadedBytes)
            const isCancelling = cancellingJobs.has(download.jobId)
            const isConfirming = confirmingCancel === download.jobId

            return (
              <div
                key={download.jobId}
                className={`rounded-lg p-4 border shadow-sm hover:shadow-lg transition-shadow ${
                  status === 'failed'
                    ? 'bg-surface-primary border-red-300'
                    : 'bg-surface-primary border-default'
                }`}
              >
                {status === 'failed' ? (
                  <div className="flex items-center gap-2">
                    <IconAlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {download.title || filename}
                      </p>
                      {download.title && (
                        <p className="text-xs text-text-muted truncate">{filename}</p>
                      )}
                      <p className="text-xs text-red-600 mt-0.5">
                        Download failed{download.failedReason ? `: ${download.failedReason}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDismiss(download.jobId)}
                      className="flex-shrink-0 p-1 rounded hover:bg-red-100 transition-colors"
                      title="Dismiss failed download"
                    >
                      <IconX className="w-4 h-4 text-red-400 hover:text-red-600" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Title + Cancel button row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-desert-green truncate">
                          {download.title || filename}
                        </p>
                        {download.title && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-text-muted truncate font-mono">
                              {filename}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-desert-stone-lighter text-desert-stone-dark font-mono flex-shrink-0">
                              {download.filetype}
                            </span>
                          </div>
                        )}
                        {!download.title && download.filetype && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-desert-stone-lighter text-desert-stone-dark font-mono">
                            {download.filetype}
                          </span>
                        )}
                      </div>
                      {isConfirming ? (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleCancel(download.jobId)}
                            className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmingCancel(null)}
                            className="text-xs px-2 py-1 rounded bg-desert-stone-lighter text-text-muted hover:bg-desert-stone-light transition-colors"
                          >
                            Keep
                          </button>
                        </div>
                      ) : isCancelling ? (
                        <IconLoader2 className="w-4 h-4 text-text-muted animate-spin flex-shrink-0" />
                      ) : (
                        <button
                          onClick={() => setConfirmingCancel(download.jobId)}
                          className="flex-shrink-0 p-1 rounded hover:bg-red-100 transition-colors"
                          title="Cancel download"
                        >
                          <IconX className="w-4 h-4 text-text-muted hover:text-red-500" />
                        </button>
                      )}
                    </div>

                    {/* Size info */}
                    <div className="flex justify-between items-baseline text-sm text-text-muted font-mono">
                      <span>
                        {download.downloadedBytes && download.totalBytes
                          ? `${formatBytes(download.downloadedBytes, 1)} / ${formatBytes(download.totalBytes, 1)}`
                          : `${download.progress}% / 100%`}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="relative">
                      <div className="h-6 bg-desert-green-lighter bg-opacity-20 rounded-lg border border-default overflow-hidden">
                        <div
                          className="h-full rounded-lg transition-all duration-1000 ease-out bg-desert-green"
                          style={{ width: `${download.progress}%` }}
                        />
                      </div>
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 font-bold text-xs ${
                          download.progress > 15
                            ? 'left-2 text-white drop-shadow-md'
                            : 'right-2 text-desert-green'
                        }`}
                      >
                        {Math.round(download.progress)}%
                      </div>
                    </div>

                    {/* Status indicator */}
                    <div className="flex items-center gap-2">
                      {status === 'queued' && (
                        <>
                          <div className="w-2 h-2 rounded-full bg-desert-stone" />
                          <span className="text-xs text-text-muted">Waiting...</span>
                        </>
                      )}
                      {status === 'active' && (
                        <>
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-xs text-text-muted">
                            Downloading...{speed > 0 ? ` ${formatSpeed(speed)}` : ''}
                          </span>
                        </>
                      )}
                      {status === 'stalled' && download.lastProgressTime && (
                        <>
                          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                          <span className="text-xs text-orange-600">
                            No data received for{' '}
                            {Math.floor((Date.now() - download.lastProgressTime) / 60_000)}m...
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <p className="text-text-muted">No active downloads</p>
        )}
      </div>
    </>
  )
}

export default ActiveDownloads
