import type { DownloadJobWithProgress } from '../../types/downloads.js'

export type DownloadsSummary = {
  /** Jobs still queued or downloading (anything that hasn't failed). */
  inProgress: number
  failed: number
  /** Overall progress of the in-progress jobs, 0-100, or null when unknown. */
  percent: number | null
}

/**
 * Summarize the download queue for the global downloads indicator.
 *
 * Overall progress is byte-weighted when every in-progress job reports its
 * size, so one large ZIM doesn't count the same as a small map. Otherwise it
 * falls back to the average of the per-job percentages.
 */
export function summarizeDownloads(
  downloads: DownloadJobWithProgress[] | undefined | null
): DownloadsSummary {
  const jobs = downloads ?? []
  const inProgressJobs = jobs.filter((job) => job.status !== 'failed')
  const failed = jobs.length - inProgressJobs.length

  if (inProgressJobs.length === 0) {
    return { inProgress: 0, failed, percent: null }
  }

  const allSized = inProgressJobs.every((job) => (job.totalBytes ?? 0) > 0)
  let percent: number
  if (allSized) {
    const total = inProgressJobs.reduce((sum, job) => sum + (job.totalBytes ?? 0), 0)
    const done = inProgressJobs.reduce(
      (sum, job) => sum + Math.min(job.downloadedBytes ?? 0, job.totalBytes ?? 0),
      0
    )
    percent = (done / total) * 100
  } else {
    const sum = inProgressJobs.reduce((acc, job) => acc + clampPercent(job.progress), 0)
    percent = sum / inProgressJobs.length
  }

  return { inProgress: inProgressJobs.length, failed, percent: Math.round(clampPercent(percent)) }
}

function clampPercent(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, value))
}
