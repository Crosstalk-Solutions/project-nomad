import type { BenchmarkStatus } from '../../types/benchmark.js'

/** A benchmark job still in the queue, as RunBenchmarkJob.getInFlight() reports it. */
export interface InFlightBenchmark {
  state: 'active' | 'waiting' | 'delayed'
  benchmarkId: string | null
  /** The job's BullMQ progress; the worker writes `{ status }` into it at every stage. */
  progress: unknown
}

const NOT_RUNNING: ReadonlySet<BenchmarkStatus> = new Set(['idle', 'completed', 'error'])

/**
 * Decide the current benchmark status from the queue.
 *
 * Benchmarks run in the queue worker, so the web process's BenchmarkService
 * never sees them and its in-memory status always reads idle (#1326). The queue
 * is the one place both processes can see: a job that is active or still
 * waiting means a run is in flight, and the worker reports its stage through
 * the job's progress. `local` is the web process's own status, which is only
 * ever non-idle for a `sync=true` run executing in this process.
 */
export function resolveBenchmarkStatus(
  inFlight: InFlightBenchmark[],
  local: { status: BenchmarkStatus; benchmarkId: string | null }
): { status: BenchmarkStatus; benchmarkId: string | null } {
  const active = inFlight.find((j) => j.state === 'active')
  if (active) {
    const reported = (active.progress as { status?: BenchmarkStatus } | null)?.status
    // Before the worker's first stage update, or in the moment between it reporting
    // `completed` and the job leaving the active set, the run is still in flight
    const status = reported && !NOT_RUNNING.has(reported) ? reported : 'starting'
    return { status, benchmarkId: active.benchmarkId }
  }
  const queued = inFlight.find((j) => j.state === 'waiting' || j.state === 'delayed')
  if (queued) return { status: 'starting', benchmarkId: queued.benchmarkId }
  return local
}
