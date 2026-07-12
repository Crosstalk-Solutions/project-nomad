import { useCallback, useEffect, useRef, useState } from 'react'
import { useTransmit } from 'react-adonis-transmit'
import { BROADCAST_CHANNELS } from '../../constants/broadcast'
import type {
  BenchmarkProgress,
  BenchmarkTelemetry,
  BenchmarkStatus,
  BenchmarkStageDescriptor,
  BenchmarkPartialResult,
} from '../../types/benchmark'

// Rolling window length for the sparklines (~1 minute at 1 Hz).
const RING = 60

export type BenchmarkProgressWithID = BenchmarkProgress & { benchmark_id: string }

type LiveState = {
  perCore: number[]
  cpuOverall: number
  cpuHistory: number[]
  tempC: number | null
  diskReadMbs: number
  diskWriteMbs: number
  diskReadHistory: number[]
  diskWriteHistory: number[]
  aiTokensPerSec: number | null
  aiTokHistory: number[]
  aiTtftMs: number | null
  cpuEventsPerSec: number | null
  cpuEventsHistory: number[]
  /** Authoritative in-test disk throughput (sysbench interim lines), MiB/s. */
  diskMibs: number | null
  diskMibsHistory: number[]
  /** NVIDIA GPU stats during the AI stage (null when no GPU / not sampling). */
  gpuUtil: number | null
  gpuVramUsedMb: number | null
  gpuVramTotalMb: number | null
}

const EMPTY_LIVE: LiveState = {
  perCore: [],
  cpuOverall: 0,
  cpuHistory: [],
  tempC: null,
  diskReadMbs: 0,
  diskWriteMbs: 0,
  diskReadHistory: [],
  diskWriteHistory: [],
  aiTokensPerSec: null,
  aiTokHistory: [],
  aiTtftMs: null,
  cpuEventsPerSec: null,
  cpuEventsHistory: [],
  diskMibs: null,
  diskMibsHistory: [],
  gpuUtil: null,
  gpuVramUsedMb: null,
  gpuVramTotalMb: null,
}

const pushRing = (arr: number[], v: number) => {
  const next = arr.length >= RING ? arr.slice(arr.length - RING + 1) : arr.slice()
  next.push(v)
  return next
}

/**
 * Owns the two benchmark SSE subscriptions (stage progress + high-rate
 * telemetry) and exposes a flat, render-ready view of a live run. All history
 * buffers are kept as fresh arrays so memoized children re-render on change.
 */
export function useBenchmarkRun(opts?: { onFinished?: (status: 'completed' | 'error', message: string) => void }) {
  const { subscribe } = useTransmit()
  const onFinishedRef = useRef(opts?.onFinished)
  onFinishedRef.current = opts?.onFinished

  const [progress, setProgress] = useState<BenchmarkProgressWithID | null>(null)
  const [live, setLive] = useState<LiveState>(EMPTY_LIVE)
  const [partials, setPartials] = useState<BenchmarkPartialResult[]>([])
  // Last-seen progress status, so stage transitions can reset in-test buffers.
  const lastStatusRef = useRef<BenchmarkStatus | null>(null)

  const reset = useCallback(() => {
    setProgress(null)
    setLive(EMPTY_LIVE)
    setPartials([])
    lastStatusRef.current = null
  }, [])

  useEffect(() => {
    const unsubProgress = subscribe(
      BROADCAST_CHANNELS.BENCHMARK_PROGRESS,
      (data: BenchmarkProgressWithID) => {
        setProgress(data)
        // On stage transition, clear the in-test buffers so each stage starts
        // clean (e.g. the disk-read throughput doesn't linger into the write
        // stage). Always-on host telemetry (perCore, cpuOverall, disk proxy,
        // temp) is intentionally left untouched.
        if (lastStatusRef.current !== data.status) {
          lastStatusRef.current = data.status
          setLive((prev) => ({
            ...prev,
            cpuEventsPerSec: null,
            cpuEventsHistory: [],
            diskMibs: null,
            diskMibsHistory: [],
          }))
        }
        if (data.partial_result) {
          const incoming = data.partial_result
          setPartials((prev) => {
            const idx = prev.findIndex((p) => p.status === incoming.status)
            if (idx >= 0) {
              const next = prev.slice()
              next[idx] = incoming
              return next
            }
            return [...prev, incoming]
          })
        }
        if (data.status === 'completed' || data.status === 'error') {
          onFinishedRef.current?.(data.status, data.message)
        }
      }
    )

    const unsubTelemetry = subscribe(
      BROADCAST_CHANNELS.BENCHMARK_TELEMETRY,
      (data: BenchmarkTelemetry) => {
        setLive((prev) => {
          const isTok = data.stage_metric?.kind === 'tokens_per_sec'
          const isEps = data.stage_metric?.kind === 'events_per_sec'
          const isMib = data.stage_metric?.kind === 'mib_s'
          return {
            perCore: data.cpu.per_core,
            cpuOverall: data.cpu.overall,
            cpuHistory: pushRing(prev.cpuHistory, data.cpu.overall),
            tempC: data.temp_c,
            diskReadMbs: data.disk.read_mb_s,
            diskWriteMbs: data.disk.write_mb_s,
            diskReadHistory: pushRing(prev.diskReadHistory, data.disk.read_mb_s),
            diskWriteHistory: pushRing(prev.diskWriteHistory, data.disk.write_mb_s),
            aiTokensPerSec: isTok ? data.stage_metric!.value : prev.aiTokensPerSec,
            aiTokHistory: isTok ? pushRing(prev.aiTokHistory, data.stage_metric!.value) : prev.aiTokHistory,
            aiTtftMs: isTok && data.stage_metric!.ttft_ms !== undefined ? data.stage_metric!.ttft_ms : prev.aiTtftMs,
            cpuEventsPerSec: isEps ? data.stage_metric!.value : prev.cpuEventsPerSec,
            cpuEventsHistory: isEps
              ? pushRing(prev.cpuEventsHistory, data.stage_metric!.value)
              : prev.cpuEventsHistory,
            diskMibs: isMib ? data.stage_metric!.value : prev.diskMibs,
            diskMibsHistory: isMib
              ? pushRing(prev.diskMibsHistory, data.stage_metric!.value)
              : prev.diskMibsHistory,
            gpuUtil: data.gpu ? data.gpu.util : prev.gpuUtil,
            gpuVramUsedMb: data.gpu ? data.gpu.vram_used_mb : prev.gpuVramUsedMb,
            gpuVramTotalMb: data.gpu ? data.gpu.vram_total_mb : prev.gpuVramTotalMb,
          }
        })
      }
    )

    return () => {
      unsubProgress()
      unsubTelemetry()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe])

  const status: BenchmarkStatus | null = progress?.status ?? null
  const stages: BenchmarkStageDescriptor[] = progress?.stages ?? []
  const stageIndex = progress?.stage_index ?? -1

  return {
    progress,
    status,
    stages,
    stageIndex,
    message: progress?.message ?? '',
    progressPercent: progress?.progress ?? 0,
    ...live,
    partials,
    reset,
  }
}

export type BenchmarkRunHook = ReturnType<typeof useBenchmarkRun>
