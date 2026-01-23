import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { Worker } from 'bullmq'
import queueConfig from '#config/queue'
import { RunDownloadJob } from '#jobs/run_download_job'
import { DownloadModelJob } from '#jobs/download_model_job'
import { RunBenchmarkJob } from '#jobs/run_benchmark_job'

export default class QueueWork extends BaseCommand {
  static commandName = 'queue:work'
  static description = 'Start processing jobs from the queue'

  @flags.string({ description: 'Queue name to process' })
  declare queue: string

  @flags.boolean({ description: 'Process all queues automatically' })
  declare all: boolean

  static options: CommandOptions = {
    startApp: true,
    staysAlive: true,
  }

  async run() {
    // Validate that either --queue or --all is provided
    if (!this.queue && !this.all) {
      this.logger.error('You must specify either --queue=<name> or --all')
      process.exit(1)
    }

    if (this.queue && this.all) {
      this.logger.error('Cannot specify both --queue and --all flags')
      process.exit(1)
    }

    const [jobHandlers, allQueues] = await this.loadJobHandlers()

    // Determine which queues to process
    const queuesToProcess = this.all ? Array.from(allQueues.values()) : [this.queue]

    this.logger.info(`Starting workers for queues: ${queuesToProcess.join(', ')}`)

    const workers: Worker[] = []

    // Create a worker for each queue
    for (const queueName of queuesToProcess) {
      const worker = new Worker(
        queueName,
        async (job) => {
          this.logger.info(`[${queueName}] Processing job: ${job.id} of type: ${job.name}`)
          const jobHandler = jobHandlers.get(job.name)
          if (!jobHandler) {
            throw new Error(`No handler found for job: ${job.name}`)
          }

          return await jobHandler.handle(job)
        },
        {
          connection: queueConfig.connection,
          concurrency: this.getConcurrencyForQueue(queueName),
          autorun: true,
        }
      )

      worker.on('failed', (job, err) => {
        this.logger.error(`[${queueName}] Job failed: ${job?.id}, Error: ${err.message}`)
      })

      worker.on('completed', (job) => {
        this.logger.info(`[${queueName}] Job completed: ${job.id}`)
      })

      workers.push(worker)
      this.logger.info(`Worker started for queue: ${queueName}`)
    }

    // Graceful shutdown for all workers
    process.on('SIGTERM', async () => {
      this.logger.info('SIGTERM received. Shutting down workers...')
      await Promise.all(workers.map((worker) => worker.close()))
      this.logger.info('All workers shut down gracefully.')
      process.exit(0)
    })
  }

  private async loadJobHandlers(): Promise<[Map<string, any>, Map<string, string>]> {
    const handlers = new Map<string, any>()
    const queues = new Map<string, string>()

    handlers.set(RunDownloadJob.key, new RunDownloadJob())
    handlers.set(DownloadModelJob.key, new DownloadModelJob())
    handlers.set(RunBenchmarkJob.key, new RunBenchmarkJob())

    queues.set(RunDownloadJob.key, RunDownloadJob.queue)
    queues.set(DownloadModelJob.key, DownloadModelJob.queue)
    queues.set(RunBenchmarkJob.key, RunBenchmarkJob.queue)

    return [handlers, queues]
  }

  /**
   * Get concurrency setting for a specific queue
   * Can be customized per queue based on workload characteristics
   */
  private getConcurrencyForQueue(queueName: string): number {
    const concurrencyMap: Record<string, number> = {
      [RunDownloadJob.queue]: 3,
      [DownloadModelJob.queue]: 2, // Lower concurrency for resource-intensive model downloads
      [RunBenchmarkJob.queue]: 1, // Run benchmarks one at a time for accurate results
      default: 3,
    }

    return concurrencyMap[queueName] || concurrencyMap.default
  }
}
