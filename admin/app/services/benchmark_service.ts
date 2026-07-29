import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import transmit from '@adonisjs/transmit/services/main'
import si from 'systeminformation'
import axios from 'axios'
import { DateTime } from 'luxon'
import BenchmarkResult from '#models/benchmark_result'
import BenchmarkSetting from '#models/benchmark_setting'
import { SystemService } from '#services/system_service'
import type {
  BenchmarkType,
  BenchmarkStatus,
  BenchmarkProgress,
  BenchmarkTelemetry,
  HardwareInfo,
  DiskType,
  SystemScores,
  AIScores,
  SysbenchCpuResult,
  SysbenchMemoryResult,
  SysbenchDiskResult,
  RepositorySubmissionV2,
  RepositorySubmitResponse,
  RepositoryStats,
  BenchmarkStageDescriptor,
  BenchmarkPartialResult,
  SystemBenchmarkOutput,
  SystemBenchmarkRawsV2,
  RunEnvironmentInfo,
} from '../../types/benchmark.js'
import KVStore from '#models/kv_store'
import { normalizeArchitecture, deriveOsName } from '../utils/platform_metadata.js'
import { getFreeBytes } from '../utils/image_disk_preflight.js'
import { readFile } from 'node:fs/promises'
import { randomUUID, createHmac } from 'node:crypto'
import { DockerService } from './docker_service.js'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import { BROADCAST_CHANNELS } from '../../constants/broadcast.js'
import { BenchmarkTelemetrySampler } from './benchmark_telemetry.js'
import Dockerode from 'dockerode'

// HMAC secret for signing submissions to the benchmark repository
// This provides basic protection against casual API abuse.
// Note: Since NOMAD is open source, a determined attacker could extract this.
// For stronger protection, see challenge-response authentication.
const BENCHMARK_HMAC_SECRET = '778ba65d0bc0e23119e5ffce4b3716648a7d071f0a47ec3f'

// Re-export default weights for use in service
const SCORE_WEIGHTS = {
  ai_tokens_per_second: 0.30,
  cpu: 0.25,
  memory: 0.15,
  ai_ttft: 0.10,
  disk_read: 0.10,
  disk_write: 0.10,
}

// The benchmark_version this client emits. Server dispatches on the major:
// >= 2 → raw-channel v2 ingest (score recomputed server-side). Bumped 1.0.0 -> 2.0.0
// for the NOMAD Score v2 rollout (uncapped index vs a frozen Reference Build).
const BENCHMARK_VERSION = '2.0.0'

// ---------------------------------------------------------------------------
// NOMAD Score v2 — the uncapped index.
//
// Score = 1000 × Π( (raw_i / ref_i) ^ w_i )  (weighted geometric mean, log domain).
//
// These constants + the computation below MUST stay byte-identical to the
// leaderboard's score_service.ts (computeNomadScoreV2): the client shows this
// score immediately after a run, and the server recomputes the same value from
// the raw channels on submit. Any drift makes the displayed score disagree with
// the leaderboard. FROZEN under benchmark_version 2.0.0 — Reference Build =
// NOMAD6 (Ryzen 9 PRO 8945HS / 780M / 64GB, kernel 6.17), measured median-of-N
// with direct-I/O disk 2026-07-12. There are NO clamps here; outlier control is
// the server's rejection gates + quarantine, not the score math.
const REFERENCE_SCORES_V2 = {
  // Measured on the Reference Build (NOMAD6, 780M) with llama3.1:8b under the v2
  // harness (VRAM evict + unload + num_predict=256 + median-of-3), iGPU
  // acceleration enabled (OLLAMA_IGPU_ENABLE — the config PR #1074 ships fleet-
  // wide). Must stay byte-identical to the leaderboard's score_service.ts. Final
  // confirm against the exact shipping Ollama config before v1.34.0 GA.
  ai_tokens_per_second: 13.2,
  cpu_events_multi: 19231, // all-threads on the reference box (16T)
  cpu_events_single: 2351, // 1T
  memory_ops_per_sec: 26862960, // 4T, 1K block (bandwidth peak)
  disk_read_mb_per_sec: 1072, // O_DIRECT
  disk_write_mb_per_sec: 316, // O_DIRECT
} as const

const SCORE_WEIGHTS_V2 = {
  ai_tokens_per_second: 0.3,
  cpu_events_multi: 0.25,
  cpu_events_single: 0.1,
  memory_ops_per_sec: 0.1,
  disk_read_mb_per_sec: 0.125,
  disk_write_mb_per_sec: 0.125,
} as const

type ScoreChannelV2 = keyof typeof REFERENCE_SCORES_V2
type ScoreRawsV2 = Record<ScoreChannelV2, number>
const SCORE_CHANNELS_V2 = Object.keys(REFERENCE_SCORES_V2) as ScoreChannelV2[]

// Weights sum to 1.000; guard against a future typo silently rescaling scores.
const WEIGHT_SUM_V2 = SCORE_CHANNELS_V2.reduce((s, k) => s + SCORE_WEIGHTS_V2[k], 0)
if (Math.abs(WEIGHT_SUM_V2 - 1) > 1e-9) {
  throw new Error(`SCORE_WEIGHTS_V2 must sum to 1.0 (got ${WEIGHT_SUM_V2})`)
}

// Benchmark configuration constants
// Pinned by digest so a tag-format change can't silently break the parsers
// fleet-wide.
//
// Was severalnines/sysbench, which publishes amd64 ONLY — that locked ARM hosts
// out of the System Benchmark entirely (not a graceful failure: the container
// simply cannot run) and forced Apple Silicon through Rosetta emulation, which
// distorts the very measurement it is taking.
//
// This is our own multi-arch build (Debian 12 + sysbench 1.0.20+ds-5, built at
// Crosstalk-Solutions/nomad-sysbench for linux/amd64 + linux/arm64). ONE digest
// covers both architectures because a manifest list resolves per-arch on pull.
//
// Comparability: 1.0.17 -> 1.0.20 measured 1.25% apart on identical hardware
// with identical flags (7170.18 vs 7259.56 events/sec) — inside run-to-run
// noise, ~0.3% on a composite. No rescoring required. Both this and the legacy
// digest are allowlisted server-side, so the fleet can cross over gradually.
const SYSBENCH_IMAGE =
  'ghcr.io/crosstalk-solutions/nomad-sysbench@sha256:1f08e527f5d440135de9bd49006a2c13342cb1e483c59a53774e2db35e8e13f0'
const SYSBENCH_DIGEST = 'sha256:1f08e527f5d440135de9bd49006a2c13342cb1e483c59a53774e2db35e8e13f0'


const SYSBENCH_CONTAINER_NAME = 'nomad_benchmark_sysbench'

// Reference model for AI benchmark. v2 uses an 8B (was llama3.2:1b): a 1B is so
// light it runs overhead-bound on any GPU (~240 tok/s), saturating the score and
// failing to differentiate hardware. An 8B is compute/bandwidth-bound and scales
// with real GPU capability. Non-thinking (deterministic workload). Changing this
// re-baselines REFERENCE_SCORES_V2.ai_tokens_per_second — re-measure on the
// Reference Build (NOMAD6) before shipping.
const AI_BENCHMARK_MODEL = 'llama3.1:8b'
const AI_BENCHMARK_PROMPT = 'Explain recursion in programming in exactly 100 words.'
// Cap generation so the workload is bounded and comparable across machines rather
// than relying on the model honoring "100 words". ~100-150 tokens is plenty for a
// stable tok/s rate; the cap only trims pathological long outputs.
const AI_BENCHMARK_NUM_PREDICT = 256

// Memory test is frozen at 4 threads for the v2 Reference Build (the bandwidth
// peak on the reference box). Do not vary by core count — the reference number
// (REFERENCE_SCORES_V2.memory_ops_per_sec) was measured at exactly this value.
const MEMORY_BENCHMARK_THREADS = 4

// AI is measured as the median of N runs (W7) to damp per-run inference jitter.
const AI_BENCHMARK_RUNS = 3

/**
 * Does `ai.remoteOllamaUrl` point back at the machine NOMAD itself runs on?
 *
 * The submission gate exists because a remote AI host makes the AI channel
 * describe someone else's hardware. That reasoning does not apply when the
 * "remote" host is this same box — the commonest case being Ollama installed
 * natively on the host while NOMAD runs in Docker, which is how the AI
 * assistant is expected to work on macOS.
 *
 * `host.docker.internal` is the meaningful entry: from inside the admin
 * container it resolves to the host, and it is the form the setup flow accepts
 * for a native host install. Loopback is included for completeness (it only
 * reaches the container itself, so it is unlikely to have been saved, but it
 * unambiguously is not another machine).
 *
 * A LAN address is DELIBERATELY NOT exempt. `192.168.1.50` is indistinguishable
 * from another box on the same network, and wrongly exempting one would let a
 * genuinely remote GPU's throughput be attributed to this hardware. False
 * blocks are recoverable by clearing the setting; a false pass silently
 * corrupts the leaderboard.
 */
function isSelfHostedOllamaUrl(rawUrl: string): boolean {
  let host: string
  try {
    host = new URL(rawUrl.trim()).hostname.toLowerCase()
  } catch {
    return false
  }
  if (host === 'host.docker.internal' || host === 'gateway.docker.internal') return true
  if (host === 'localhost' || host === '::1' || host === '[::1]') return true
  // 127.0.0.0/8 — the whole loopback range, not just 127.0.0.1.
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  return false
}

