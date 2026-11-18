import { QueueService } from '#services/queue_service'
import { parseCancelChoice, type BenchmarkCancelChoice } from './benchmark_cancel.js'

/**
 * Cross-process cancel signal for benchmarks. The Settings page runs benchmarks
 * inline in the web process (`sync=true`) and the API can also queue them on the
 * worker, so the cancel has to travel through Redis, like
 * DownloadModelJob.cancelKey. Only one benchmark runs at a time, so one key is enough.
 */
export const BENCHMARK_CANCEL_KEY = 'nomad:benchmark:cancel'
const BENCHMARK_QUEUE = 'benchmarks'
const CANCEL_TTL_SECONDS = 600

async function client() {
  return QueueService.getInstance().getQueue(BENCHMARK_QUEUE).client
}

export async function signalBenchmarkCancel(choice: BenchmarkCancelChoice): Promise<void> {
  const redis = await client()
  await redis.set(BENCHMARK_CANCEL_KEY, choice, { EX: CANCEL_TTL_SECONDS })
}

/** Returns the pending cancel choice (and clears it), or null if none. */
export async function takeBenchmarkCancel(): Promise<BenchmarkCancelChoice | null> {
  const redis = await client()
  const value = await redis.get(BENCHMARK_CANCEL_KEY)
  if (value === null) return null
  await redis.del(BENCHMARK_CANCEL_KEY)
  return parseCancelChoice(value) ?? 'keep'
}

export async function clearBenchmarkCancel(): Promise<void> {
  const redis = await client()
  await redis.del(BENCHMARK_CANCEL_KEY)
}

/** Remove benchmark jobs that are queued but haven't started. Returns how many. */
export async function removeQueuedBenchmarks(): Promise<number> {
  const queue = QueueService.getInstance().getQueue(BENCHMARK_QUEUE)
  const jobs = await queue.getJobs(['waiting', 'delayed', 'prioritized'])
  let removed = 0
  for (const job of jobs) {
    try {
      await job.remove()
      removed++
    } catch {
      // It may have just started; the running benchmark will see the cancel flag.
    }
  }
  return removed
}
