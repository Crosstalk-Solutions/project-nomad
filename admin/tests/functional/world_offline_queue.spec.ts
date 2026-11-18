import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import { Queue } from 'bullmq'
import queueConfig from '#config/queue'
import type { QueueService } from '#services/queue_service'
import {
  WorldOfflineQueue,
  WORLD_OFFLINE_QUEUE,
  RUN_WORLD_OFFLINE,
} from '#services/world_offline_queue'
import { WorldOfflineError } from '#services/world_offline_service'
import { RunWorldOfflineJob } from '#jobs/run_world_offline_job'
import type { WorldInventory, WorldJob, WorldPackId } from '../../types/world_offline.js'

type StoredJob = {
  mode: 'download' | 'resume'
  packId: WorldPackId
  operationId: string
  totalBytes: number
}

function state(id: string, status: WorldJob['status'], packId = 'satellite-z8'): WorldJob {
  return {
    id, status, stage: status, packIds: [packId], bytesDownloaded: 0,
    totalBytes: 1_023_000_000, speedBytesPerSecond: 0, completedMonths: 0,
  }
}

function fixture() {
  let lease: string | undefined
  let activeId: string | undefined
  const jobs = new Map<string, StoredJob>()
  let forcedReservation: { id: string; data: StoredJob } | undefined
  let workerJob: WorldJob | null = null
  let workerUnavailable = false
  let loseDownloadResponse = false
  const calls: { action: string; input: Record<string, unknown> }[] = []

  const queue = {
    toKey: (key: string) => key,
    client: Promise.resolve({
      defineCommand() {},
      async runCommand(_name: string, [_key, action, token]: string[]) {
        if (action === 'acquire') {
          if (lease) return null
          lease = token
          return 'OK'
        }
        if (lease === token) lease = undefined
      },
    }),
    async getDeduplicationJobId() { return activeId },
    async getJob(id: string) {
      const data = jobs.get(id)
      if (!data) return
      return {
        id, data: { ...data },
        async updateData(next: StoredJob) { jobs.set(id, this.data = { ...next }) },
      }
    },
    async getJobs() { return [] },
    async add(name: string, data: StoredJob, opts: { jobId: string; deduplication?: { id: string } }) {
      if (name !== RUN_WORLD_OFFLINE || !opts.deduplication?.id) throw new Error('Missing deduplication')
      if (forcedReservation) {
        activeId = forcedReservation.id
        jobs.set(activeId, forcedReservation.data)
      } else if (!activeId) {
        activeId = opts.jobId
        jobs.set(activeId, { ...data })
      }
      // This mirrors BullMQ's deduplicated add return shape. Its data is
      // the requesting payload rather than the authoritative Redis payload.
      return { id: activeId, data }
    },
  }
  const queueService = {
    getQueue(name: string) {
      if (name !== WORLD_OFFLINE_QUEUE) throw new Error('Unexpected queue')
      return queue
    },
  } as unknown as Pick<QueueService, 'getQueue'>
  const inventory = (): WorldInventory => ({
    job: workerJob ? { ...workerJob } : null,
    packs: ['satellite-z8', 'satellite-z9'].map(id => ({
      id, downloadBytes: 1_023_000_000, installed: false, role: 'satellite',
    })),
  })
  const service = {
    async inventory() { return workerUnavailable ? { ...inventory(), job: null } : inventory() },
    async connectedInventory() {
      if (workerUnavailable) throw new WorldOfflineError(503, 'Worker unavailable')
      return inventory()
    },
    async control(action: string, input: Record<string, unknown>) {
      calls.push({ action, input })
      if (action === 'download') {
        workerJob = state(String(input.requestId), 'running', (input.packIds as string[])[0])
        if (loseDownloadResponse) throw new WorldOfflineError(503, 'Response lost')
      }
      if (action === 'resume' && workerJob) workerJob = { ...workerJob, status: 'queued', stage: 'queued' }
      if (action === 'pause' && workerJob) workerJob = { ...workerJob, status: 'paused', stage: 'paused' }
      if (action === 'cancel' && workerJob) workerJob = { ...workerJob, status: 'cancelled', stage: 'cancelled' }
      return { job: workerJob }
    },
  }
  return {
    queueService: new WorldOfflineQueue(service, queueService), calls,
    service,
    nativeId: () => activeId!,
    initial(job: WorldJob) { workerJob = job },
    unavailable() { workerUnavailable = true },
    loseResponse() { loseDownloadResponse = true },
    concurrentReservation(id: string, data: StoredJob) { forcedReservation = { id, data } },
  }
}

