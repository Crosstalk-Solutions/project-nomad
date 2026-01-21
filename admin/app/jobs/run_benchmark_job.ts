import { Job } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { BenchmarkService } from '#services/benchmark_service'
import type { RunBenchmarkJobParams } from '../../types/benchmark.js'
import logger from '@adonisjs/core/services/logger'

export class RunBenchmarkJob {
  static get queue() {
    return 'benchmarks'
  }

  static get key() {
    return 'run-benchmark'
  }

  async handle(job: Job) {
    const { benchmark_id, benchmark_type } = job.data as RunBenchmarkJobParams

    logger.info(`[RunBenchmarkJob] Starting benchmark ${benchmark_id} of type ${benchmark_type}`)

    const benchmarkService = new BenchmarkService()

    try {
      let result

      switch (benchmark_type) {
        case 'full':
          result = await benchmarkService.runFullBenchmark()
          break
        case 'system':
          result = await benchmarkService.runSystemBenchmarks()
          break
        case 'ai':
          result = await benchmarkService.runAIBenchmark()
          break
        default:
          throw new Error(`Unknown benchmark type: ${benchmark_type}`)
      }

      logger.info(`[RunBenchmarkJob] Benchmark ${benchmark_id} completed with NOMAD score: ${result.nomad_score}`)

      return {
        success: true,
        benchmark_id: result.benchmark_id,
        nomad_score: result.nomad_score,
      }
    } catch (error) {
      logger.error(`[RunBenchmarkJob] Benchmark ${benchmark_id} failed: ${error.message}`)
      throw error
    }
  }

  static async dispatch(params: RunBenchmarkJobParams) {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)

    try {
      const job = await queue.add(this.key, params, {
        jobId: params.benchmark_id,
        attempts: 1, // Benchmarks shouldn't be retried automatically
        removeOnComplete: {
          count: 10, // Keep last 10 completed jobs
        },
        removeOnFail: {
          count: 5, // Keep last 5 failed jobs
        },
      })

      logger.info(`[RunBenchmarkJob] Dispatched benchmark job ${params.benchmark_id}`)

      return {
        job,
        created: true,
        message: `Benchmark job ${params.benchmark_id} dispatched successfully`,
      }
    } catch (error) {
      if (error.message.includes('job already exists')) {
        const existing = await queue.getJob(params.benchmark_id)
        return {
          job: existing,
          created: false,
          message: `Benchmark job ${params.benchmark_id} already exists`,
        }
      }
      throw error
    }
  }

  static async getJob(benchmarkId: string): Promise<Job | undefined> {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    return await queue.getJob(benchmarkId)
  }

  static async getJobState(benchmarkId: string): Promise<string | undefined> {
    const job = await this.getJob(benchmarkId)
    return job ? await job.getState() : undefined
  }
}
