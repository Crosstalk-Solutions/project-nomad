import { useCallback, useRef, useState } from 'react'
import useOllamaModelDownloads from '~/hooks/useOllamaModelDownloads'
import StyledSectionHeader from './StyledSectionHeader'
import StyledModal from './StyledModal'
import { IconAlertTriangle, IconLoader2, IconX } from '@tabler/icons-react'
import api from '~/lib/api'
import { useModals } from '~/context/ModalContext'
import { formatBytes } from '~/lib/util'

interface ActiveModelDownloadsProps {
    withHeader?: boolean
}

function formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec <= 0) return '0 B/s'
    if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

const ActiveModelDownloads = ({ withHeader = false }: ActiveModelDownloadsProps) => {
    const { downloads, removeDownload } = useOllamaModelDownloads()
    const { openModal, closeAllModals } = useModals()
    const [cancellingModels, setCancellingModels] = useState<Set<string>>(new Set())

    // Track previous downloadedBytes for speed calculation — mirrors the approach in
    // ActiveDownloads.tsx so content + model downloads feel identical.
    const prevBytesRef = useRef<Map<string, { bytes: number; time: number }>>(new Map())
    const speedRef = useRef<Map<string, number[]>>(new Map())

    const getSpeed = useCallback((model: string, currentBytes?: number): number => {
        if (!currentBytes || currentBytes <= 0) return 0

        const prev = prevBytesRef.current.get(model)
        const now = Date.now()

        if (prev && prev.bytes > 0 && currentBytes > prev.bytes) {
            const deltaBytes = currentBytes - prev.bytes
            const deltaSec = (now - prev.time) / 1000
            if (deltaSec > 0) {
                const instantSpeed = deltaBytes / deltaSec

                // Simple moving average (last 5 samples)
                const samples = speedRef.current.get(model) || []
                samples.push(instantSpeed)
                if (samples.length > 5) samples.shift()
                speedRef.current.set(model, samples)

                const avg = samples.reduce((a, b) => a + b, 0) / samples.length
                prevBytesRef.current.set(model, { bytes: currentBytes, time: now })
                return avg
            }
        }

        // Only set initial observation; never advance timestamp when bytes unchanged
        if (!prev) {
            prevBytesRef.current.set(model, { bytes: currentBytes, time: now })
        }
        return speedRef.current.get(model)?.at(-1) || 0
    }, [])

    const runCancel = async (download: { model: string; jobId?: string }) => {
        // Defensive guard: stale broadcasts during a hot upgrade may not include jobId.
        // Without it we have nothing to call the cancel API with.
        if (!download.jobId) return

        setCancellingModels((prev) => new Set(prev).add(download.model))
        try {
            await api.cancelDownloadJob(download.jobId)
            // Optimistically clear the entry — the Transmit cancelled broadcast usually
            // arrives within a second but we don't want to leave the row hanging if it doesn't.
            removeDownload(download.model)
            // Clean up speed tracking refs for this model
            prevBytesRef.current.delete(download.model)
            speedRef.current.delete(download.model)
        } finally {
            setCancellingModels((prev) => {
                const next = new Set(prev)
                next.delete(download.model)
                return next
            })
        }
    }

    const confirmCancel = (download: { model: string; jobId?: string }) => {
        if (!download.jobId) return

        openModal(
            <StyledModal
                title="Cancel Download?"
                onConfirm={() => {
                    closeAllModals()
                    runCancel(download)
                }}
                onCancel={closeAllModals}
                open={true}
                confirmText="Cancel Download"
                cancelText="Keep Downloading"
            >
                <div className="space-y-3 text-text-primary">
                    <p>
                        Stop downloading <span className="font-mono font-semibold">{download.model}</span>?
                    </p>
                    <p className="text-sm text-text-muted">
                        Any data already downloaded will remain on disk. If you re-download
                        this model later, it will resume from where it left off rather than
                        starting over.
                    </p>
                </div>
            </StyledModal>,
            'confirm-cancel-model-download-modal'
        )
    }

    return (
        <>
            {withHeader && <StyledSectionHeader title="Active Model Downloads" className="mt-12 mb-4" />}
            <div className="space-y-4">
                {downloads && downloads.length > 0 ? (
                    downloads.map((download) => {
                        const isCancelling = cancellingModels.has(download.model)
                        const canCancel = !!download.jobId && !download.error
                        const speed = getSpeed(download.model, download.downloadedBytes)
                        const hasBytes = !!(download.downloadedBytes && download.totalBytes)

                        return (
                            <div
                                key={download.model}
                                className={`rounded-lg p-4 border shadow-sm hover:shadow-lg transition-shadow ${
                                    download.error
                                        ? 'bg-surface-primary border-red-300'
                                        : 'bg-surface-primary border-default'
                                }`}
                            >
                                {download.error ? (
                                    <div className="flex items-center gap-2">
                                        <IconAlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-text-primary truncate">
                                                {download.model}
                                            </p>
                                            <p className="text-xs text-red-600 mt-0.5">{download.error}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {/* Title + Cancel button row */}
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-desert-green truncate">
                                                    {download.model}
                                                </p>
                                                <span className="text-xs px-1.5 py-0.5 rounded bg-desert-stone-lighter text-desert-stone-dark font-mono">
                                                    ollama
                                                </span>
                                            </div>
                                            {canCancel && (
                                                isCancelling ? (
                                                    <IconLoader2 className="w-4 h-4 text-text-muted animate-spin flex-shrink-0" />
                                                ) : (
                                                    <button
                                                        onClick={() => confirmCancel(download)}
                                                        className="flex-shrink-0 p-1 rounded hover:bg-red-100 transition-colors"
                                                        title="Cancel download"
                                                    >
                                                        <IconX className="w-4 h-4 text-text-muted hover:text-red-500" />
                                                    </button>
                                                )
                                            )}
                                        </div>

                                        {/* Size info */}
                                        <div className="flex justify-between items-baseline text-sm text-text-muted font-mono">
                                            <span>
                                                {hasBytes
                                                    ? `${formatBytes(download.downloadedBytes!, 1)} / ${formatBytes(download.totalBytes!, 1)}`
                                                    : `${download.percent.toFixed(1)}% / 100%`}
                                            </span>
                                        </div>

                                        {/* Progress bar */}
                                        <div className="relative">
                                            <div className="h-6 bg-desert-green-lighter bg-opacity-20 rounded-lg border border-default overflow-hidden">
                                                <div
                                                    className="h-full rounded-lg transition-all duration-1000 ease-out bg-desert-green"
                                                    style={{ width: `${download.percent}%` }}
                                                />
                                            </div>
                                            <div
                                                className={`absolute top-1/2 -translate-y-1/2 font-bold text-xs ${
                                                    download.percent > 15
                                                        ? 'left-2 text-white drop-shadow-md'
                                                        : 'right-2 text-desert-green'
                                                }`}
                                            >
                                                {Math.round(download.percent)}%
                                            </div>
                                        </div>

                                        {/* Status indicator */}
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                            <span className="text-xs text-text-muted">
                                                Downloading...{speed > 0 ? ` ${formatSpeed(speed)}` : ''}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })
                ) : (
                    <p className="text-text-muted">No active model downloads</p>
                )}
            </div>
        </>
    )
}

export default ActiveModelDownloads
