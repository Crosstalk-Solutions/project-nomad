/**
 * Visual status assigned to an in-flight (or stuck) embedding job, used to
 * pick the colored status pill in the KB Processing Queue. See RFC #883 §5.
 *
 * - `waiting`  — queued, no batch has started yet
 * - `healthy`  — last batch < 2 minutes ago
 * - `slow`     — last batch 2-5 minutes ago (CPU-paced multi-batch ingestion
 *                falls into this band; not necessarily a problem)
 * - `stalled`  — last batch > 5 minutes ago (likely a real problem)
 * - `failed`   — job recorded a failed status
 */
export type JobHealthStatus = 'waiting' | 'healthy' | 'slow' | 'stalled' | 'failed'

export interface JobHealthInput {
  /** BullMQ job.data.status — set by EmbedFileJob.handle on transitions. */
  status: string
  /** 0-100. 0 means no work observed yet on this job-row. */
  progress: number
  /** ms epoch of the last completed batch. Multi-batch ZIMs update this on
   * every continuation; single-batch jobs leave it unset until completion. */
  lastBatchAt?: number
  /** ms epoch of the first batch start. Used as a fallback "last activity"
   * signal for jobs that haven't yet completed their first batch. */
  startedAt?: number
  /** Current ms epoch. Injected for testability. */
  now: number
}

const SLOW_THRESHOLD_MS = 2 * 60 * 1000
const STALLED_THRESHOLD_MS = 5 * 60 * 1000

export function computeJobHealth(input: JobHealthInput): JobHealthStatus {
  if (input.status === 'failed') return 'failed'

  // No progress recorded and no activity timestamps — job is still queued.
  if (
    input.progress === 0 &&
    input.lastBatchAt === undefined &&
    input.startedAt === undefined
  ) {
    return 'waiting'
  }

  const lastActivity = input.lastBatchAt ?? input.startedAt ?? input.now
  const stalenessMs = input.now - lastActivity

  if (stalenessMs > STALLED_THRESHOLD_MS) return 'stalled'
  if (stalenessMs > SLOW_THRESHOLD_MS) return 'slow'
  return 'healthy'
}