/**
 * Is this GPU "model" a placeholder rather than a real name?
 *
 * systeminformation resolves PCI ids against the container's pci.ids database.
 * When a card is newer than that file it reports the raw id verbatim — an RTX
 * 5060 comes back as "Device 2d05". Vendor detection still succeeds, so these
 * strings otherwise pass as legitimate model names and reach the leaderboard.
 *
 * Matches the "Device <hex>" shape plus the empty/unknown cases. Deliberately
 * narrow: it must never reject a real product name, and no shipping GPU is
 * called "Device" followed by four hex digits.
 */
function isUnresolvedGpuModel(model: string): boolean {
  const s = model.trim()
  if (s === '') return true
  if (/^device\s+[0-9a-f]{4}$/i.test(s)) return true
  if (/^unknown$/i.test(s)) return true
  return false
}

// Minimum free disk required before pulling the AI model on first run. llama3.1:8b
// (Q4) is ~4.9 GB; this covers the model plus headroom for the transient sysbench
// disk-test file and normal slack. Only enforced when the model isn't already cached.
const AI_BENCHMARK_MODEL_MIN_FREE_BYTES = 6.5 * 1024 * 1024 * 1024

// Reference scores for normalization (calibrated to 0-100 scale)
// These represent "expected" scores for a mid-range system (score ~50)
const REFERENCE_SCORES = {
  cpu_events_per_second: 5000, // sysbench cpu events/sec for ~50 score
  memory_ops_per_second: 5000000, // sysbench memory ops/sec for ~50 score
  disk_read_mb_per_sec: 500, // 500 MB/s read for ~50 score
  disk_write_mb_per_sec: 400, // 400 MB/s write for ~50 score
  ai_tokens_per_second: 30, // 30 tok/s for ~50 score
  ai_ttft_ms: 500, // 500ms time to first token for ~50 score (lower is better)
}

@inject()
export class BenchmarkService {
  private currentBenchmarkId: string | null = null
  private currentStatus: BenchmarkStatus = 'idle'
  private currentStages: BenchmarkStageDescriptor[] = []
  private telemetry: BenchmarkTelemetrySampler | null = null

  constructor(private dockerService: DockerService) {}

  /**
   * Build the ordered stage plan for a run so the live UI can render a rail of
   * pending/active/complete nodes. Mirrors exactly the stages `_runBenchmark`
   * emits for the given type.
   */
  private _buildStageList(type: BenchmarkType, includeAI: boolean): BenchmarkStageDescriptor[] {
    const stages: BenchmarkStatus[] = ['detecting_hardware']
    if (type === 'full' || type === 'system') {
      stages.push('running_cpu', 'running_memory', 'running_disk_read', 'running_disk_write')
    }
    if (includeAI && (type === 'full' || type === 'ai')) {
      stages.push('running_ai')
    }
    stages.push('calculating_score')
    return stages.map((status) => ({ status, label: this._getStageLabel(status) }))
  }

  /**
   * Run a full benchmark suite
   */
  async runFullBenchmark(): Promise<BenchmarkResult> {
    return this._runBenchmark('full', true)
  }

  /**
   * Run system benchmarks only (CPU, memory, disk)
   */
  async runSystemBenchmarks(): Promise<BenchmarkResult> {
    return this._runBenchmark('system', false)
  }

  /**
   * Run AI benchmark only
   */
  async runAIBenchmark(): Promise<BenchmarkResult> {
    return this._runBenchmark('ai', true)
  }

  /**
   * Get the latest benchmark result
   */
  async getLatestResult(): Promise<BenchmarkResult | null> {
    return await BenchmarkResult.query().orderBy('created_at', 'desc').first()
  }

  /**
   * Get all benchmark results
   */
  async getAllResults(): Promise<BenchmarkResult[]> {
    return await BenchmarkResult.query().orderBy('created_at', 'desc')
  }

  /**
   * Get a specific benchmark result by ID
   */
  async getResultById(benchmarkId: string): Promise<BenchmarkResult | null> {
    return await BenchmarkResult.findBy('benchmark_id', benchmarkId)
  }

  /**
   * Whether to show the dashboard "re-run under Score v2" banner. Shown to users
   * who have a v1 leaderboard submission but no Score v2 result yet, and who
   * haven't dismissed it. Self-clears two ways: dismiss sets the KV flag, and any
   * result carrying a nomad_score_v2 (i.e. a v2 run happened) flips (b) false.
   */
  async shouldShowRerunBanner(): Promise<boolean> {
    const dismissed = await KVStore.getValue('benchmark.rerunBannerDismissed')
    if (dismissed === true) return false

    const hasV2Run = await BenchmarkResult.query().whereNotNull('nomad_score_v2').first()
    if (hasV2Run) return false

    const hasSubmittedV1 = await BenchmarkResult.query()
      .where('submitted_to_repository', true)
      .first()
    return hasSubmittedV1 !== null
  }

  /**
   * Submit benchmark results to central repository
   */
  async submitToRepository(benchmarkId?: string, anonymous?: boolean): Promise<RepositorySubmitResponse> {
    const result = benchmarkId
      ? await this.getResultById(benchmarkId)
      : await this.getLatestResult()

    if (!result) {
      throw new Error('No benchmark result found to submit')
    }

    // Only allow full benchmarks with AI data to be submitted to repository
    if (result.benchmark_type !== 'full') {
      throw new Error('Only full benchmarks can be shared with the community. Run a Full Benchmark to share your results.')
    }

    if (!result.ai_tokens_per_second || result.ai_tokens_per_second <= 0) {
      throw new Error('Benchmark must include AI performance data. Ensure AI Assistant is installed and run a Full Benchmark.')
    }

    if (result.submitted_to_repository) {
      throw new Error('Benchmark result has already been submitted')
    }

    // Remote inference cannot be attributed to this machine.
    //
    // DockerService.getServiceURL() resolves ai.remoteOllamaUrl ahead of the
    // local container, so when a remote host is configured the AI channel
    // measures THAT machine while every other channel measures this one. The
    // submission would report someone else's tok/s under this hardware, and AI
    // carries 0.30 of an uncapped v2 score, so the distortion is large.
    //
    // Blocks submission only — running the benchmark locally is still useful to
    // the operator, it just isn't a result about this box.
    // A "remote" host that points back at this same machine is not remote. The
    // AI ran on the hardware being submitted, so blocking it is a false
    // positive — see isSelfHostedOllamaUrl for which forms qualify and why a
    // LAN address deliberately does not.
    const remoteOllamaUrl = await KVStore.getValue('ai.remoteOllamaUrl')
    if (remoteOllamaUrl && isSelfHostedOllamaUrl(remoteOllamaUrl)) {
      logger.info(
        `[BenchmarkService] ai.remoteOllamaUrl (${remoteOllamaUrl}) points at this machine; treating the AI result as local for submission purposes`
      )
    } else if (remoteOllamaUrl) {
      throw new Error(
        // Name the setting and where it lives. The previous wording told the
        // user to install the AI Assistant, but configuring a remote host
        // already marks it installed — so it sent them looking for something
        // they believe they have, and never mentioned the one thing that fixes
        // it.
        'This NOMAD is set to use a remote AI host, so the AI portion of this benchmark measured that machine, not this one. ' +
          'Leaderboard results have to be measured entirely on the hardware being submitted. ' +
          'To share a result, clear the remote host under Settings → Models so AI runs locally, then run a Full Benchmark.'
      )
    }

    // Build the v2 payload (raw channels; server recomputes the score). Throws a
    // user-facing error if the row predates v2 and lacks the raw channels.
    const submission = this._buildV2Submission(result, anonymous ?? false)

    try {
      // Generate HMAC signature for submission verification
      const timestamp = Date.now().toString()
      const payload = timestamp + JSON.stringify(submission)
      const signature = createHmac('sha256', BENCHMARK_HMAC_SECRET)
        .update(payload)
        .digest('hex')

      const response = await axios.post(
        'https://benchmark.projectnomad.us/api/v1/submit',
        submission,
        {
          timeout: 30000,
          headers: {
            'X-NOMAD-Timestamp': timestamp,
            'X-NOMAD-Signature': signature,
          },
        }
      )

      if (response.data.success) {
        result.submitted_to_repository = true
        result.submitted_at = DateTime.now()
        result.repository_id = response.data.repository_id
        await result.save()

        await BenchmarkSetting.setValue('last_benchmark_run', new Date().toISOString())
      }

      return response.data as RepositorySubmitResponse
    } catch (error: any) {
      const detail = error.response?.data?.error || error.message || 'Unknown error'
      const statusCode = error.response?.status
      logger.error(`Failed to submit benchmark to repository: ${detail} (Status: ${statusCode})`)
      
      // Create an error with the status code and raw detail attached for proper
      // handling upstream (the controller surfaces `detail` as the user-facing reason).
      const err: any = new Error(`Failed to submit benchmark: ${detail}`)
      err.statusCode = statusCode
      err.detail = detail
      throw err
    }
  }

