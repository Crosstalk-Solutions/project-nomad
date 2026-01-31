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
  HardwareInfo,
  DiskType,
  SystemScores,
  AIScores,
  SysbenchCpuResult,
  SysbenchMemoryResult,
  SysbenchDiskResult,
  RepositorySubmission,
  RepositorySubmitResponse,
  RepositoryStats,
} from '../../types/benchmark.js'
import { randomUUID, createHmac } from 'node:crypto'
import { DockerService } from './docker_service.js'

// HMAC secret for signing submissions to the benchmark repository
// This provides basic protection against casual API abuse.
// Note: Since NOMAD is open source, a determined attacker could extract this.
// For stronger protection, see challenge-response authentication.
const BENCHMARK_HMAC_SECRET = 'nomad-benchmark-v1-2026'

// Re-export default weights for use in service
const SCORE_WEIGHTS = {
  ai_tokens_per_second: 0.30,
  cpu: 0.25,
  memory: 0.15,
  ai_ttft: 0.10,
  disk_read: 0.10,
  disk_write: 0.10,
}

// Benchmark configuration constants
const SYSBENCH_IMAGE = 'severalnines/sysbench:latest'
const SYSBENCH_CONTAINER_NAME = 'nomad_benchmark_sysbench'
const BENCHMARK_CHANNEL = 'benchmark-progress'

