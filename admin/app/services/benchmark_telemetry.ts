import transmit from '@adonisjs/transmit/services/main'
import si from 'systeminformation'
import logger from '@adonisjs/core/services/logger'
import { BROADCAST_CHANNELS } from '../../constants/broadcast.js'
import type { BenchmarkStatus, BenchmarkTelemetry } from '../../types/benchmark.js'

const SAMPLE_INTERVAL_MS = 1000

/**
 * Samples host telemetry (per-core CPU load, temperature, disk throughput) on a
 * timer and broadcasts it over SSE while a benchmark runs. Read-only: the sampler
 * runs in the orchestration process, never inside the sysbench container, so it
 * cannot influence the scored numbers.
 *
 * Signals come from `systeminformation`, which reads the host's /proc and /sys
 * (not namespaced for these counters), so this works from inside a container too.
 * Temperature legitimately isn't available on every host (VMs, some hwmon-less
 * boards) and is reported as null rather than faked.
 */
export class BenchmarkTelemetrySampler {
  private timer: NodeJS.Timeout | null = null
  private readonly benchmarkId: string | null
  private status: BenchmarkStatus = 'starting'
  private startedAt = Date.now()
  private stageMetric: BenchmarkTelemetry['stage_metric'] | undefined
  private gpu: BenchmarkTelemetry['gpu'] | undefined
  private sampling = false

  constructor(benchmarkId: string | null) {
    this.benchmarkId = benchmarkId
  }

  start() {
    if (this.timer) return
    this.startedAt = Date.now()
    // Prime systeminformation's per-second deltas and emit an initial frame,
    // then continue on the interval.
    void this._sample()
    this.timer = setInterval(() => void this._sample(), SAMPLE_INTERVAL_MS)
  }

  /** Tag subsequent frames with the current stage; clears any prior in-test state. */
  setStage(status: BenchmarkStatus) {
    this.status = status
    this.stageMetric = undefined
    this.gpu = undefined
  }

  /** Inject an in-test metric (e.g. live AI tokens/sec) into subsequent frames. */
  setStageMetric(kind: NonNullable<BenchmarkTelemetry['stage_metric']>['kind'], value: number, ttftMs?: number) {
    this.stageMetric = { kind, value, ...(ttftMs !== undefined ? { ttft_ms: ttftMs } : {}) }
  }

  /** Inject NVIDIA GPU stats into subsequent frames (null clears them). */
  setGpuStats(gpu: NonNullable<BenchmarkTelemetry['gpu']> | null) {
    this.gpu = gpu ?? undefined
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async _sample() {
    // Skip if the previous sample is still in flight (currentLoad can take a
    // couple hundred ms); never let samples pile up.
    if (this.sampling) return
    this.sampling = true
    try {
      const [load, temp, fs] = await Promise.all([
        si.currentLoad().catch(() => null),
        si.cpuTemperature().catch(() => null),
        si.fsStats().catch(() => null),
      ])

      const overall = load ? Math.max(0, Math.round(load.currentLoad)) : 0
      const perCore = load?.cpus?.map((c) => Math.max(0, Math.round(c.load))) ?? []
      const tempC = temp && typeof temp.main === 'number' && temp.main > 0 ? Math.round(temp.main) : null
      const readMb = fs && typeof fs.rx_sec === 'number' && fs.rx_sec >= 0 ? Number((fs.rx_sec / 1e6).toFixed(1)) : 0
      const writeMb = fs && typeof fs.wx_sec === 'number' && fs.wx_sec >= 0 ? Number((fs.wx_sec / 1e6).toFixed(1)) : 0

      const payload: BenchmarkTelemetry = {
        benchmark_id: this.benchmarkId,
        status: this.status,
        t: Date.now() - this.startedAt,
        cpu: { overall, per_core: perCore },
        temp_c: tempC,
        disk: { read_mb_s: readMb, write_mb_s: writeMb },
        ...(this.stageMetric ? { stage_metric: this.stageMetric } : {}),
        ...(this.gpu ? { gpu: this.gpu } : {}),
      }

      transmit.broadcast(BROADCAST_CHANNELS.BENCHMARK_TELEMETRY, payload)
    } catch (err) {
      logger.debug(`[BenchmarkTelemetry] sample failed: ${err.message}`)
    } finally {
      this.sampling = false
    }
  }
}
