import { useEffect, useState } from 'react'
import { useTransmit } from 'react-adonis-transmit'

export type OllamaModelDownload = {
    model: string
    percent: number
    timestamp: string
}

export default function useOllamaModelDownloads() {
    const { subscribe } = useTransmit()
    const [downloads, setDownloads] = useState<Map<string, OllamaModelDownload>>(new Map())

    useEffect(() => {
        const unsubscribe = subscribe('ollama-model-download', (data: OllamaModelDownload) => {
            setDownloads((prev) => {
                const updated = new Map(prev)

                if (data.percent >= 100) {
                    // If download is complete, keep it for a short time before removing to allow UI to show 100% progress
                    updated.set(data.model, data)
                    setTimeout(() => {
                        setDownloads((current) => {
                            const next = new Map(current)
                            next.delete(data.model)
                            return next
                        })
                    }, 2000)
                } else {
                    updated.set(data.model, data)
                }

                return updated
            })
        })

        return () => {
            unsubscribe()
        }
    }, [subscribe])

    const downloadsArray = Array.from(downloads.values())

    return { downloads: downloadsArray, activeCount: downloads.size }
}
