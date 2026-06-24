import { Job } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { DrugReferenceService } from '#services/drug_reference_service'
import { DownloadDrugDataJob } from '#jobs/download_drug_data_job'
import { IngestDrugDataJob } from '#jobs/ingest_drug_data_job'
import logger from '@adonisjs/core/services/logger'

/**
 * Daily job that checks the openFDA manifest's `export_date` against the
 * last-ingested one and, when newer, re-downloads the FDA drug dataset (the
 * download auto-chains the ingest, which advances the stored export_date).
 *
 * Mirrors {@link ContentAutoUpdateJob} (the ZIM/map freshness loop) but stays a
 * SEPARATE job rather than extending it: the drug dataset isn't an
 * `InstalledResource` catalog row with a filename `YYYY-MM` version, so its
 * freshness key (export_date) and apply path (the drug download/ingest chain)
 * don't fit the ZIM loop. openFDA publishes ~weekly; a daily check is safe and
 * bandwidth-respectful.
 *
 * Gating (kept deliberately simple for v1):
 *   - Only acts when the dataset is actually INSTALLED (rows present). An update
 *     for something not installed is meaningless.
 *   - Skips when a drug download OR ingest is already in flight, so it never
 *     stacks a refresh on top of a running install/update.
 * The 1.7 GB transfer respects those guards; a window/cap analogous to the ZIM
 * `contentAutoUpdate.*` keys is a follow-up (open question for the maintainer:
 * share `contentAutoUpdate.*` or get `drugReference.autoUpdate.*`).
 */
export class DrugAutoUpdateJob {
  static get queue() {
    return 'system'
  }

  static get key() {
    return 'drug-auto-update'
  }

  async handle(_job: Job) {
    logger.info('[DrugAutoUpdateJob] Evaluating drug-reference freshness...')

    const service = new DrugReferenceService()

    // Only act when the dataset is installed.
    const rowCount = await service.rowCount()
    if (rowCount === 0) {
      logger.info('[DrugAutoUpdateJob] Drug dataset not installed — skipping.')
      return { started: false, reason: 'not-installed' }
    }

    // Don't stack on top of an in-flight download/ingest.
    const [dlJob, ingJob] = await Promise.all([
      DownloadDrugDataJob.getJob(),
      IngestDrugDataJob.getJob(),
    ])
    const activeStates = ['active', 'waiting', 'delayed']
    const dlState = dlJob ? await dlJob.getState() : undefined
    const ingState = ingJob ? await ingJob.getState() : undefined
    if (
      (dlState && activeStates.includes(dlState)) ||
      (ingState && activeStates.includes(ingState))
    ) {
      logger.info('[DrugAutoUpdateJob] A drug job is already in flight — skipping.')
      return { started: false, reason: 'job-in-flight' }
    }

    let check: Awaited<ReturnType<DrugReferenceService['checkForUpdate']>>
    try {
      check = await service.checkForUpdate()
    } catch (err) {
      // Offline or manifest fetch failed — a transient miss, not an error worth
      // failing the scheduled job over. Try again next day.
      logger.warn(
        `[DrugAutoUpdateJob] Freshness check failed (will retry next run): ${
          err instanceof Error ? err.message : String(err)
        }`
      )
      return { started: false, reason: 'check-failed' }
    }

    if (!check.updateAvailable) {
      logger.info(
        `[DrugAutoUpdateJob] Up to date (current=${check.currentExportDate ?? 'none'}, ` +
          `latest=${check.latestExportDate ?? 'unknown'}).`
      )
      return { started: false, reason: 'up-to-date' }
    }

    logger.info(
      `[DrugAutoUpdateJob] Newer export_date available ` +
        `(current=${check.currentExportDate ?? 'none'} → latest=${check.latestExportDate}); ` +
        'triggering re-download.'
    )
    const result = await service.triggerDownload()
    return {
      started: result.created,
      reason: result.created ? 'update-dispatched' : result.message,
      latestExportDate: check.latestExportDate,
    }
  }

  static async schedule() {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(this.queue)

    await queue.upsertJobScheduler(
      'daily-drug-auto-update',
      { pattern: '30 3 * * *' }, // 03:30 daily — off-peak, distinct from the hourly content loop
      {
        name: this.key,
        opts: {
          removeOnComplete: { count: 7 },
          removeOnFail: { count: 5 },
        },
      }
    )

    logger.info('[DrugAutoUpdateJob] Drug auto-update evaluation scheduled with cron: 30 3 * * *')
  }

  static async dispatch() {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(this.queue)

    const job = await queue.add(
      this.key,
      {},
      {
        attempts: 1,
        removeOnComplete: { count: 7 },
        removeOnFail: { count: 5 },
      }
    )

    logger.info(`[DrugAutoUpdateJob] Dispatched ad-hoc drug auto-update evaluation job ${job.id}`)
    return job
  }
}
