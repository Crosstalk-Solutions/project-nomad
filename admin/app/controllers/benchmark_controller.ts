import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { BenchmarkService } from '#services/benchmark_service'
import { runBenchmarkValidator, submitBenchmarkValidator } from '#validators/benchmark'
import { RunBenchmarkJob } from '#jobs/run_benchmark_job'
import type { BenchmarkType } from '../../types/benchmark.js'
import { randomUUID } from 'node:crypto'

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

    // Check if a benchmark is already running
    const status = this.benchmarkService.getStatus()
    if (status.status !== 'idle') {
      return response.status(409).send({
        success: false,
        error: 'A benchmark is already running',
        current_benchmark_id: status.benchmarkId,
      })
    }

    // Run synchronously if requested (useful for local dev without Redis)
    if (runSync) {
      try {
        let result
        switch (benchmarkType) {
          case 'full':
            result = await this.benchmarkService.runFullBenchmark()
            break
          case 'system':
            result = await this.benchmarkService.runSystemBenchmarks()
            break
          case 'ai':
            result = await this.benchmarkService.runAIBenchmark()
            break
          default:
            result = await this.benchmarkService.runFullBenchmark()
        }
        return response.send({
          success: true,
          benchmark_id: result.benchmark_id,
          nomad_score: result.nomad_score,
          result,
        })
      } catch (error) {
        return response.status(500).send({
          success: false,
          error: error.message,
        })
      }
    }

    // Generate benchmark ID and dispatch job (async)
    const benchmarkId = randomUUID()
    const { job, created } = await RunBenchmarkJob.dispatch({
      benchmark_id: benchmarkId,
      benchmark_type: benchmarkType,
      include_ai: benchmarkType === 'full' || benchmarkType === 'ai',
    })

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
    const status = this.benchmarkService.getStatus()
    if (status.status !== 'idle') {
      return response.status(409).send({
        success: false,
        error: 'A benchmark is already running',
      })
    }

    const benchmarkId = randomUUID()
    await RunBenchmarkJob.dispatch({
      benchmark_id: benchmarkId,
      benchmark_type: 'system',
      include_ai: false,
    })

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
    const status = this.benchmarkService.getStatus()
    if (status.status !== 'idle') {
      return response.status(409).send({
        success: false,
        error: 'A benchmark is already running',
      })
    }

    const benchmarkId = randomUUID()
    await RunBenchmarkJob.dispatch({
      benchmark_id: benchmarkId,
      benchmark_type: 'ai',
      include_ai: true,
    })

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
      return response.status(statusCode).send({
        success: false,
        error: error.message,
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
    return this.benchmarkService.getStatus()
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
}
