import { useEffect, useRef, useState } from 'react'
import { useTransmit } from 'react-adonis-transmit'

export type OllamaModelDownload = {
    model: string
    percent: number
    timestamp: string
    error?: string
}

export default function useOllamaModelDownloads() {
    const { subscribe } = useTransmit()
    const [downloads, setDownloads] = useState<Map<string, OllamaModelDownload>>(new Map())
    const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

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

    return { downloads: downloadsArray, activeCount: downloads.size }
}