  /**
   * Build the NOMAD Score v2 submission payload from a stored result, validating
   * that every required raw channel + companion + provenance field is present.
   *
   * A row produced before this benchmark_version (or an interrupted run) won't
   * carry the v2 raws — rather than send a payload the leaderboard will reject
   * with a terse validator error, we throw a clear "re-run" message here.
   *
   * ai_time_to_first_token is stored in milliseconds but the leaderboard's v2 API
   * treats it as SECONDS, so it is divided by 1000 here.
   */
  private _buildV2Submission(result: BenchmarkResult, anonymous: boolean): RepositorySubmissionV2 {
    const reRun = 'Re-run a Full Benchmark to share your results.'

    // Required raw channels — all must be present and > 0.
    const requiredRaws: Array<[string, number | null]> = [
      ['CPU single-thread', result.cpu_events_single],
      ['CPU multi-thread', result.cpu_events_multi],
      ['memory', result.memory_ops_per_sec],
      ['disk read', result.disk_read_mb_per_sec],
      ['disk write', result.disk_write_mb_per_sec],
    ]
    for (const [label, value] of requiredRaws) {
      if (value == null || !(value > 0)) {
        throw new Error(`This benchmark is missing the ${label} raw measurement needed for the v2 leaderboard. ${reRun}`)
      }
    }

    if (result.ai_time_to_first_token == null || !(result.ai_time_to_first_token > 0)) {
      throw new Error(`This benchmark is missing AI time-to-first-token data. ${reRun}`)
    }
    if (
      result.cpu_benchmark_threads == null ||
      result.memory_threads == null ||
      result.cpu_total_events == null ||
      result.cpu_total_time == null
    ) {
      throw new Error(`This benchmark is missing CPU test parameters needed for the v2 leaderboard. ${reRun}`)
    }
    if (!result.sysbench_digest || !result.ollama_version) {
      throw new Error(`This benchmark is missing harness provenance (sysbench/Ollama version). ${reRun}`)
    }

    const submission: RepositorySubmissionV2 = {
      cpu_model: result.cpu_model,
      cpu_cores: result.cpu_cores,
      cpu_threads: result.cpu_threads,
      ram_gb: Math.round(result.ram_bytes / (1024 * 1024 * 1024)),
      disk_type: result.disk_type,
      gpu_model: result.gpu_model,
      ai_tokens_per_second: result.ai_tokens_per_second!,
      cpu_events_single: result.cpu_events_single!,
      cpu_events_multi: result.cpu_events_multi!,
      memory_ops_per_sec: result.memory_ops_per_sec!,
      disk_read_mb_per_sec: result.disk_read_mb_per_sec!,
      disk_write_mb_per_sec: result.disk_write_mb_per_sec!,
      cpu_benchmark_threads: result.cpu_benchmark_threads,
      memory_threads: result.memory_threads,
      // Stored in ms; the v2 API expects seconds.
      ai_time_to_first_token: result.ai_time_to_first_token / 1000,
      cpu_total_events: result.cpu_total_events,
      cpu_total_time: result.cpu_total_time,
      ollama_version: result.ollama_version,
      sysbench_digest: result.sysbench_digest,
      nomad_version: SystemService.getAppVersion(),
      benchmark_version: BENCHMARK_VERSION,
    }

    // Optional environment metadata — only send fields we actually have.
    if (result.run_environment) submission.run_environment = result.run_environment
    if (result.storage_path_type) submission.storage_path_type = result.storage_path_type
    if (result.gpu_compute_detected != null) submission.gpu_compute_detected = result.gpu_compute_detected

    // Platform metadata. Optional rather than required so results recorded
    // before this shipped remain submittable.
    if (result.cpu_architecture) submission.cpu_architecture = result.cpu_architecture
    if (result.os_name) submission.os_name = result.os_name
    if (result.os_version) submission.os_version = result.os_version

    // Builder tag: omit entirely when anonymous or unset (validator rejects null).
    if (!anonymous && result.builder_tag) submission.builder_tag = result.builder_tag

    return submission
  }

  /**
   * Get comparison stats from central repository
   */
  async getComparisonStats(): Promise<RepositoryStats | null> {
    try {
      const response = await axios.get('https://benchmark.projectnomad.us/api/v1/stats', {
        timeout: 10000,
      })
      return response.data as RepositoryStats
    } catch (error: any) {
      logger.warn(`Failed to fetch comparison stats: ${error.message}`)
      return null
    }
  }

  /**
   * Get current benchmark status
   */
  getStatus(): { status: BenchmarkStatus; benchmarkId: string | null } {
    return {
      status: this.currentStatus,
      benchmarkId: this.currentBenchmarkId,
    }
  }

  /**
   * Detect system hardware information
   */
  async getHardwareInfo(): Promise<HardwareInfo> {
    this._updateStatus('detecting_hardware', 'Detecting system hardware...')

    try {
      const [cpu, mem, diskLayout, graphics] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.diskLayout(),
        si.graphics(),
      ])

      // Determine disk type from primary disk
      let diskType: DiskType = 'unknown'
      if (diskLayout.length > 0) {
        const primaryDisk = diskLayout[0]
        if (primaryDisk.type?.toLowerCase().includes('nvme')) {
          diskType = 'nvme'
        } else if (primaryDisk.type?.toLowerCase().includes('ssd')) {
          diskType = 'ssd'
        } else if (primaryDisk.type?.toLowerCase().includes('hdd') || primaryDisk.interfaceType === 'SATA') {
          // SATA could be SSD or HDD, check if it's rotational
          diskType = 'hdd'
        }
      }

      // Get GPU model (prefer discrete GPU with dedicated VRAM)
      let gpuModel: string | null = null
      if (graphics.controllers && graphics.controllers.length > 0) {
        // First, look for discrete GPUs (NVIDIA, AMD discrete, or any with significant VRAM)
        const discreteGpu = graphics.controllers.find((g) => {
          const vendor = g.vendor?.toLowerCase() || ''
          const model = g.model?.toLowerCase() || ''
          // NVIDIA GPUs are always discrete
          if (vendor.includes('nvidia') || model.includes('geforce') || model.includes('rtx') || model.includes('quadro')) {
            return true
          }
          // AMD discrete GPUs (Radeon, not integrated APU graphics)
          if ((vendor.includes('amd') || vendor.includes('ati')) &&
              (model.includes('radeon') || model.includes('rx ') || model.includes('vega')) &&
              !model.includes('graphics')) {
            return true
          }
          // Any GPU with dedicated VRAM > 512MB is likely discrete
          if (g.vram && g.vram > 512) {
            return true
          }
          return false
        })
        gpuModel = discreteGpu?.model || graphics.controllers[0]?.model || null
      }

      // si.graphics() resolves PCI IDs against the container's pci.ids database,
      // which ages out. A card newer than that file comes back as the literal
      // "Device <pciid>" — an RTX 5060 reports vendor "NVIDIA Corporation",
      // model "Device 2d05", vram 32. The vendor string still matches, so the
      // discrete-GPU finder above accepts it and the authoritative nvidia-smi
      // path below is skipped by its `if (!gpuModel)` guard.
      //
      // That put "Device 2d05" on the public leaderboard, and it is exactly the
      // newest hardware — the results people most want to show off, and the ones
      // that anchor the top of the board — that hits this. Treat a placeholder
      // as no answer so the real detection runs.
      if (gpuModel && isUnresolvedGpuModel(gpuModel)) {
        logger.info(
          `[BenchmarkService] si.graphics() returned an unresolved PCI id ("${gpuModel}"); falling through to authoritative GPU detection`
        )
        gpuModel = null
      }

      // Fallback: Check Docker for nvidia runtime and query GPU model via nvidia-smi
      if (!gpuModel) {
        try {
          const dockerInfo = await this.dockerService.docker.info()
          const runtimes = dockerInfo.Runtimes || {}
          if ('nvidia' in runtimes) {
            logger.info('[BenchmarkService] NVIDIA container runtime detected, querying GPU model via nvidia-smi')

            const systemService = new (await import('./system_service.js')).SystemService(this.dockerService)
            const nvidiaInfo = await systemService.getNvidiaSmiInfo()
            if (Array.isArray(nvidiaInfo) && nvidiaInfo.length > 0) {
              gpuModel = nvidiaInfo[0].model
            } else {
              logger.warn(`[BenchmarkService] NVIDIA runtime detected but failed to get GPU info: ${typeof nvidiaInfo === 'string' ? nvidiaInfo : JSON.stringify(nvidiaInfo)}`)
            }
          }
        } catch (dockerError: any) {
          logger.warn(`[BenchmarkService] Could not query Docker info for GPU detection: ${dockerError.message}`)
        }
      }

      // Fallback: Extract integrated GPU from CPU model name
      if (!gpuModel) {
        const cpuFullName = `${cpu.manufacturer} ${cpu.brand}`

        // AMD APUs: e.g., "AMD Ryzen AI 9 HX 370 w/ Radeon 890M" -> "Radeon 890M"
        const radeonMatch = cpuFullName.match(/w\/\s*(Radeon\s+\d+\w*)/i)
        if (radeonMatch) {
          gpuModel = radeonMatch[1]
        }

        // Intel Core Ultra: These have Intel Arc Graphics integrated
        // e.g., "Intel Core Ultra 9 285HX" -> "Intel Arc Graphics (Integrated)"
        if (!gpuModel && cpu.manufacturer?.toLowerCase().includes('intel')) {
          if (cpu.brand?.toLowerCase().includes('core ultra')) {
            gpuModel = 'Intel Arc Graphics (Integrated)'
          }
        }
      }

      // Fallback: AMD discrete cards. si.graphics() returns empty inside Docker for AMD,
      // the nvidia-smi path doesn't apply, and the APU regex only catches integrated parts.
      // SystemService.getSystemInfo() already handles AMD via the marker file + Ollama log
      // probe added in PR #804, so reuse that plumbing rather than duplicating it here.
      if (!gpuModel) {
        try {
          const systemService = new (await import('./system_service.js')).SystemService(this.dockerService)
          const sysInfo = await systemService.getSystemInfo()
          const sysGpuModel = sysInfo?.graphics?.controllers?.[0]?.model
          // Same si.graphics() source as above, so it can carry the same
          // placeholder — don't launder an unresolved PCI id in through the
          // back door.
          if (sysGpuModel && !isUnresolvedGpuModel(sysGpuModel)) {
            gpuModel = sysGpuModel
          }
        } catch (sysError: any) {
          logger.warn(`[BenchmarkService] system_service AMD fallback failed: ${sysError.message}`)
        }
      }

