/**
 * Tests for how model downloads report their status in the downloads list.
 *
 * BullMQ keeps `failedReason` on a job it has moved to `delayed` for another
 * attempt, so a model download retrying while Ollama starts (Easy Setup) used
 * to render as a permanent failure (#1311). Status must come from the queue
 * state the job was fetched from, as it already does for file downloads.
 *
 * A Japa spec: DownloadService imports transmit and the Adonis logger at module
 * scope. Driven through a fake queue, so no Redis is needed. Run with
 * `node ace test unit`.
 */
import assert from 'node:assert/strict'
import { test } from '@japa/runner'

import { DownloadService } from '../../app/services/download_service.js'
import { DownloadModelJob } from '../../app/jobs/download_model_job.js'

type FakeJob = { id: string; data: Record<string, unknown>; progress: number; failedReason?: string }

/** A QueueService whose model queue holds the given jobs by state; every other queue is empty. */
function fakeQueueService(modelJobs: Partial<Record<'waiting' | 'active' | 'delayed' | 'failed', FakeJob[]>>) {
  return {
    getQueue: (name: string) => ({
      getJobs: async ([state]: string[]) =>
        name === DownloadModelJob.queue ? (modelJobs as Record<string, FakeJob[]>)[state] ?? [] : [],
    }),
  } as any
}

const job = (id: string, failedReason?: string): FakeJob => ({
  id,
  data: { modelName: `model-${id}` },
  progress: 0,
  failedReason,
})

test('model download: a retrying job with a failedReason reports delayed, not failed', async () => {
  const service = new DownloadService(
    fakeQueueService({ delayed: [job('1', 'Ollama service not ready yet')] })
  )
  const [download] = await service.listDownloadJobs('model')
  assert.equal(download.status, 'delayed')
  // The reason is still passed through for display
  assert.equal(download.failedReason, 'Ollama service not ready yet')
})

test('model download: each queue state is reported as itself', async () => {
  const service = new DownloadService(
    fakeQueueService({
      waiting: [job('w')],
      active: [job('a')],
      delayed: [job('d', 'retrying')],
      failed: [job('f', 'gave up')],
    })
  )
  const byId = Object.fromEntries(
    (await service.listDownloadJobs('model')).map((d) => [d.jobId, d.status])
  )
  assert.deepEqual(byId, { w: 'waiting', a: 'active', d: 'delayed', f: 'failed' })
})
