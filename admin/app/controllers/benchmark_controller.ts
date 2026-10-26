import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { BenchmarkService } from '#services/benchmark_service'
import { runBenchmarkValidator, submitBenchmarkValidator } from '#validators/benchmark'
import { RunBenchmarkJob } from '#jobs/run_benchmark_job'
import { QueueService } from '#services/queue_service'
import type { BenchmarkType } from '../../types/benchmark.js'
import { randomUUID } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'

/**
 * Serialises check-then-start within this process, so a double click cannot
 * pass the "already running?" check twice before either run is visible.
 */
let startLock: Promise<unknown> = Promise.resolve()
function withStartLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = startLock.then(fn, fn)
  startLock = next.catch(() => {})
  return next
}

@inject()
export default class BenchmarkController {
  constructor(private benchmarkService: BenchmarkService) {}

  /**
   * Start a benchmark run (async via job queue, or sync if specified)
   */
  async run({ request, response }: HttpContext) {
    const payload = await request.validateUsing(runBenchmarkValidator)
    const benchmarkType: BenchmarkType = payload.benchmark_type || 'full'
    const runSync = request.input('sync') === 'true' || request.input('sync') === true

    // Run synchronously if requested (useful for local dev without Redis)
    if (runSync) {
      // The run claims the process-wide slot synchronously when started, so
      // the lock only has to cover the check and the start, not the whole run.
      type Started =
        | { running: { benchmarkId: string | null } }
        | { run: ReturnType<BenchmarkService['runFullBenchmark']> }
      const started = await withStartLock(async (): Promise<Started> => {
        const running = await this._runningBenchmark(true)
        if (running) return { running }
        switch (benchmarkType) {
          case 'system':
            return { run: this.benchmarkService.runSystemBenchmarks() }
          case 'ai':
            return { run: this.benchmarkService.runAIBenchmark() }
          default:
            return { run: this.benchmarkService.runFullBenchmark() }
        }
      })
      if ('running' in started) {
        return this._alreadyRunning(response, started.running.benchmarkId)
      }
      try {
        const result = await started.run
        return response.send({
          success: true,
          benchmark_id: result.benchmark_id,
          nomad_score: result.nomad_score,
          result,
        })
      } catch (error) {
        logger.error({ err: error }, '[BenchmarkController] Benchmark run failed')
        return response.status(500).send({
          success: false,
          error: 'An internal error occurred while running the benchmark.',
        })
      }
    }

    // Generate benchmark ID and dispatch job (async)
    const benchmarkId = randomUUID()
    const dispatched = await withStartLock(async () => {
      const running = await this._runningBenchmark(false)
      if (running) return { running }
      return RunBenchmarkJob.dispatch({
        benchmark_id: benchmarkId,
        benchmark_type: benchmarkType,
        include_ai: benchmarkType === 'full' || benchmarkType === 'ai',
      })
    })
    if ('running' in dispatched) {
      return this._alreadyRunning(response, dispatched.running.benchmarkId)
    }
    const { job, created } = dispatched

    return response.status(201).send({
      success: true,
      job_id: job?.id || benchmarkId,
      benchmark_id: benchmarkId,
      message: created
        ? `${benchmarkType} benchmark started`
        : 'Benchmark job already exists',
    })
  }

  /**
   * Run a system-only benchmark (CPU, memory, disk)
   */
  async runSystem({ response }: HttpContext) {
    const benchmarkId = randomUUID()
    const dispatched = await withStartLock(async () => {
      const running = await this._runningBenchmark(false)
      if (running) return { running }
      return RunBenchmarkJob.dispatch({
        benchmark_id: benchmarkId,
        benchmark_type: 'system',
        include_ai: false,
      })
    })
    if ('running' in dispatched) {
      return this._alreadyRunning(response, dispatched.running.benchmarkId)
    }

    return response.status(201).send({
      success: true,
      benchmark_id: benchmarkId,
      message: 'System benchmark started',
    })
  }

  /**
   * Run an AI-only benchmark
   */
  async runAI({ response }: HttpContext) {
    const benchmarkId = randomUUID()
    const dispatched = await withStartLock(async () => {
      const running = await this._runningBenchmark(false)
      if (running) return { running }
      return RunBenchmarkJob.dispatch({
        benchmark_id: benchmarkId,
        benchmark_type: 'ai',
        include_ai: true,
      })
    })
    if ('running' in dispatched) {
      return this._alreadyRunning(response, dispatched.running.benchmarkId)
    }

    return response.status(201).send({
      success: true,
      benchmark_id: benchmarkId,
      message: 'AI benchmark started',
    })
  }

  /**
   * Get all benchmark results
   */
  async results({}: HttpContext) {
    const results = await this.benchmarkService.getAllResults()
    return {
      results,
      total: results.length,
    }
  }

  /**
   * Get the latest benchmark result
   */
  async latest({}: HttpContext) {
    const result = await this.benchmarkService.getLatestResult()
    if (!result) {
      return { result: null }
    }
    return { result }
  }

  /**
   * Get a specific benchmark result by ID
   */
  async show({ params, response }: HttpContext) {
    const result = await this.benchmarkService.getResultById(params.id)
    if (!result) {
      return response.status(404).send({
        error: 'Benchmark result not found',
      })
    }
    return { result }
  }

