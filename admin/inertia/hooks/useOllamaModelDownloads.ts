import { useCallback, useEffect, useRef, useState } from 'react'
import { useTransmit } from 'react-adonis-transmit'

export type OllamaModelDownload = {
    model: string
    percent: number
    timestamp: string
    /**
     * BullMQ job id — included on progress events from v1.32+ so the frontend can
     * call the cancel API. Optional for backward compat with stale broadcasts during
     * a hot upgrade.
     */
    jobId?: string
    /**
     * Aggregate bytes across all blobs in the model pull, summed from Ollama's
     * per-digest progress events on the backend. Optional for backward compat.
     */
    downloadedBytes?: number
    totalBytes?: number
    error?: string
    /** Set to 'cancelled' alongside percent === -2 when the user cancels the download */
    status?: 'cancelled'
}

export default function useOllamaModelDownloads() {
    const { subscribe } = useTransmit()
    const [downloads, setDownloads] = useState<Map<string, OllamaModelDownload>>(new Map())
    const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

    /**
     * Optimistically remove a download from local state — used by the cancel UI to clear
     * the entry immediately on a successful API call, in case the Transmit cancelled
     * broadcast arrives late or the SSE connection drops at exactly the wrong moment.
     */
    const removeDownload = useCallback((model: string) => {
        setDownloads((current) => {
            const next = new Map(current)
            next.delete(model)
            return next
        })
    }, [])

    useEffect(() => {
        const unsubscribe = subscribe('ollama-model-download', (data: OllamaModelDownload) => {
            setDownloads((prev) => {
                const updated = new Map(prev)

                if (data.percent === -1) {
                    // Download failed — show error state, auto-remove after 15 seconds
                    updated.set(data.model, data)
                    const errorTimeout = setTimeout(() => {
                        timeoutsRef.current.delete(errorTimeout)
                        setDownloads((current) => {
                            const next = new Map(current)
                            next.delete(data.model)
                            return next
                        })
                    }, 15000)
                    timeoutsRef.current.add(errorTimeout)
                } else if (data.percent === -2) {
                    // Download cancelled — clear quickly (matches the completion TTL).
                    // Component-level optimistic removal usually beats this branch, but it's
                    // here as a safety net for cases where the cancel comes from another tab
                    // or another client.
                    const cancelTimeout = setTimeout(() => {
                        timeoutsRef.current.delete(cancelTimeout)
                        setDownloads((current) => {
                            const next = new Map(current)
                            next.delete(data.model)
                            return next
                        })
                    }, 2000)
                    timeoutsRef.current.add(cancelTimeout)
                    updated.delete(data.model)
                } else if (data.percent >= 100) {
                    // If download is complete, keep it for a short time before removing to allow UI to show 100% progress
                    updated.set(data.model, data)
                    const timeout = setTimeout(() => {
                        timeoutsRef.current.delete(timeout)
                        setDownloads((current) => {
                            const next = new Map(current)
                            next.delete(data.model)
                            return next
                        })
                    }, 2000)
                    timeoutsRef.current.add(timeout)
                } else {
                    updated.set(data.model, data)
                }

                return updated
            })
        })

        return () => {
            unsubscribe()
            timeoutsRef.current.forEach(clearTimeout)
            timeoutsRef.current.clear()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subscribe])

    const downloadsArray = Array.from(downloads.values())

    return { downloads: downloadsArray, activeCount: downloads.size, removeDownload }
}