test.group('World offline native queue', () => {
  test('admits a singleton through the BullMQ Redis adapter', async ({ assert }) => {
    const connection = queueConfig.connection.duplicate()
    const backend = new Queue(WORLD_OFFLINE_QUEUE, {
      connection,
      prefix: 'world-offline-test-' + randomUUID(),
    })
    try {
      const { service } = fixture()
      const native = new WorldOfflineQueue(service, { getQueue: () => backend })
      const [first, second] = await Promise.all([
        native.download('satellite-z8'), native.download('satellite-z8'),
      ])
      assert.deepEqual(first, second)
      assert.equal(await backend.getWaitingCount(), 1)
      assert.equal((await backend.getJob(first.job!.id))?.data.packId, 'satellite-z8')
      await assert.rejects(() => native.download('satellite-z9'), /active world map/)
    } finally {
      try {
        await backend.obliterate()
        await backend.close()
      } finally {
        connection.disconnect()
      }
    }
  })

  test('serializes concurrent submissions and returns the actual reserved request', async ({ assert }) => {
    const { queueService, calls, nativeId } = fixture()
    const [one, two] = await Promise.all([
      queueService.download('satellite-z8'),
      queueService.download('satellite-z8'),
    ])
    assert.match(nativeId(), /^[a-f0-9]{32}$/)
    assert.deepEqual(one, two)
    assert.equal(one.job?.id, nativeId())
    assert.equal((await queueService.inventory()).job?.status, 'queued')
    await assert.rejects(() => queueService.download('satellite-z9'), /active world map/)
    await assert.rejects(() => queueService.remove('satellite-z8'), /active world map/)
    await assert.rejects(() => queueService.discard(nativeId()), /active world map/)
    assert.deepEqual(calls, [])
  })

  test('does not trust transient data returned by a deduplicated add', async ({ assert }) => {
    const { queueService, concurrentReservation } = fixture()
    const id = '0'.repeat(32)
    concurrentReservation(id, { mode: 'download', packId: 'satellite-z9', operationId: id, totalBytes: 200 })
    await assert.rejects(() => queueService.download('satellite-z8'), /active world map/)
    assert.deepEqual((await queueService.inventory()).job?.packIds, ['satellite-z9'])
  })

  test('adopts the same operation after losing the dispatch response', async ({ assert }) => {
    const { queueService, calls, nativeId, loseResponse } = fixture()
    await queueService.download('satellite-z8')
    loseResponse()
    await assert.rejects(() => queueService.current(nativeId()), /Response lost/)
    const recovered = await queueService.current(nativeId())
    assert.equal(recovered.id, nativeId())
    assert.equal(recovered.status, 'running')
    assert.deepEqual(calls, [{
      action: 'download', input: { packIds: ['satellite-z8'], requestId: nativeId() },
    }])
  })

  test('cancels an undispatched reservation while the worker is unavailable', async ({ assert }) => {
    const { queueService, calls, nativeId, unavailable } = fixture()
    await queueService.download('satellite-z8')
    unavailable()
    await queueService.cancel(nativeId())
    assert.equal((await queueService.current(nativeId())).status, 'cancelled')
    assert.deepEqual(calls, [])
  })

  test('adopts an existing paused operation without auto-resuming a later pause', async ({ assert }) => {
    const { queueService, calls, nativeId, initial } = fixture()
    const id = '0'.repeat(32)
    initial(state(id, 'paused'))
    assert.equal((await queueService.resume(id)).job?.id, id)
    assert.notEqual(nativeId(), id)
    assert.equal((await queueService.current(nativeId())).status, 'queued')
    await queueService.pause(id)
    assert.equal((await queueService.current(nativeId())).status, 'paused')
    assert.deepEqual(calls.map(({ action }) => action), ['resume', 'pause'])
    await queueService.resume(id)
    assert.deepEqual(calls.map(({ action }) => action), ['resume', 'pause', 'resume'])
  })

  test('validates a retry and uses a fresh request ID, with idempotent concurrent retry', async ({ assert }) => {
    const { queueService, initial, calls, nativeId } = fixture()
    const id = '0'.repeat(32)
    initial(state(id, 'failed'))
    await assert.rejects(() => queueService.retry('1'.repeat(32)), /failed or cancelled/)
    const [one, two] = await Promise.all([queueService.retry(id), queueService.retry(id)])
    assert.deepEqual(one, two)
    assert.notEqual(nativeId(), id)
    await queueService.current(nativeId())
    assert.deepEqual(calls, [{
      action: 'download', input: { packIds: ['satellite-z8'], requestId: nativeId() },
    }])
  })

  test('releases a paused monitor promptly when its worker shuts down', async ({ assert }) => {
    const shutdown = new AbortController()
    const job = new RunWorldOfflineJob({
      async current(id) {
        shutdown.abort()
        return state(id, 'paused')
      },
    })
    await assert.rejects(() => job.handle({ id: 'native' }, shutdown.signal), /aborted/i)
  })
})