  /**
   * Submit benchmark results to central repository
   */
  async submit({ request, response }: HttpContext) {
    const payload = await request.validateUsing(submitBenchmarkValidator)
    const anonymous = request.input('anonymous') === true || request.input('anonymous') === 'true'

    try {
      const submitResult = await this.benchmarkService.submitToRepository(payload.benchmark_id, anonymous)
      return response.send({
        success: true,
        repository_id: submitResult.repository_id,
        percentile: submitResult.percentile,
      })
    } catch (error) {
      // Pass through the status code from the service if available, otherwise default to 400
      const statusCode = (error as any).statusCode || 400
      logger.error({ err: error }, '[BenchmarkController] Benchmark submit failed')

      // Surface a clear, actionable reason to the UI instead of a generic failure.
      // The rate limiter (429) is the most common cause, so name it explicitly;
      // otherwise pass through the underlying detail (repository error or a service
      // validation message) and fall back to a safe generic only when we have none.
      let errorMessage: string
      if (statusCode === 429) {
        errorMessage = 'You can only submit one benchmark per hour. Please wait a bit and try again.'
      } else {
        errorMessage =
          (error as any).detail || (error as any).message || 'Failed to submit benchmark results.'
      }

      return response.status(statusCode).send({
        success: false,
        error: errorMessage,
      })
    }
  }

  /**
   * Update builder tag for a benchmark result
   */
  async updateBuilderTag({ request, response }: HttpContext) {
    const benchmarkId = request.input('benchmark_id')
    const builderTag = request.input('builder_tag')

    if (!benchmarkId) {
      return response.status(400).send({
        success: false,
        error: 'benchmark_id is required',
      })
    }

    const result = await this.benchmarkService.getResultById(benchmarkId)
    if (!result) {
      return response.status(404).send({
        success: false,
        error: 'Benchmark result not found',
      })
    }

    // Validate builder tag format if provided
    if (builderTag) {
      const tagPattern = /^[A-Za-z]+-[A-Za-z]+-\d{4}$/
      if (!tagPattern.test(builderTag)) {
        return response.status(400).send({
          success: false,
          error: 'Invalid builder tag format. Expected: Word-Word-0000',
        })
      }
    }

    result.builder_tag = builderTag || null
    await result.save()

    return response.send({
      success: true,
      builder_tag: result.builder_tag,
    })
  }

  /**
   * Get comparison stats from central repository
   */
  async comparison({}: HttpContext) {
    const stats = await this.benchmarkService.getComparisonStats()
    return { stats }
  }

  /**
   * Get current benchmark status
   */
  async status({}: HttpContext) {
    const local = this.benchmarkService.getStatus()
    if (local.status !== 'idle') return local
    // A run in the queue worker is invisible to this process's service state.
    const queued = await this._runningBenchmark(true)
    return queued ? { status: 'starting' as const, benchmarkId: queued.benchmarkId } : local
  }

  /**
   * Whether to show the dashboard "re-run under Score v2" banner
   */
  async rerunBanner({}: HttpContext) {
    return { show: await this.benchmarkService.shouldShowRerunBanner() }
  }

  /**
   * Get benchmark settings
   */
  async settings({}: HttpContext) {
    const { default: BenchmarkSetting } = await import('#models/benchmark_setting')
    return await BenchmarkSetting.getAllSettings()
  }

  /**
   * Update benchmark settings
   */
  async updateSettings({ request, response }: HttpContext) {
    const { default: BenchmarkSetting } = await import('#models/benchmark_setting')
    const body = request.body()

    if (body.allow_anonymous_submission !== undefined) {
      await BenchmarkSetting.setValue(
        'allow_anonymous_submission',
        body.allow_anonymous_submission ? 'true' : 'false'
      )
    }

    return response.send({
      success: true,
      settings: await BenchmarkSetting.getAllSettings(),
    })
  }

  private _alreadyRunning(response: HttpContext['response'], benchmarkId: string | null) {
    return response.status(409).send({
      success: false,
      error: 'A benchmark is already running',
      current_benchmark_id: benchmarkId,
    })
  }

  /**
   * A benchmark running in this process (a sync run) or queued/active in the
   * worker. `tolerateQueueErrors` is for the sync path, which must keep working
   * without Redis; the async path needs Redis to dispatch anyway.
   */
  private async _runningBenchmark(
    tolerateQueueErrors: boolean
  ): Promise<{ benchmarkId: string | null } | null> {
    const local = this.benchmarkService.getStatus()
    if (local.status !== 'idle') return { benchmarkId: local.benchmarkId }
    try {
      const queued = this._queuedBenchmark()
      if (!tolerateQueueErrors) return await queued
      // Without Redis the client retries rather than failing, so bound the wait.
      queued.catch(() => {})
      return await Promise.race([
        queued,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('queue check timed out')), 3000).unref()
        ),
      ])
    } catch (error) {
      if (!tolerateQueueErrors) throw error
      logger.warn(
        `[BenchmarkController] Could not check the benchmark queue: ${error instanceof Error ? error.message : error}`
      )
      return null
    }
  }

  private async _queuedBenchmark(): Promise<{ benchmarkId: string | null } | null> {
    const queue = QueueService.getInstance().getQueue(RunBenchmarkJob.queue)
    const [job] = await queue.getJobs(['active', 'waiting', 'delayed'], 0, 0)
    return job ? { benchmarkId: job.data?.benchmark_id ?? job.id ?? null } : null
  }
}