      return {
        cpu_model: `${cpu.manufacturer} ${cpu.brand}`,
        cpu_cores: cpu.physicalCores,
        cpu_threads: cpu.cores,
        ram_bytes: mem.total,
        disk_type: diskType,
        gpu_model: gpuModel,
      }
    } catch (error: any) {
      logger.error(`Error detecting hardware: ${error.message}`)
      throw new Error(`Failed to detect hardware: ${error.message}`)
    }
  }

  /**
   * Main benchmark execution method
   */
  private async _runBenchmark(type: BenchmarkType, includeAI: boolean): Promise<BenchmarkResult> {
    if (this.currentStatus !== 'idle') {
      throw new Error('A benchmark is already running')
    }

    this.currentBenchmarkId = randomUUID()
    this.currentStages = this._buildStageList(type, includeAI)

    // Start live host-telemetry sampling for the duration of the run. This runs
    // in the orchestration process, not inside the sysbench container, so it
    // cannot influence the scored numbers.
    this.telemetry = new BenchmarkTelemetrySampler(this.currentBenchmarkId)
    this.telemetry.start()

    this._updateStatus('starting', 'Starting benchmark...')

    try {
      // Fail fast: if this run will download the (large) AI model, make sure there's
      // room BEFORE spending minutes on the system benchmarks.
      if (includeAI && (type === 'full' || type === 'ai')) {
        await this._preflightModelDiskSpace()
      }

      // Detect hardware
      const hardware = await this.getHardwareInfo()

      // Run system benchmarks
      let systemScores: SystemScores = {
        cpu_score: 0,
        memory_score: 0,
        disk_read_score: 0,
        disk_write_score: 0,
      }
      let systemRaws: SystemBenchmarkRawsV2 | null = null

      if (type === 'full' || type === 'system') {
        const systemOutput = await this._runSystemBenchmarks(hardware.cpu_threads)
        systemScores = systemOutput.scores
        systemRaws = systemOutput.raws
      }

      // Run AI benchmark if requested and Ollama is available
      let aiScores: Partial<AIScores> = {}
      if (includeAI && (type === 'full' || type === 'ai')) {
        try {
          aiScores = await this._runAIBenchmark()
          if (aiScores.ai_tokens_per_second !== undefined && aiScores.ai_tokens_per_second !== null) {
            this._emitPartialResult({
              status: 'running_ai',
              label: 'AI',
              value: Math.round(aiScores.ai_tokens_per_second),
              unit: 'tok/s',
            })
          }
        } catch (error: any) {
          // For AI-only benchmarks, failing is fatal - don't save useless results with all zeros
          if (type === 'ai') {
            throw new Error(`AI benchmark failed: ${error.message}. Make sure AI Assistant is installed and running.`)
          }
          // For full benchmarks, AI is optional - continue without it
          logger.warn(`AI benchmark skipped: ${error.message}`)
        }
      }

      // Record the sysbench digest that actually ran, not the compiled-in
      // constant. Only meaningful when the system benchmarks ran at all — an
      // AI-only benchmark never pulls the image.
      const sysbenchDigest = systemRaws ? await this._resolveSysbenchDigest() : null

      // Calculate NOMAD scores (v1 legacy + v2 uncapped)
      this._updateStatus('calculating_score', 'Calculating NOMAD score...')
      const nomadScore = this._calculateNomadScore(systemScores, aiScores)

      // v2 requires a complete run of every channel (system raws + AI). Only a
      // full benchmark with AI qualifies; otherwise nomad_score_v2 stays null.
      let nomadScoreV2: number | null = null
      if (systemRaws && aiScores.ai_tokens_per_second && aiScores.ai_tokens_per_second > 0) {
        try {
          nomadScoreV2 = this._calculateNomadScoreV2({
            ai_tokens_per_second: aiScores.ai_tokens_per_second,
            cpu_events_single: systemRaws.cpu_events_single,
            cpu_events_multi: systemRaws.cpu_events_multi,
            memory_ops_per_sec: systemRaws.memory_ops_per_sec,
            disk_read_mb_per_sec: systemRaws.disk_read_mb_per_sec,
            disk_write_mb_per_sec: systemRaws.disk_write_mb_per_sec,
          })
        } catch (error: any) {
          // A non-positive channel shouldn't reach here (each sysbench step throws
          // on a bad parse), but never let a v2 math error sink the whole run.
          logger.warn(`NOMAD Score v2 not computed: ${error.message}`)
        }
      }

      // Best-effort environment metadata (never fails the run).
      const env = await this._detectRunEnvironment()

      // Save result
      const result = await BenchmarkResult.create({
        benchmark_id: this.currentBenchmarkId,
        benchmark_type: type,
        cpu_model: hardware.cpu_model,
        cpu_cores: hardware.cpu_cores,
        cpu_threads: hardware.cpu_threads,
        ram_bytes: hardware.ram_bytes,
        disk_type: hardware.disk_type,
        gpu_model: hardware.gpu_model,
        cpu_score: systemScores.cpu_score,
        memory_score: systemScores.memory_score,
        disk_read_score: systemScores.disk_read_score,
        disk_write_score: systemScores.disk_write_score,
        ai_tokens_per_second: aiScores.ai_tokens_per_second || null,
        ai_model_used: aiScores.ai_model_used || null,
        ai_time_to_first_token: aiScores.ai_time_to_first_token || null,
        nomad_score: nomadScore,
        submitted_to_repository: false,
        sysbench_digest: sysbenchDigest,
        ollama_version: aiScores.ai_ollama_version ?? null,
        // v2 raw channels + score (null on system-only / AI-less runs)
        cpu_events_single: systemRaws?.cpu_events_single ?? null,
        cpu_events_multi: systemRaws?.cpu_events_multi ?? null,
        cpu_benchmark_threads: systemRaws?.cpu_benchmark_threads ?? null,
        cpu_total_events: systemRaws?.cpu_total_events ?? null,
        cpu_total_time: systemRaws?.cpu_total_time ?? null,
        memory_ops_per_sec: systemRaws?.memory_ops_per_sec ?? null,
        memory_threads: systemRaws?.memory_threads ?? null,
        disk_read_mb_per_sec: systemRaws?.disk_read_mb_per_sec ?? null,
        disk_write_mb_per_sec: systemRaws?.disk_write_mb_per_sec ?? null,
        nomad_score_v2: nomadScoreV2,
        run_environment: env.run_environment,
        storage_path_type: env.storage_path_type,
        gpu_compute_detected: env.gpu_compute_detected,
        cpu_architecture: env.cpu_architecture,
        os_name: env.os_name,
        os_version: env.os_version,
      })

      this._updateStatus('completed', 'Benchmark completed successfully')
      this.currentStatus = 'idle'
      this.currentBenchmarkId = null

      return result
    } catch (error: any) {
      this._updateStatus('error', `Benchmark failed: ${error.message}`)
      this.currentStatus = 'idle'
      this.currentBenchmarkId = null
      throw error
    } finally {
      this.telemetry?.stop()
      this.telemetry = null
      this.currentStages = []
    }
  }

  /**
   * Run system benchmarks using sysbench in Docker.
   *
   * Produces both the legacy v1 0-1 sub-scores AND the v2 raw channels from the
   * same runs. CPU runs twice: 1 thread (single-core index) and all logical
   * threads (multi-core index); the v1 cpu_score keys off the multi pass to stay
   * comparable with historical results.
   *
   * @param multiThreads number of threads for the multi-core CPU pass (all logical CPUs)
   */
  private async _runSystemBenchmarks(multiThreads: number): Promise<SystemBenchmarkOutput> {
    // Ensure sysbench image is available
    await this._ensureSysbenchImage()

    // Run CPU benchmarks: single-thread then all-thread.
    this._updateStatus('running_cpu', 'Running CPU benchmark (single-thread)...')
    const cpuSingle = await this._runSysbenchCpu(1)

    this._updateStatus('running_cpu', `Running CPU benchmark (${multiThreads}-thread)...`)
    const cpuMulti = await this._runSysbenchCpu(multiThreads)

    // Run memory benchmark
    this._updateStatus('running_memory', 'Running memory benchmark...')
    const memoryResult = await this._runSysbenchMemory()
    this._emitPartialResult({
      status: 'running_memory',
      label: 'Memory',
      value: Math.round(memoryResult.operations_per_second),
      unit: 'ops/s',
    })

    // Run disk benchmarks
    this._updateStatus('running_disk_read', 'Running disk read benchmark...')
    const diskReadResult = await this._runSysbenchDiskRead()
    this._emitPartialResult({
      status: 'running_disk_read',
      label: 'Read',
      value: Math.round(diskReadResult.read_mb_per_sec),
      unit: 'MB/s',
    })

    this._updateStatus('running_disk_write', 'Running disk write benchmark...')
    const diskWriteResult = await this._runSysbenchDiskWrite()
    this._emitPartialResult({
      status: 'running_disk_write',
      label: 'Write',
      value: Math.round(diskWriteResult.write_mb_per_sec),
      unit: 'MB/s',
    })

    // Legacy v1 sub-scores (0-1), normalized against the v1 references. cpu_score
    // uses the multi-thread pass to match historical (4-thread) behaviour closely.
    const scores: SystemScores = {
      cpu_score: this._normalizeScore(cpuMulti.events_per_second, REFERENCE_SCORES.cpu_events_per_second),
      memory_score: this._normalizeScore(memoryResult.operations_per_second, REFERENCE_SCORES.memory_ops_per_second),
      disk_read_score: this._normalizeScore(diskReadResult.read_mb_per_sec, REFERENCE_SCORES.disk_read_mb_per_sec),
      disk_write_score: this._normalizeScore(diskWriteResult.write_mb_per_sec, REFERENCE_SCORES.disk_write_mb_per_sec),
    }
    
    // v2 raw channels — the payload of record for the leaderboard.
    const raws: SystemBenchmarkRawsV2 = {
      cpu_events_single: cpuSingle.events_per_second,
      cpu_events_multi: cpuMulti.events_per_second,
      cpu_benchmark_threads: multiThreads,
      cpu_total_events: cpuMulti.total_events,
      cpu_total_time: cpuMulti.total_time,
      memory_ops_per_sec: memoryResult.operations_per_second,
      memory_threads: MEMORY_BENCHMARK_THREADS,
      disk_read_mb_per_sec: diskReadResult.read_mb_per_sec,
      disk_write_mb_per_sec: diskWriteResult.write_mb_per_sec,
    }

    return { scores, raws }
  }

  /**
   * Probe live NVIDIA GPU stats by exec-ing nvidia-smi inside the Ollama
   * container (same approach as SystemService.getNvidiaSmiInfo). Telemetry-only:
   * returns null on any failure (no Ollama container, no NVIDIA GPU / AMD,
   * unparseable output) and must never affect the scored benchmark numbers.
   */
  private async _probeGpuStats(): Promise<NonNullable<BenchmarkTelemetry['gpu']> | null> {
    try {
      const containers = await this.dockerService.docker.listContainers({ all: false })
      const ollamaContainer = containers.find((c) => c.Names.includes(`/${SERVICE_NAMES.OLLAMA}`))
      if (!ollamaContainer) return null

      const container = this.dockerService.docker.getContainer(ollamaContainer.Id)
      const exec = await container.exec({
        Cmd: [
          'nvidia-smi',
          '--query-gpu=utilization.gpu,memory.used,memory.total',
          '--format=csv,noheader,nounits',
        ],
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
      })

      // Read the output stream with a timeout to prevent hanging if nvidia-smi fails
      const stream = await exec.start({ Tty: true })
      const output = await new Promise<string>((resolve) => {
        let data = ''
        const timeout = setTimeout(() => resolve(data), 3000)
        stream.on('data', (chunk: Buffer) => {
          data += chunk.toString()
        })
        stream.on('end', () => {
          clearTimeout(timeout)
          resolve(data)
        })
      })

      // Remove any non-printable characters and trim the output
      const cleaned = Array.from(output)
        .filter((character) => character.charCodeAt(0) > 8)
        .join('')
        .trim()
      if (!cleaned || cleaned.toLowerCase().includes('error') || cleaned.toLowerCase().includes('not found')) {
        return null
      }

      // First GPU only: "<util>, <used>, <total>"
      const parts = cleaned.split('\n')[0].split(',').map((s) => s.trim())
      if (parts.length < 3) return null
      const util = Number.parseInt(parts[0], 10)
      const used = Number.parseInt(parts[1], 10)
      const total = Number.parseInt(parts[2], 10)
      if (!Number.isFinite(util) || !Number.isFinite(used) || !Number.isFinite(total)) return null

      return { util, vram_used_mb: used, vram_total_mb: total }
    } catch {
      return null
    }
  }

  /**
   * Run AI benchmark using Ollama
   */
  private async _runAIBenchmark(): Promise<AIScores> {
    let gpuPollTimer: NodeJS.Timeout | null = null
    try {
      // Live GPU-util overlay poller. Side-effect-only: it feeds telemetry frames
      // and is cleared in the finally below so it never outlives the AI stage.

      this._updateStatus('running_ai', 'Running AI benchmark...')

      const ollamaAPIURL = await this.dockerService.getServiceURL(SERVICE_NAMES.OLLAMA)
      if (!ollamaAPIURL) {
        throw new Error('AI Assistant service location could not be determined. Ensure AI Assistant is installed and running.')
      }

      // Check if Ollama is available
      try {
        await axios.get(`${ollamaAPIURL}/api/tags`, { timeout: 5000 })
      } catch (error: any) {
        const errorCode = error.code || error.response?.status || 'unknown'
        throw new Error(`Ollama is not running or not accessible (${errorCode}). Ensure AI Assistant is installed and running.`)
      }

      // Record the Ollama version for forensics (null-tolerant — never fail the run on this)
      const versionResp = await axios.get(`${ollamaAPIURL}/api/version`, { timeout: 5000 }).catch(() => null)
      const ollamaVersion: string | null = versionResp?.data?.version ?? null

      // GPU-util overlay (NVIDIA only): probe once; if a GPU answers, poll for the
      // duration of the AI stage. If the probe returns null (no GPU / AMD), the
      // overlay simply never appears. Best-effort: failures never affect the run.
      try {
        const initialGpu = await this._probeGpuStats()
        if (initialGpu) {
          this.telemetry?.setGpuStats(initialGpu)
          let gpuProbeInFlight = false
          gpuPollTimer = setInterval(() => {
            if (gpuProbeInFlight) return
            gpuProbeInFlight = true
            this._probeGpuStats()
              .then((stats) => this.telemetry?.setGpuStats(stats))
              .catch(() => this.telemetry?.setGpuStats(null))
              .finally(() => {
                gpuProbeInFlight = false
              })
          }, 1000)
        }
      } catch {
        // GPU overlay is cosmetic; ignore probe failures entirely.
      }

      // Check if the benchmark model is available, pull if not
      const ollamaService = new (await import('./ollama_service.js')).OllamaService()
      const modelResponse = await ollamaService.downloadModel(AI_BENCHMARK_MODEL)
      if (!modelResponse.success) {
        throw new Error(`Model does not exist and failed to download: ${modelResponse.message}`)
      }

      // Evict any other models resident in VRAM/RAM before benchmarking. With an 8B
      // reference model, a chat model left loaded can starve it of VRAM → Ollama
      // offloads layers to CPU → a low, non-comparable score. Give the benchmark
      // model the whole GPU. Best-effort: never fail the run on an eviction hiccup.
      await this._unloadResidentModels(ollamaAPIURL)

      // Warm-up pass (result discarded). The eviction above forces the benchmark
      // model cold, so without this the first *timed* inference would pay the full
      // model-load + GPU spin-up cost. On a cold box that lands as a huge outlier
      // (observed: 173s TTFT / 5.83 tok/s on a run whose warm steady-state was
      // ~80 tok/s), and since the AI channel is uncapped and ~30% of the composite
      // it swings the whole NOMAD Score ~2x between a cold first run and a warm
      // re-run of the same machine. Measure warm, steady-state throughput instead:
      // load the model and warm the context here, then time the median-of-N below.
      // Best-effort — a warm-up hiccup must not fail the run (the timed loop will
      // surface any real inference error). See issue #1139.
      // Log the swallowed failure. Silently discarding it makes a run whose
      // reproducibility guarantee did not actually apply indistinguishable from
      // a clean one after the fact. Matches _unloadResidentModels, the sibling
      // best-effort helper, which already warns on every swallowed error.
      this._updateStatus('running_ai', 'Warming up AI model...')
      await this._runSingleAIInference(ollamaAPIURL).catch((error) => {
        logger.warn(
          `[BenchmarkService] AI warm-up failed (${error?.message ?? error}); the first timed run may be cold.`
        )
        return null
      })

      // Run inference AI_BENCHMARK_RUNS times and take the median run by tok/s (W7).
      // A single inference is noisy (scheduler, thermal, cache); the median damps
      // outliers. The model is already warm (see the warm-up pass above), so every
      // timed run measures steady-state throughput. TTFT is reported from the same
      // run that is the tok/s median, so the two figures always describe one real
      // inference.
      const runs: { tps: number; ttft: number }[] = []
      for (let i = 0; i < AI_BENCHMARK_RUNS; i++) {
        this._updateStatus('running_ai', `Running AI benchmark (${i + 1}/${AI_BENCHMARK_RUNS})...`)
        runs.push(await this._runSingleAIInference(ollamaAPIURL))
      }

      // Median by tok/s (odd count → middle element).
      runs.sort((a, b) => a.tps - b.tps)
      const median = runs[Math.floor(runs.length / 2)]

      // Leave the GPU as clean as we found it: unload our benchmark model so the
      // user's next chat loads their model into a free GPU (Ollama reloads on demand;
      // we deliberately don't try to restore whichever model they had before).
      await this._unloadResidentModels(ollamaAPIURL)

      return {
        ai_tokens_per_second: Math.round(median.tps * 100) / 100,
        ai_model_used: AI_BENCHMARK_MODEL,
        ai_time_to_first_token: Math.round(median.ttft * 100) / 100,
        ai_ollama_version: ollamaVersion,
      }
    } catch (error: any) {
      throw new Error(`AI benchmark failed: ${error.message}`)
    } finally {
      if (gpuPollTimer) {
        clearInterval(gpuPollTimer)
      }
      this.telemetry?.setGpuStats(null)
    }
  }

  /**
   * Run a single Ollama inference and return its tokens/sec and time-to-first-token
   * (TTFT in milliseconds). Extracted so the AI benchmark can run it N times for a
   * median. Prefers Ollama's eval_count/eval_duration; falls back to wall-clock
   * word-count estimation if those fields are absent.
   */
  private async _runSingleAIInference(
    ollamaAPIURL: string
  ): Promise<{ tps: number; ttft: number }> {
    const startTime = Date.now()

    const response = await axios.post(
      `${ollamaAPIURL}/api/generate`,
      {
        model: AI_BENCHMARK_MODEL,
        prompt: AI_BENCHMARK_PROMPT,
        stream: false,
        options: { num_predict: AI_BENCHMARK_NUM_PREDICT },
      },
      { timeout: 120000 }
    )

    const endTime = Date.now()
    const totalTime = (endTime - startTime) / 1000 // seconds

    // Ollama returns eval_count (tokens generated) and eval_duration (nanoseconds)
    if (response.data.eval_count && response.data.eval_duration) {
      const tokenCount = response.data.eval_count
      const evalDurationSeconds = response.data.eval_duration / 1e9
      const tokensPerSecond = tokenCount / evalDurationSeconds

      // Time to first token from prompt_eval_duration
      const ttft = response.data.prompt_eval_duration
        ? response.data.prompt_eval_duration / 1e6 // Convert to ms
        : (totalTime * 1000) / 2 // Estimate if not available

      return { tps: tokensPerSecond, ttft }
    }

    // Fallback calculation
    const estimatedTokens = response.data.response?.split(' ').length * 1.3 || 100
    const tokensPerSecond = estimatedTokens / totalTime
    return { tps: tokensPerSecond, ttft: (totalTime * 1000) / 2 }
  }

  /**
   * Fail fast if the AI model will need downloading and there isn't room for it.
   *
   * Only relevant on first run: if the model is already pulled, no download happens
   * and we skip the check. Best-effort throughout — if Ollama isn't reachable or free
   * space can't be determined, we do NOT block (the AI stage will surface its own
   * error), because a false "insufficient disk" is worse than letting the pull try.
   */
  private async _preflightModelDiskSpace(): Promise<void> {
    let ollamaAPIURL: string | null = null
    try {
      ollamaAPIURL = await this.dockerService.getServiceURL(SERVICE_NAMES.OLLAMA)
    } catch {
      return // AI stage will report Ollama problems
    }
    if (!ollamaAPIURL) return

    // If the model is already present, no download → no disk need.
    try {
      const tags = await axios.get(`${ollamaAPIURL}/api/tags`, { timeout: 5000 })
      const models: string[] = (tags.data?.models ?? []).map((m: { name?: string }) => m.name)
      if (models.includes(AI_BENCHMARK_MODEL)) return
    } catch {
      return // can't reach Ollama; let the AI stage handle it
    }

    // Model not cached → a pull is coming. Require headroom on the root FS.
    let freeBytes: number | null = null
    try {
      const systemService = new (await import('./system_service.js')).SystemService(this.dockerService)
      freeBytes = await getFreeBytes(systemService)
    } catch {
      return // couldn't measure free space — don't block on uncertainty
    }
    if (freeBytes === null) return

    if (freeBytes < AI_BENCHMARK_MODEL_MIN_FREE_BYTES) {
      const gib = (b: number) => `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`
      throw new Error(
        `Not enough free disk space to download the AI benchmark model (${AI_BENCHMARK_MODEL}). ` +
          `About ${gib(AI_BENCHMARK_MODEL_MIN_FREE_BYTES)} is required but only ${gib(freeBytes)} is free. ` +
          `Free up some space and try again.`
      )
    }
  }

  /**
   * Evict every model currently resident in Ollama (VRAM/RAM) so the benchmark
   * model gets the whole GPU. Queries /api/ps for loaded models and unloads each
   * via a keep_alive:0 request. Entirely best-effort: any failure (older Ollama
   * without /api/ps, a model mid-stream) is logged and swallowed — a clean-VRAM
   * optimization must never block the benchmark itself.
   */
  private async _unloadResidentModels(ollamaAPIURL: string): Promise<void> {
    try {
      const ps = await axios.get(`${ollamaAPIURL}/api/ps`, { timeout: 5000 })
      const loaded: string[] = (ps.data?.models ?? [])
        .map((m: { name?: string; model?: string }) => m.name || m.model)
        .filter((n: string | undefined): n is string => !!n)

      if (loaded.length === 0) return

      logger.info(`[BenchmarkService] Evicting ${loaded.length} resident model(s) before AI benchmark: ${loaded.join(', ')}`)
      for (const model of loaded) {
        // keep_alive:0 tells Ollama to unload immediately (no prompt needed).
        await axios
          .post(`${ollamaAPIURL}/api/generate`, { model, keep_alive: 0 }, { timeout: 15000 })
          .catch((e) => logger.warn(`[BenchmarkService] Failed to unload ${model}: ${e.message}`))
      }
    } catch (error: any) {
      logger.warn(`[BenchmarkService] Could not enumerate/unload resident models (continuing): ${error.message}`)
    }
  }

  /**
   * Calculate weighted NOMAD score
   */
  private _calculateNomadScore(
    systemScores: SystemScores | null,
    aiScores: Partial<AIScores>
  ): number {
    let totalWeight = 0
    let weightedSum = 0

    // System scores (only when the system benchmarks actually ran). Passing null
    // for an AI-only run keeps the system weights OUT of the denominator so the
    // score renormalizes to just the AI portion's 0-100 range, rather than being
    // scaled against the full NOMAD 100 (where an excellent AI setup would cap
    // at ~40). System-only already renormalizes correctly because aiScores is
    // empty and its weights are likewise skipped below.
    if (systemScores) {
      // CPU score
      weightedSum += systemScores.cpu_score * SCORE_WEIGHTS.cpu
      totalWeight += SCORE_WEIGHTS.cpu

      // Memory score
      weightedSum += systemScores.memory_score * SCORE_WEIGHTS.memory
      totalWeight += SCORE_WEIGHTS.memory

      // Disk scores
      weightedSum += systemScores.disk_read_score * SCORE_WEIGHTS.disk_read
      totalWeight += SCORE_WEIGHTS.disk_read
      weightedSum += systemScores.disk_write_score * SCORE_WEIGHTS.disk_write
      totalWeight += SCORE_WEIGHTS.disk_write
    }

    // AI scores (if available)
    if (aiScores.ai_tokens_per_second !== undefined && aiScores.ai_tokens_per_second !== null) {
      const aiScore = this._normalizeScore(
        aiScores.ai_tokens_per_second,
        REFERENCE_SCORES.ai_tokens_per_second
      )
      weightedSum += aiScore * SCORE_WEIGHTS.ai_tokens_per_second
      totalWeight += SCORE_WEIGHTS.ai_tokens_per_second
    }

    if (aiScores.ai_time_to_first_token !== undefined && aiScores.ai_time_to_first_token !== null) {
      // For TTFT, lower is better, so we invert the score
      const ttftScore = this._normalizeScoreInverse(
        aiScores.ai_time_to_first_token,
        REFERENCE_SCORES.ai_ttft_ms
      )
      weightedSum += ttftScore * SCORE_WEIGHTS.ai_ttft
      totalWeight += SCORE_WEIGHTS.ai_ttft
    }

    // Normalize by actual weight used (in case AI benchmarks were skipped)
    const nomadScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0

    return Math.round(Math.min(100, Math.max(0, nomadScore)) * 100) / 100
  }

  /**
   * Calculate the NOMAD Score v2 from raw channel values.
   *
   * Byte-identical to the leaderboard's computeNomadScoreV2 (score_service.ts):
   * the weighted geometric mean vs the frozen Reference Build, computed in the
   * log domain, rounded to one decimal. NO clamps. Throws if any channel is
   * <= 0 — a full v2 run measures every channel, and log2 of a non-positive
   * ratio is undefined, so a non-positive value here is a programming error, not
   * a user input to clamp. Every scored channel (incl. AI) is required; callers
   * only invoke this for a complete full-benchmark run.
   */
  private _calculateNomadScoreV2(raws: ScoreRawsV2): number {
    let logSum = 0
    for (const channel of SCORE_CHANNELS_V2) {
      const raw = raws[channel]
      if (!(raw > 0)) {
        throw new Error(`_calculateNomadScoreV2: channel "${channel}" must be > 0 (got ${raw})`)
      }
      const ratio = raw / REFERENCE_SCORES_V2[channel]
      logSum += SCORE_WEIGHTS_V2[channel] * Math.log2(ratio)
    }
    const score = 1000 * Math.pow(2, logSum)
    // One decimal, matching the leaderboard's display convention.
    return Math.round(score * 10) / 10
  }

  /**
   * Detect best-effort run-environment metadata for the leaderboard (issue #1016).
   * Every probe is independently guarded — this never throws and never fails a run;
   * any field it can't determine stays null.
   */
  private async _detectRunEnvironment(): Promise<RunEnvironmentInfo> {
    const info: RunEnvironmentInfo = {
      run_environment: null,
      storage_path_type: null,
      gpu_compute_detected: null,
      cpu_architecture: null,
      os_name: null,
      os_version: null,
    }

    // run_environment: WSL2 vs native Linux, from the host kernel string.
    try {
      const procVersion = await readFile('/proc/version', 'utf8')
      info.run_environment = /microsoft|wsl/i.test(procVersion) ? 'wsl2' : 'native-linux'
    } catch {
      // /proc/version unreadable — leave null
    }

    // storage_path_type: the Docker storage driver backing the benchmarked FS.
    try {
      const dockerInfo = await this.dockerService.docker.info()
      if (dockerInfo?.Driver) info.storage_path_type = String(dockerInfo.Driver)

      // Platform metadata from the same call. The Docker daemon reports the
      // HOST, which is the whole point — os.arch() and si.osInfo() inside the
      // admin container describe the container instead.
      //
      // Observed: Architecture 'x86_64' | 'aarch64', OSVersion '24.04',
      // OperatingSystem 'Ubuntu 24.04.4 LTS'.
      if (dockerInfo?.Architecture) {
        info.cpu_architecture = normalizeArchitecture(String(dockerInfo.Architecture))
      }
      if (dockerInfo?.OperatingSystem) {
        const osVersion = dockerInfo.OSVersion ? String(dockerInfo.OSVersion) : null
        info.os_version = osVersion
        info.os_name = deriveOsName(String(dockerInfo.OperatingSystem), osVersion)
      }
    } catch {
      // docker info failed — leave null
    }

    // gpu_compute_detected: whether a GPU compute type was detected + persisted.
    try {
      const gpuType = await KVStore.getValue('gpu.type')
      info.gpu_compute_detected = gpuType === 'nvidia' || gpuType === 'amd'
    } catch {
      // KV read failed — leave null
    }

    return info
  }

  /**
   * Normalize a raw score to 0-100 scale using log scaling
   * This provides diminishing returns for very high scores
   */
  private _normalizeScore(value: number, reference: number): number {
    if (value <= 0) return 0
    // Log scale with widened range: dividing log2 by 3 prevents scores from
    // clamping to 0% for below-average hardware. Gives 50% at reference value.
    const ratio = value / reference
    const score = 50 * (1 + Math.log2(Math.max(0.01, ratio)) / 3)
    return Math.min(100, Math.max(0, score)) / 100
  }

  /**
   * Normalize a score where lower is better (like latency)
   */
  private _normalizeScoreInverse(value: number, reference: number): number {
    if (value <= 0) return 1
    // Inverse: lower values = higher scores, with widened log range
    const ratio = reference / value
    const score = 50 * (1 + Math.log2(Math.max(0.01, ratio)) / 3)
    return Math.min(100, Math.max(0, score)) / 100
  }

  /**
   * Ensure sysbench Docker image is available
   */
  private async _ensureSysbenchImage(): Promise<void> {
    try {
      await this.dockerService.docker.getImage(SYSBENCH_IMAGE).inspect()
    } catch {
      this._updateStatus('starting', `Pulling sysbench image...`)
      await this.dockerService.pullImage(SYSBENCH_IMAGE)
    }
  }

  /**
   * The sysbench digest actually resolved on this machine.
   *
   * Previously the submission reported SYSBENCH_DIGEST — the constant the client
   * was compiled with. The leaderboard validates that field against an allowlist,
   * but a constant attests to how the client was BUILT, not to what it RAN, so
   * any build inherits a valid value simply by carrying the same source.
   *
   * Reading it back from the image means a divergent build has to actively
   * falsify the field rather than passively inherit it. Still forgeable — the
   * client is open source and always will be — but it moves the bar from "no
   * effort" to "deliberate", which is the distinction that matters when judging
   * whether a submission is a mistake or a choice.
   *
   * Uses RepoDigests (the manifest digest we pulled by), NOT Id — Id is the
   * config digest, which differs per architecture and would never match the
   * allowlist. Falls back to the constant if inspection gives us nothing usable,
   * so a benchmark never fails over provenance metadata.
   */
  private async _resolveSysbenchDigest(): Promise<string> {
    try {
      const info = await this.dockerService.docker.getImage(SYSBENCH_IMAGE).inspect()
      const repoDigest = (info?.RepoDigests ?? []).find((d: string) => d.includes('@sha256:'))
      const digest = repoDigest?.split('@')[1]
      if (digest) return digest
      logger.warn('[BenchmarkService] No RepoDigest on the sysbench image; reporting the pinned constant.')
    } catch (error: any) {
      logger.warn(`[BenchmarkService] Could not inspect the sysbench image (${error.message}); reporting the pinned constant.`)
    }
    return SYSBENCH_DIGEST
  }

  /**
   * Run sysbench CPU benchmark at the given thread count.
   *
   * v2 runs this twice: 1 thread (single-core index) and all threads (multi-core
   * index). The multi pass also supplies the W6 consistency companions
   * (total_events / total_time) the leaderboard cross-checks against events/sec.
   */
  private async _runSysbenchCpu(threads: number): Promise<SysbenchCpuResult> {
    const output = await this._runSysbenchCommand([
      'sysbench',
      'cpu',
      '--cpu-max-prime=20000',
      `--threads=${threads}`,
      '--time=30',
      'run',
    ])

    // Parse output for events per second
    const eventsMatch = output.match(/events per second:\s*([\d.]+)/i)
    const totalTimeMatch = output.match(/total time:\s*([\d.]+)s/i)
    const totalEventsMatch = output.match(/total number of events:\s*(\d+)/i)
    logger.debug(`[BenchmarkService] CPU output parsing (${threads}T) - events/s: ${eventsMatch?.[1]}, total_time: ${totalTimeMatch?.[1]}, total_events: ${totalEventsMatch?.[1]}`)

    // Scored primary metric: fail loudly instead of silently scoring zero on a parse miss
    const eventsPerSecond = eventsMatch ? parseFloat(eventsMatch[1]) : Number.NaN
    if (!eventsMatch || !Number.isFinite(eventsPerSecond) || eventsPerSecond <= 0) {
      throw new Error('sysbench CPU benchmark produced no parseable events/sec — aborting (output may have changed or the test failed)')
    }

    const totalTime = totalTimeMatch ? parseFloat(totalTimeMatch[1]) : 30
    // total_events feeds the leaderboard's W6 cross-check (events/sec must equal
    // total_events/total_time within 2%). If the count line ever fails to parse,
    // derive it from the rate so we submit a self-consistent payload rather than
    // a zero that would be rejected as "internally inconsistent".
    const parsedTotalEvents = totalEventsMatch ? parseInt(totalEventsMatch[1]) : Number.NaN
    const totalEvents =
      Number.isFinite(parsedTotalEvents) && parsedTotalEvents > 0
        ? parsedTotalEvents
        : Math.round(eventsPerSecond * totalTime)

    return {
      events_per_second: eventsPerSecond,
      total_time: totalTime,
      total_events: totalEvents,
    }
  }

  /**
   * Run sysbench memory benchmark
   */
  private async _runSysbenchMemory(): Promise<SysbenchMemoryResult> {
    const output = await this._runSysbenchCommand([
      'sysbench',
      'memory',
      '--memory-block-size=1K',
      '--memory-total-size=10G',
      `--threads=${MEMORY_BENCHMARK_THREADS}`,
      'run',
    ])

    // Parse output
    const opsMatch = output.match(/Total operations:\s*\d+\s*\(([\d.]+)\s*per second\)/i)
    const transferMatch = output.match(/([\d.]+)\s*MiB\/sec/i)
    const timeMatch = output.match(/total time:\s*([\d.]+)s/i)

    // Scored primary metric: fail loudly instead of silently scoring zero on a parse miss
    const opsPerSecond = opsMatch ? parseFloat(opsMatch[1]) : Number.NaN
    if (!opsMatch || !Number.isFinite(opsPerSecond) || opsPerSecond <= 0) {
      throw new Error('sysbench memory benchmark produced no parseable ops/sec — aborting')
    }

    return {
      operations_per_second: opsPerSecond,
      transfer_rate_mb_per_sec: transferMatch ? parseFloat(transferMatch[1]) : 0,
      total_time: timeMatch ? parseFloat(timeMatch[1]) : 0,
    }
  }

  /**
   * Run sysbench disk read benchmark
   */
  private async _runSysbenchDiskRead(): Promise<SysbenchDiskResult> {
    // Run prepare, test, and cleanup in a single container
    // This is necessary because each container has its own filesystem
    // --file-extra-flags=direct (O_DIRECT) on the run bypasses the page cache so
    // we measure real device throughput, not RAM (W4). Only the run needs it;
    // prepare/cleanup are plain file ops. v2 reference disk numbers are O_DIRECT.
    const output = await this._runSysbenchCommand([
      'sh',
      '-c',
      'sysbench fileio --file-total-size=1G --file-num=4 prepare && ' +
        'sysbench fileio --file-total-size=1G --file-num=4 --file-test-mode=seqrd --file-extra-flags=direct --time=30 run && ' +
        'sysbench fileio --file-total-size=1G --file-num=4 cleanup',
    ])

    // Parse output - look for the Throughput section
    const readMatch = output.match(/read,\s*MiB\/s:\s*([\d.]+)/i)
    const readsPerSecMatch = output.match(/reads\/s:\s*([\d.]+)/i)

    logger.debug(`[BenchmarkService] Disk read output parsing - read: ${readMatch?.[1]}, reads/s: ${readsPerSecMatch?.[1]}`)

    // Scored primary metric: fail loudly instead of silently scoring zero on a parse miss
    const readMbPerSec = readMatch ? parseFloat(readMatch[1]) : Number.NaN
    if (!readMatch || !Number.isFinite(readMbPerSec) || readMbPerSec <= 0) {
      throw new Error('sysbench disk-read benchmark produced no parseable MiB/s — aborting')
    }

    return {
      reads_per_second: readsPerSecMatch ? parseFloat(readsPerSecMatch[1]) : 0,
      writes_per_second: 0,
      read_mb_per_sec: readMbPerSec,
      write_mb_per_sec: 0,
      total_time: 30,
    }
  }

  /**
   * Run sysbench disk write benchmark
   */
  private async _runSysbenchDiskWrite(): Promise<SysbenchDiskResult> {
    // Run prepare, test, and cleanup in a single container
    // This is necessary because each container has its own filesystem
    // --file-extra-flags=direct (O_DIRECT) on the run bypasses the page cache (W4).
    const output = await this._runSysbenchCommand([
      'sh',
      '-c',
      'sysbench fileio --file-total-size=1G --file-num=4 prepare && ' +
        'sysbench fileio --file-total-size=1G --file-num=4 --file-test-mode=seqwr --file-extra-flags=direct --time=30 run && ' +
        'sysbench fileio --file-total-size=1G --file-num=4 cleanup',
    ])

    // Parse output - look for the Throughput section
    const writeMatch = output.match(/written,\s*MiB\/s:\s*([\d.]+)/i)
    const writesPerSecMatch = output.match(/writes\/s:\s*([\d.]+)/i)

    logger.debug(`[BenchmarkService] Disk write output parsing - written: ${writeMatch?.[1]}, writes/s: ${writesPerSecMatch?.[1]}`)

    // Scored primary metric: fail loudly instead of silently scoring zero on a parse miss
    const writeMbPerSec = writeMatch ? parseFloat(writeMatch[1]) : Number.NaN
    if (!writeMatch || !Number.isFinite(writeMbPerSec) || writeMbPerSec <= 0) {
      throw new Error('sysbench disk-write benchmark produced no parseable MiB/s — aborting')
    }

    return {
      reads_per_second: 0,
      writes_per_second: writesPerSecMatch ? parseFloat(writesPerSecMatch[1]) : 0,
      read_mb_per_sec: 0,
      write_mb_per_sec: writeMbPerSec,
      total_time: 30,
    }
  }

  /**
   * Run a sysbench command in a Docker container
   */
  private async _runSysbenchCommand(cmd: string[]): Promise<string> {
    let container: Dockerode.Container | null = null
    try {
      // Create container with TTY to avoid multiplexed output
      container = await this.dockerService.docker.createContainer({
        Image: SYSBENCH_IMAGE,
        Cmd: cmd,
        name: `${SYSBENCH_CONTAINER_NAME}_${Date.now()}`,
        Tty: true, // Important: prevents multiplexed stdout/stderr headers
        HostConfig: {
          AutoRemove: false, // Don't auto-remove to avoid race condition with fetching logs
        },
      })

      // Start container
      await container.start()

      // Wait for completion
      await container.wait()
      
      // Get logs after container has finished
      const logs = await container.logs({
        stdout: true,
        stderr: true,
      })

      // Parse logs (Docker logs include header bytes)
      const output = logs.toString('utf8')
        .replace(/[\x00-\x08]/g, '') // Remove control characters
        .trim()

      // Manually remove the container after getting logs
      try {
        await container.remove()
      } catch (removeError: any) {
        // Log but don't fail if removal fails (container might already be gone)
        logger.warn(`Failed to remove sysbench container: ${removeError.message}`)
      }

      return output
    } catch (error: any) {
      // Clean up container on error if it exists
      if (container) {
        try {
          await container.remove({ force: true })
        } catch (removeError: any) {
          // Ignore removal errors
        }
      }
      logger.error(`Sysbench command failed: ${error.message}`)
      throw new Error(`Sysbench command failed: ${error.message}`)
    }
  }

  /**
   * Like _runSysbenchCommand but attaches to the container's output stream and
   * invokes onLine for every complete line as it arrives, so interim
   * --report-interval lines can drive live telemetry. Still returns the full
   * accumulated stdout so the caller's final-report regexes (the SCORED numbers)
   * parse exactly as before. onLine parsing must never throw.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // @ts-ignore TS6133: Reserved for future live sysbench telemetry mode.
  private async _runSysbenchCommandStreaming(
    cmd: string[],
    onLine: (line: string) => void
  ): Promise<string> {
    let container: Dockerode.Container | null = null
    try {
      container = await this.dockerService.docker.createContainer({
        Image: SYSBENCH_IMAGE,
        Cmd: cmd,
        name: `${SYSBENCH_CONTAINER_NAME}_${Date.now()}`,
        Tty: true, // Important: prevents multiplexed stdout/stderr headers
        HostConfig: {
          AutoRemove: false, // Don't auto-remove to avoid race condition with output capture
        },
      })

      // Attach BEFORE starting so no early output is missed. With Tty: true the
      // attach stream is raw (non-multiplexed), so no demuxing is needed.
      const stream = await container.attach({ stream: true, stdout: true, stderr: true })

      // The attach stream drives the live onLine callbacks only (best-effort
      // telemetry). A missed trailing line here is harmless — it never feeds the
      // scored numbers, which come from container.logs() after exit below.
      let buffer = ''
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        let newlineIdx: number
        while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIdx)
          buffer = buffer.slice(newlineIdx + 1)
          try {
            onLine(line)
          } catch {
            // Live-parse failures must never affect the benchmark itself.
          }
        }
      })

      await container.start()
      await container.wait()

      // Flush any trailing partial line through onLine (best-effort).
      if (buffer.length > 0) {
        try {
          onLine(buffer)
        } catch {
          // Live-parse failures must never affect the benchmark itself.
        }
      }

      // Authoritative output for the SCORED parse. Fetch the complete captured
      // log AFTER exit, exactly like _runSysbenchCommand does, rather than
      // trusting the live attach stream — attach 'data' events can flush after
      // container.wait() resolves, which would truncate the final report and
      // break the scoring regexes. This makes the returned output byte-identical
      // to the non-streaming path.
      const logs = await container.logs({
        stdout: true,
        stderr: true,
      })
      const cleaned = logs
        .toString('utf8')
        .replace(/[\x00-\x08]/g, '') // Remove control characters
        .trim()

      // Manually remove the container after capturing output
      try {
        await container.remove()
      } catch (removeError: any) {
        // Log but don't fail if removal fails (container might already be gone)
        logger.warn(`Failed to remove sysbench container: ${removeError.message}`)
      }

      return cleaned
    } catch (error: any) {
      // Clean up container on error if it exists
      if (container) {
        try {
          await container.remove({ force: true })
        } catch (removeError: any) {
          // Ignore removal errors
        }
      }
      logger.error(`Sysbench command failed: ${error.message}`)
      throw new Error(`Sysbench command failed: ${error.message}`)
    }
  }

  /**
   * Broadcast a progress frame carrying a just-finished stage's raw result.
   * Reuses the current status/progress so the StageRail is undisturbed; the
   * partial_result field fills the "results so far" strip in the live UI.
   */
  private _emitPartialResult(result: BenchmarkPartialResult) {
    const progress: BenchmarkProgress = {
      status: this.currentStatus,
      progress: this._getProgressPercent(this.currentStatus),
      message: this._getStageLabel(this.currentStatus),
      current_stage: this._getStageLabel(this.currentStatus),
      timestamp: new Date().toISOString(),
      stages: this.currentStages,
      stage_index: this.currentStages.findIndex((s) => s.status === this.currentStatus),
      stage_count: this.currentStages.length,
      partial_result: result,
    }

    transmit.broadcast(BROADCAST_CHANNELS.BENCHMARK_PROGRESS, {
      benchmark_id: this.currentBenchmarkId,
      ...progress,
    })
  }

  /**
   * Broadcast benchmark progress update
   */
  private _updateStatus(status: BenchmarkStatus, message: string) {
    this.currentStatus = status
    this.telemetry?.setStage(status)

    const progress: BenchmarkProgress = {
      status,
      progress: this._getProgressPercent(status),
      message,
      current_stage: this._getStageLabel(status),
      timestamp: new Date().toISOString(),
      stages: this.currentStages,
      stage_index: this.currentStages.findIndex((s) => s.status === status),
      stage_count: this.currentStages.length,
    }

    transmit.broadcast(BROADCAST_CHANNELS.BENCHMARK_PROGRESS, {
      benchmark_id: this.currentBenchmarkId,
      ...progress,
    })

    logger.info(`[BenchmarkService] ${status}: ${message}`)
  }

  /**
   * Get progress percentage for a given status
   */
  private _getProgressPercent(status: BenchmarkStatus): number {
    const progressMap: Record<BenchmarkStatus, number> = {
      idle: 0,
      starting: 5,
      detecting_hardware: 10,
      running_cpu: 25,
      running_memory: 40,
      running_disk_read: 55,
      running_disk_write: 70,
      downloading_ai_model: 80,
      running_ai: 85,
      calculating_score: 95,
      completed: 100,
      error: 0,
    }
    return progressMap[status] || 0
  }

  /**
   * Get human-readable stage label
   */
  private _getStageLabel(status: BenchmarkStatus): string {
    const labelMap: Record<BenchmarkStatus, string> = {
      idle: 'Idle',
      starting: 'Starting',
      detecting_hardware: 'Detecting Hardware',
      running_cpu: 'CPU Benchmark',
      running_memory: 'Memory Benchmark',
      running_disk_read: 'Disk Read Test',
      running_disk_write: 'Disk Write Test',
      downloading_ai_model: 'Downloading AI Model',
      running_ai: 'AI Inference Test',
      calculating_score: 'Calculating Score',
      completed: 'Complete',
      error: 'Error',
    }
    return labelMap[status] || status
  }
}