// Reference model for AI benchmark - small but meaningful
const AI_BENCHMARK_MODEL = 'llama3.2:1b'
const AI_BENCHMARK_PROMPT = 'Explain recursion in programming in exactly 100 words.'

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

  constructor(private dockerService: DockerService) {}

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

    const submission: RepositorySubmission = {
      cpu_model: result.cpu_model,
      cpu_cores: result.cpu_cores,
      cpu_threads: result.cpu_threads,
      ram_gb: Math.round(result.ram_bytes / (1024 * 1024 * 1024)),
      disk_type: result.disk_type,
      gpu_model: result.gpu_model,
      cpu_score: result.cpu_score,
      memory_score: result.memory_score,
      disk_read_score: result.disk_read_score,
      disk_write_score: result.disk_write_score,
      ai_tokens_per_second: result.ai_tokens_per_second,
      ai_time_to_first_token: result.ai_time_to_first_token,
      nomad_score: result.nomad_score,
      nomad_version: SystemService.getAppVersion(),
      benchmark_version: '1.0.0',
      builder_tag: anonymous ? null : result.builder_tag,
    }

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
    } catch (error) {
      logger.error(`Failed to submit benchmark to repository: ${error.message}`)
      throw new Error(`Failed to submit benchmark: ${error.message}`)
    }
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
    } catch (error) {
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

      // Fallback: Extract integrated GPU from CPU model name (common for AMD APUs)
      // e.g., "AMD Ryzen AI 9 HX 370 w/ Radeon 890M" -> "Radeon 890M"
      if (!gpuModel) {
        const cpuFullName = `${cpu.manufacturer} ${cpu.brand}`
        const radeonMatch = cpuFullName.match(/w\/\s*(Radeon\s+\d+\w*)/i)
        if (radeonMatch) {
          gpuModel = radeonMatch[1]
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
    } catch (error) {
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
    this._updateStatus('starting', 'Starting benchmark...')

    try {
      // Detect hardware
      const hardware = await this.getHardwareInfo()

      // Run system benchmarks
      let systemScores: SystemScores = {
        cpu_score: 0,
        memory_score: 0,
        disk_read_score: 0,
        disk_write_score: 0,
      }

      if (type === 'full' || type === 'system') {
        systemScores = await this._runSystemBenchmarks()
      }

      // Run AI benchmark if requested and Ollama is available
      let aiScores: Partial<AIScores> = {}
      if (includeAI && (type === 'full' || type === 'ai')) {
        try {
          aiScores = await this._runAIBenchmark()
        } catch (error) {
          // For AI-only benchmarks, failing is fatal - don't save useless results with all zeros
          if (type === 'ai') {
            throw new Error(`AI benchmark failed: ${error.message}. Make sure AI Assistant is installed and running.`)
          }
          // For full benchmarks, AI is optional - continue without it
          logger.warn(`AI benchmark skipped: ${error.message}`)
        }
      }

      // Calculate NOMAD score
      this._updateStatus('calculating_score', 'Calculating NOMAD score...')
      const nomadScore = this._calculateNomadScore(systemScores, aiScores)

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
      })

      this._updateStatus('completed', 'Benchmark completed successfully')
      this.currentStatus = 'idle'
      this.currentBenchmarkId = null

      return result
    } catch (error) {
      this._updateStatus('error', `Benchmark failed: ${error.message}`)
      this.currentStatus = 'idle'
      this.currentBenchmarkId = null
      throw error
    }
  }

  /**
   * Run system benchmarks using sysbench in Docker
   */
  private async _runSystemBenchmarks(): Promise<SystemScores> {
    // Ensure sysbench image is available
    await this._ensureSysbenchImage()

    // Run CPU benchmark
    this._updateStatus('running_cpu', 'Running CPU benchmark...')
    const cpuResult = await this._runSysbenchCpu()

    // Run memory benchmark
    this._updateStatus('running_memory', 'Running memory benchmark...')
    const memoryResult = await this._runSysbenchMemory()

    // Run disk benchmarks
    this._updateStatus('running_disk_read', 'Running disk read benchmark...')
    const diskReadResult = await this._runSysbenchDiskRead()

    this._updateStatus('running_disk_write', 'Running disk write benchmark...')
    const diskWriteResult = await this._runSysbenchDiskWrite()

    // Normalize scores to 0-100 scale
    return {
      cpu_score: this._normalizeScore(cpuResult.events_per_second, REFERENCE_SCORES.cpu_events_per_second),
      memory_score: this._normalizeScore(memoryResult.operations_per_second, REFERENCE_SCORES.memory_ops_per_second),
      disk_read_score: this._normalizeScore(diskReadResult.read_mb_per_sec, REFERENCE_SCORES.disk_read_mb_per_sec),
      disk_write_score: this._normalizeScore(diskWriteResult.write_mb_per_sec, REFERENCE_SCORES.disk_write_mb_per_sec),
    }
  }

  /**
   * Run AI benchmark using Ollama
   */
  private async _runAIBenchmark(): Promise<AIScores> {
    try {

    this._updateStatus('running_ai', 'Running AI benchmark...')

    const ollamaAPIURL = await this.dockerService.getServiceURL(DockerService.OLLAMA_SERVICE_NAME)
    if (!ollamaAPIURL) {
      throw new Error('AI Assistant service location could not be determined. Ensure AI Assistant is installed and running.')
    }

    // Check if Ollama is available
    try {
      await axios.get(`${ollamaAPIURL}/api/tags`, { timeout: 5000 })
    } catch (error) {
      const errorCode = error.code || error.response?.status || 'unknown'
      throw new Error(`Ollama is not running or not accessible (${errorCode}). Ensure AI Assistant is installed and running.`)
    }

    // Check if the benchmark model is available, pull if not
    const ollamaService = new (await import('./ollama_service.js')).OllamaService()
    const modelResponse = await ollamaService.downloadModelSync(AI_BENCHMARK_MODEL)
    if (!modelResponse.success) {
      throw new Error(`Model does not exist and failed to download: ${modelResponse.message}`)
    }

    // Run inference benchmark
    const startTime = Date.now()

      const response = await axios.post(
        `${ollamaAPIURL}/api/generate`,
        {
          model: AI_BENCHMARK_MODEL,
          prompt: AI_BENCHMARK_PROMPT,
          stream: false,
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

        return {
          ai_tokens_per_second: Math.round(tokensPerSecond * 100) / 100,
          ai_model_used: AI_BENCHMARK_MODEL,
          ai_time_to_first_token: Math.round(ttft * 100) / 100,
        }
      }

      // Fallback calculation
      const estimatedTokens = response.data.response?.split(' ').length * 1.3 || 100
      const tokensPerSecond = estimatedTokens / totalTime

      return {
        ai_tokens_per_second: Math.round(tokensPerSecond * 100) / 100,
        ai_model_used: AI_BENCHMARK_MODEL,
        ai_time_to_first_token: Math.round((totalTime * 1000) / 2),
      }
    } catch (error) {
      throw new Error(`AI benchmark failed: ${error.message}`)
    }
  }

  /**
   * Calculate weighted NOMAD score
   */
  private _calculateNomadScore(systemScores: SystemScores, aiScores: Partial<AIScores>): number {
    let totalWeight = 0
    let weightedSum = 0

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
   * Normalize a raw score to 0-100 scale using log scaling
   * This provides diminishing returns for very high scores
   */
  private _normalizeScore(value: number, reference: number): number {
    if (value <= 0) return 0
    // Log scale: score = 50 * (1 + log2(value/reference))
    // This gives 50 at reference value, scales logarithmically
    const ratio = value / reference
    const score = 50 * (1 + Math.log2(Math.max(0.01, ratio)))
    return Math.min(100, Math.max(0, score)) / 100
  }

  /**
   * Normalize a score where lower is better (like latency)
   */
  private _normalizeScoreInverse(value: number, reference: number): number {
    if (value <= 0) return 1
    // Inverse: lower values = higher scores
    const ratio = reference / value
    const score = 50 * (1 + Math.log2(Math.max(0.01, ratio)))
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
      const pullStream = await this.dockerService.docker.pull(SYSBENCH_IMAGE)
      await new Promise((resolve) => this.dockerService.docker.modem.followProgress(pullStream, resolve))
    }
  }

  /**
   * Run sysbench CPU benchmark
   */
  private async _runSysbenchCpu(): Promise<SysbenchCpuResult> {
    const output = await this._runSysbenchCommand([
      'sysbench',
      'cpu',
      '--cpu-max-prime=20000',
      '--threads=4',
      '--time=30',
      'run',
    ])

    // Parse output for events per second
    const eventsMatch = output.match(/events per second:\s*([\d.]+)/i)
    const totalTimeMatch = output.match(/total time:\s*([\d.]+)s/i)
    const totalEventsMatch = output.match(/total number of events:\s*(\d+)/i)

    return {
      events_per_second: eventsMatch ? parseFloat(eventsMatch[1]) : 0,
      total_time: totalTimeMatch ? parseFloat(totalTimeMatch[1]) : 30,
      total_events: totalEventsMatch ? parseInt(totalEventsMatch[1]) : 0,
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
      '--threads=4',
      'run',
    ])

    // Parse output
    const opsMatch = output.match(/Total operations:\s*\d+\s*\(([\d.]+)\s*per second\)/i)
    const transferMatch = output.match(/([\d.]+)\s*MiB\/sec/i)
    const timeMatch = output.match(/total time:\s*([\d.]+)s/i)

    return {
      operations_per_second: opsMatch ? parseFloat(opsMatch[1]) : 0,
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
    const output = await this._runSysbenchCommand([
      'sh',
      '-c',
      'sysbench fileio --file-total-size=1G --file-num=4 prepare && ' +
        'sysbench fileio --file-total-size=1G --file-num=4 --file-test-mode=seqrd --time=30 run && ' +
        'sysbench fileio --file-total-size=1G --file-num=4 cleanup',
    ])

    // Parse output - look for the Throughput section
    const readMatch = output.match(/read,\s*MiB\/s:\s*([\d.]+)/i)
    const readsPerSecMatch = output.match(/reads\/s:\s*([\d.]+)/i)

    logger.debug(`[BenchmarkService] Disk read output parsing - read: ${readMatch?.[1]}, reads/s: ${readsPerSecMatch?.[1]}`)

    return {
      reads_per_second: readsPerSecMatch ? parseFloat(readsPerSecMatch[1]) : 0,
      writes_per_second: 0,
      read_mb_per_sec: readMatch ? parseFloat(readMatch[1]) : 0,
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
    const output = await this._runSysbenchCommand([
      'sh',
      '-c',
      'sysbench fileio --file-total-size=1G --file-num=4 prepare && ' +
        'sysbench fileio --file-total-size=1G --file-num=4 --file-test-mode=seqwr --time=30 run && ' +
        'sysbench fileio --file-total-size=1G --file-num=4 cleanup',
    ])

    // Parse output - look for the Throughput section
    const writeMatch = output.match(/written,\s*MiB\/s:\s*([\d.]+)/i)
    const writesPerSecMatch = output.match(/writes\/s:\s*([\d.]+)/i)

    logger.debug(`[BenchmarkService] Disk write output parsing - written: ${writeMatch?.[1]}, writes/s: ${writesPerSecMatch?.[1]}`)

    return {
      reads_per_second: 0,
      writes_per_second: writesPerSecMatch ? parseFloat(writesPerSecMatch[1]) : 0,
      read_mb_per_sec: 0,
      write_mb_per_sec: writeMatch ? parseFloat(writeMatch[1]) : 0,
      total_time: 30,
    }
  }

  /**
   * Run a sysbench command in a Docker container
   */
  private async _runSysbenchCommand(cmd: string[]): Promise<string> {
    try {
      // Create container with TTY to avoid multiplexed output
      const container = await this.dockerService.docker.createContainer({
        Image: SYSBENCH_IMAGE,
        Cmd: cmd,
        name: `${SYSBENCH_CONTAINER_NAME}_${Date.now()}`,
        Tty: true, // Important: prevents multiplexed stdout/stderr headers
        HostConfig: {
          AutoRemove: true,
        },
      })

      // Start container
      await container.start()

      // Wait for completion and get logs
      await container.wait()
      const logs = await container.logs({
        stdout: true,
        stderr: true,
      })

      // Parse logs (Docker logs include header bytes)
      const output = logs.toString('utf8')
        .replace(/[\x00-\x08]/g, '') // Remove control characters
        .trim()

      return output
    } catch (error) {
      logger.error(`Sysbench command failed: ${error.message}`)
      throw new Error(`Sysbench command failed: ${error.message}`)
    }
  }

  /**
   * Broadcast benchmark progress update
   */
  private _updateStatus(status: BenchmarkStatus, message: string) {
    this.currentStatus = status

    const progress: BenchmarkProgress = {
      status,
      progress: this._getProgressPercent(status),
      message,
      current_stage: this._getStageLabel(status),
      timestamp: new Date().toISOString(),
    }

    transmit.broadcast(BENCHMARK_CHANNEL, {
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
