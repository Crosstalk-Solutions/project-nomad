import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { Worker } from 'bullmq'
import queueConfig from '#config/queue'

export default class QueueWork extends BaseCommand {
  static commandName = 'queue:work'
  static description = 'Start processing jobs from the queue'

  @flags.string({ description: 'Queue name to process', required: true })
  declare queue: string

  static options: CommandOptions = {
    startApp: true,
    staysAlive: true,
  }

  async run() {
    const queueName = this.queue || 'default'

    const jobHandlers = await this.loadJobHandlers()

    const worker = new Worker(
      queueName,
      async (job) => {
        this.logger.info(`Processing job: ${job.id} of type: ${job.name}`)
        const jobHandler = jobHandlers.get(job.name)
        if (!jobHandler) {
          throw new Error(`No handler found for job: ${job.name}`)
        }

        return await jobHandler.handle(job)
      },
      {
        connection: queueConfig.connection,
        concurrency: 3,
        autorun: true,
      }
    )

    worker.on('failed', (job, err) => {
      this.logger.error(`Job failed: ${job?.id}, Error: ${err.message}`)
    })

    worker.on('completed', (job) => {
      this.logger.info(`Job completed: ${job.id}`)
    })

    this.logger.info(`Worker started for queue: ${queueName}`)

    process.on('SIGTERM', async () => {
      this.logger.info('SIGTERM received. Shutting down worker...')
      await worker.close()
      this.logger.info('Worker shut down gracefully.')
      process.exit(0)
    })
  }

  private async loadJobHandlers() {
    const handlers = new Map<string, any>()

    const { RunDownloadJob } = await import('#jobs/run_download_job')
    handlers.set(RunDownloadJob.key, new RunDownloadJob())

    return handlers
  }
}
