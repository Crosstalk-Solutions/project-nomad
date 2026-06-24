import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { Worker } from 'bullmq'
import queueConfig from '#config/queue'
import { RunDownloadJob } from '#jobs/run_download_job'
import { RunExtractPmtilesJob } from '#jobs/run_extract_pmtiles_job'
import { DownloadModelJob } from '#jobs/download_model_job'
import { RunBenchmarkJob } from '#jobs/run_benchmark_job'
import { EmbedFileJob } from '#jobs/embed_file_job'
import { CheckUpdateJob } from '#jobs/check_update_job'
import { CheckServiceUpdatesJob } from '#jobs/check_service_updates_job'
import { AutoUpdateJob } from '#jobs/auto_update_job'
import { AppAutoUpdateJob } from '#jobs/app_auto_update_job'
import { ContentAutoUpdateJob } from '#jobs/content_auto_update_job'
import { DownloadDrugDataJob } from '#jobs/download_drug_data_job'
import { IngestDrugDataJob } from '#jobs/ingest_drug_data_job'
import { DrugAutoUpdateJob } from '#jobs/drug_auto_update_job'

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
      const stall = this.getStallOptionsForQueue(queueName)
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
          // lockDuration/maxStalledCount are per-queue. Non-drug queues keep
          // the existing default (300000, BullMQ's default maxStalledCount).
          // The drug download/ingest queues are NEW per-queue overrides
          // (1_800_000 / 3) — see getStallOptionsForQueue — not a change to
          // the default applied to every other queue.
          lockDuration: stall.lockDuration,
          ...(stall.maxStalledCount !== undefined
            ? { maxStalledCount: stall.maxStalledCount }
            : {}),
          autorun: true,
        }
      )

      // Required to prevent Node from treating BullMQ internal errors as unhandled
      // EventEmitter errors that crash the process.
      worker.on('error', (err) => {
        this.logger.error(`[${queueName}] Worker error: ${err.message}`)
      })

      worker.on('failed', async (job, err) => {
        this.logger.error(`[${queueName}] Job failed: ${job?.id}, Error: ${err.message}`)

        // If this was a Wikipedia download, mark it as failed in the DB
        if (job?.data?.filetype === 'zim' && job?.data?.url?.includes('wikipedia_en_')) {
          try {
            const { DockerService } = await import('#services/docker_service')
            const { ZimService } = await import('#services/zim_service')
            const dockerService = new DockerService()
            const zimService = new ZimService(dockerService)
            await zimService.onWikipediaDownloadComplete(job.data.url, false)
          } catch (e: any) {
            this.logger.error(
              `[${queueName}] Failed to update Wikipedia status: ${e.message}`
            )
          }
        }

        // Terminal failure of an AUTO content update → advance that resource's
        // backoff (self-disables after MAX_CONSECUTIVE_FAILURES). BullMQ emits
        // `failed` on every attempt, so gate on the final attempt to count each
        // doomed download once, not once per retry. Manual downloads (auto !== true)
        // are deliberately excluded.
        const meta = job?.data?.resourceMetadata
        const isTerminal = (job?.attemptsMade ?? 0) >= (job?.opts?.attempts ?? 1)
        if (job?.name === RunDownloadJob.key && meta?.auto === true && isTerminal) {
          try {
            const { default: InstalledResource } = await import('#models/installed_resource')
            const { recordResourceUpdateFailure } = await import(
              '../../app/utils/content_auto_update_backoff.js'
            )
            const resource = await InstalledResource.query()
              .where('resource_id', meta.resource_id)
              .where('resource_type', job.data.filetype)
              .first()
            if (resource) {
              await recordResourceUpdateFailure(
                resource,
                err instanceof Error ? err.message : String(err)
              )
            }
          } catch (e: any) {
            this.logger.error(
              `[${queueName}] Failed to record content auto-update backoff: ${e.message}`
            )
          }
        }
      })

      worker.on('completed', (job) => {
        this.logger.info(`[${queueName}] Job completed: ${job.id}`)
      })

      workers.push(worker)
      this.logger.info(`Worker started for queue: ${queueName}`)
    }

    // Schedule nightly update checks (idempotent, will persist over restarts)
    await CheckUpdateJob.scheduleNightly()
    await CheckServiceUpdatesJob.scheduleNightly()
    await AutoUpdateJob.schedule()
    await AppAutoUpdateJob.schedule()
    await ContentAutoUpdateJob.schedule()
    await DrugAutoUpdateJob.schedule()

    // Safety net: log unhandled rejections instead of crashing the worker process.
    // Individual job errors are already caught by BullMQ; this catches anything that
    // escapes (e.g. a fire-and-forget promise in a callback that rejects unexpectedly).
    process.on('unhandledRejection', (reason) => {
      this.logger.error(
        `Unhandled promise rejection in worker process: ${reason instanceof Error ? reason.message : String(reason)}`
      )
    })

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
    handlers.set(RunExtractPmtilesJob.key, new RunExtractPmtilesJob())
    handlers.set(DownloadModelJob.key, new DownloadModelJob())
    handlers.set(RunBenchmarkJob.key, new RunBenchmarkJob())
    handlers.set(EmbedFileJob.key, new EmbedFileJob())
    handlers.set(CheckUpdateJob.key, new CheckUpdateJob())
    handlers.set(CheckServiceUpdatesJob.key, new CheckServiceUpdatesJob())
    handlers.set(AutoUpdateJob.key, new AutoUpdateJob())
    handlers.set(AppAutoUpdateJob.key, new AppAutoUpdateJob())
    handlers.set(ContentAutoUpdateJob.key, new ContentAutoUpdateJob())
    handlers.set(DrugAutoUpdateJob.key, new DrugAutoUpdateJob())
    handlers.set(DownloadDrugDataJob.key, new DownloadDrugDataJob())
    handlers.set(IngestDrugDataJob.key, new IngestDrugDataJob())

    queues.set(RunDownloadJob.key, RunDownloadJob.queue)
    queues.set(RunExtractPmtilesJob.key, RunExtractPmtilesJob.queue)
    queues.set(DownloadModelJob.key, DownloadModelJob.queue)
    queues.set(RunBenchmarkJob.key, RunBenchmarkJob.queue)
    queues.set(EmbedFileJob.key, EmbedFileJob.queue)
    queues.set(CheckUpdateJob.key, CheckUpdateJob.queue)
    queues.set(CheckServiceUpdatesJob.key, CheckServiceUpdatesJob.queue)
    queues.set(AutoUpdateJob.key, AutoUpdateJob.queue)
    queues.set(AppAutoUpdateJob.key, AppAutoUpdateJob.queue)
    queues.set(ContentAutoUpdateJob.key, ContentAutoUpdateJob.queue)
    queues.set(DrugAutoUpdateJob.key, DrugAutoUpdateJob.queue)
    queues.set(DownloadDrugDataJob.key, DownloadDrugDataJob.queue)
    queues.set(IngestDrugDataJob.key, IngestDrugDataJob.queue)

    return [handlers, queues]
  }

  /**
   * Per-queue BullMQ stall-recovery options.
   *
   * Every queue except the two drug queues keeps the branch default
   * (lockDuration 300000, and BullMQ's default maxStalledCount of 1 — left
   * unset). The drug download/ingest queues are the ONLY per-queue override:
   * each part is a long single stream (a ~150 MB resumable HTTP pull, then an
   * unzip + JSON-stream ingest at concurrency 1), so a longer lock plus a
   * higher stalled tolerance keeps a transient lock-renewal miss from killing
   * the continuation chain ("job stalled more than allowable limit").
   */
  private getStallOptionsForQueue(
    queueName: string
  ): { lockDuration: number; maxStalledCount?: number } {
    if (
      queueName === DownloadDrugDataJob.queue ||
      queueName === IngestDrugDataJob.queue
    ) {
      return { lockDuration: 1_800_000, maxStalledCount: 3 }
    }
    return { lockDuration: 300000 }
  }

  /**
   * Get concurrency setting for a specific queue
   * Can be customized per queue based on workload characteristics
   */
  private getConcurrencyForQueue(queueName: string): number {
    const concurrencyMap: Record<string, number> = {
      [RunDownloadJob.queue]: 3,
      // pmtiles extract hits the Protomaps CDN with many parallel range reads per job;
      // cap concurrency at 2 so a second extract doesn't starve the first.
      [RunExtractPmtilesJob.queue]: 2,
      [DownloadModelJob.queue]: 2, // Lower concurrency for resource-intensive model downloads
      [RunBenchmarkJob.queue]: 1, // Run benchmarks one at a time for accurate results
      [EmbedFileJob.queue]: 2, // Lower concurrency for embedding jobs, can be resource intensive
      [CheckUpdateJob.queue]: 1, // No need to run more than one update check at a time
      // Drug download: one part at a time — a ~150 MB resumable HTTP pull per
      // part, no benefit to parallelism and easier on the storage volume.
      [DownloadDrugDataJob.queue]: 1,
      // Drug ingest: one heavy stream at a time — unzipping + parsing ~150 MB
      // of JSON into batched DB inserts; serial keeps memory bounded.
      [IngestDrugDataJob.queue]: 1,
      default: 3,
    }

    return concurrencyMap[queueName] || concurrencyMap.default
  }
}
