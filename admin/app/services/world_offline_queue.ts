import { randomBytes } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Job, Queue } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { WorldOfflineError, WorldOfflineService } from '#services/world_offline_service'
import {
  WORLD_PACK_IDS,
  type WorldInventory,
  type WorldJob,
  type WorldPackId,
} from '../../types/world_offline.js'

export const WORLD_OFFLINE_QUEUE = 'world-offline'
export const RUN_WORLD_OFFLINE = 'run-world-offline'
const reservationKey = 'active-map-operation'
const admissionCommand = 'worldOfflineAdmission'
const registeredClients = new WeakSet<object>()
const admissionScript = `
  if ARGV[1] == 'acquire' then
    return redis.call('SET', KEYS[1], ARGV[2], 'PX', 30000, 'NX')
  end
  if redis.call('GET', KEYS[1]) == ARGV[2] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`

type Command = {
  mode: 'download' | 'resume'
  packId: WorldPackId
  operationId: string
  totalBytes: number
  retryOf?: string
  cancelRequested?: boolean
  dispatchAttempted?: boolean
  resumeAccepted?: boolean
}
type Reservation = Job<Command, WorldJob>
type Worker = Pick<WorldOfflineService, 'connectedInventory' | 'inventory' | 'control'>
type ActiveWorldJob = WorldJob & { status: 'queued' | 'running' | 'paused' }

export function worldJobActive(job: WorldJob | null | undefined): job is ActiveWorldJob {
  return job?.status === 'queued' || job?.status === 'running' || job?.status === 'paused'
}

function retryable(job: WorldJob | null | undefined, id: string): job is WorldJob {
  return job?.id === id && (job.status === 'failed' || job.status === 'cancelled')
}

function conflict() {
  return new WorldOfflineError(409, 'Finish or cancel the active world map operation first.')
}

function operationId() {
  return randomBytes(16).toString('hex')
}

function pendingJob(job: Reservation): WorldJob {
  const { operationId: id, packId, totalBytes, cancelRequested } = job.data
  return {
    id,
    packIds: [packId],
    status: 'queued',
    stage: 'queued',
    bytesDownloaded: 0,
    totalBytes,
    speedBytesPerSecond: 0,
    completedMonths: 0,
    ...(cancelRequested ? { cancelRequested: true } : {}),
    message: cancelRequested ? 'Cancelling. Downloaded data will be kept for retry.' : 'Waiting to start.',
  }
}

export class WorldOfflineQueue {
  constructor(
    private service: Worker = new WorldOfflineService(),
    private queueService: Pick<QueueService, 'getQueue'> = QueueService.getInstance()
  ) {}

  private get queue(): Queue<Command, WorldJob> {
    return this.queueService.getQueue(WORLD_OFFLINE_QUEUE)
  }

  // Serialize the admission check with synchronous controls and the first
  // worker dispatch. BullMQ's deduplication key outlives this short lock.
  private async withAdmission<T>(action: () => Promise<T>): Promise<T> {
    const client = await this.queue.client
    const key = this.queue.toKey('map-operation-admission')
    const token = operationId()
    const deadline = Date.now() + 3_000
    if (!registeredClients.has(client)) {
      client.defineCommand(admissionCommand, { numberOfKeys: 1, lua: admissionScript })
      registeredClients.add(client)
    }
    while ((await client.runCommand(admissionCommand, [key, 'acquire', token])) !== 'OK') {
      if (Date.now() >= deadline) {
        throw new WorldOfflineError(503, 'Another map control is being processed. Try again shortly.')
      }
      await sleep(50)
    }
    try {
      return await action()
    } finally {
      await client.runCommand(admissionCommand, [key, 'release', token]).catch(() => undefined)
    }
  }

  private async reservation() {
    const id = await this.queue.getDeduplicationJobId(reservationKey)
    return id ? this.queue.getJob(id) : undefined
  }

  private async failedJob() {
    const last = (await this.queue.getJobs(['failed'], 0, 0, false))[0]
    if (!last) return
    const job = pendingJob(last)
    return { ...job, status: 'failed', stage: 'failed', message: last.failedReason } satisfies WorldJob
  }

  private async admit(data: Command) {
    const added = await this.queue.add(RUN_WORLD_OFFLINE, data, {
      jobId: data.mode === 'download' ? data.operationId : operationId(),
      deduplication: { id: reservationKey },
      attempts: 5,
      backoff: { type: 'fixed', delay: 5_000 },
      removeOnComplete: { count: 16 },
      removeOnFail: { count: 16 },
    })
    // A deduplicated add can return the existing id with the new request's
    // in-memory data. Resolve the stored reservation before acknowledging it.
    const job = added.id ? await this.queue.getJob(added.id) : undefined
    if (!job || job.data.mode !== data.mode || job.data.packId !== data.packId ||
        (data.mode === 'resume' && job.data.operationId !== data.operationId) ||
        job.data.retryOf !== data.retryOf) throw conflict()
    return { job: pendingJob(job) }
  }

  async inventory(): Promise<WorldInventory> {
    const inventory = await this.service.inventory()
    const stored = await this.reservation().catch(() => undefined)
    if (stored) {
      const worker = inventory.job
      if (!worker || (!worldJobActive(worker) && worker.id !== stored.data.operationId)) {
        return { ...inventory, job: pendingJob(stored), canPause: false }
      }
    }
    if (!inventory.job) {
      return { ...inventory, job: (await this.failedJob().catch(() => undefined)) ?? null }
    }
    return inventory
  }

  async download(packId: WorldPackId) {
    return this.withAdmission(async () => {
      const reserved = await this.reservation()
      if (reserved) {
        if (reserved.data.packId !== packId || reserved.data.cancelRequested) throw conflict()
        const { job } = await this.service.inventory()
        return { job: job?.id === reserved.data.operationId ? job : pendingJob(reserved) }
      }
      const { packs, job } = await this.service.connectedInventory()
      if (worldJobActive(job)) {
        if (job.packIds.length === 1 && job.packIds[0] === packId && !job.cancelRequested) return { job }
        throw conflict()
      }
      const pack = packs.find((entry) => entry.id === packId && !entry.legacy)
      if (!pack) throw new WorldOfflineError(404, 'Choose an available world map package.')
      if (pack.installed) return { job: null, skipped: true }
      return this.admit({
        mode: 'download', packId, operationId: operationId(),
        totalBytes: pack.additionalDownloadBytes ?? pack.downloadBytes,
      })
    })
  }

  async retry(id: string) {
    return this.withAdmission(async () => {
      const reserved = await this.reservation()
      if (reserved) {
        if (reserved.data.retryOf === id && !reserved.data.cancelRequested) return { job: pendingJob(reserved) }
        throw conflict()
      }
      const { packs, job } = await this.service.connectedInventory()
      const previous = job ?? await this.failedJob()
      const selected = previous?.packIds[0] as WorldPackId | undefined
      const pack = packs.find((entry) => entry.id === selected && !entry.legacy)
      if (!retryable(previous, id) || previous.packIds.length !== 1 ||
          !selected || !WORLD_PACK_IDS.includes(selected) || !pack) {
        throw new WorldOfflineError(409, 'Choose a failed or cancelled world map operation.')
      }
      // A second attempt uses a new durable request ID. Replay of this native
      // job will return the same worker operation rather than starting again.
      if (pack.installed) return { job: null, skipped: true }
      return this.admit({
        mode: 'download', packId: selected, operationId: operationId(), retryOf: id,
        totalBytes: pack.additionalDownloadBytes ?? pack.downloadBytes,
      })
    })
  }

  async resume(id: string) {
    return this.withAdmission(async () => {
      const reserved = await this.reservation()
      if (reserved && (reserved.data.operationId !== id || reserved.data.cancelRequested)) throw conflict()
      const { job } = await this.service.connectedInventory()
      if (reserved && job?.id === id && (job.status === 'queued' || job.status === 'running')) return { job }
      const packId = job?.packIds[0] as WorldPackId | undefined
      if (job?.id !== id || job.status !== 'paused' ||
          !packId || job.packIds.length !== 1 || !WORLD_PACK_IDS.includes(packId)) {
        throw new WorldOfflineError(409, 'Choose a paused world map operation.')
      }
      if (reserved) {
        const response = await this.service.control('resume', { id })
        if (reserved.data.mode === 'resume' && !reserved.data.resumeAccepted) {
          await reserved.updateData({ ...reserved.data, resumeAccepted: true })
        }
        return response
      }
      // This paused operation predates its native reservation. Adopt its
      // existing worker ID so a restarted native worker follows it as well.
      return this.admit({ mode: 'resume', packId, operationId: id, totalBytes: job.totalBytes })
    })
  }

  async pause(id: string) {
    return this.withAdmission(async () => {
      const reserved = await this.reservation()
      if (reserved && (reserved.data.operationId !== id || reserved.data.cancelRequested)) throw conflict()
      const response = await this.service.control('pause', { id })
      if (reserved?.data.mode === 'resume' && !reserved.data.resumeAccepted) {
        await reserved.updateData({ ...reserved.data, resumeAccepted: true })
      }
      return response
    })
  }

  async cancel(id: string) {
    return this.withAdmission(async () => {
      const reserved = await this.reservation()
      if (!reserved) return this.service.control('cancel', { id })
      if (reserved.data.operationId !== id) throw conflict()
      // Persist intent before contacting the worker. The processor checks it
      // under the same lock, even if this HTTP response or the worker is lost.
      await reserved.updateData({ ...reserved.data, cancelRequested: true })
      const { job } = await this.service.inventory()
      if (job?.id === id) {
        if (!worldJobActive(job) || job.cancelRequested) return { job }
        return this.service.control('cancel', { id }).catch((error: unknown) => {
          if (!(error instanceof WorldOfflineError) || error.status !== 503) throw error
          return { job: { ...job, cancelRequested: true } }
        })
      }
      return { job: pendingJob(reserved) }
    })
  }

  private async checkIdle() {
    if (await this.reservation()) throw conflict()
    if (worldJobActive((await this.service.connectedInventory()).job)) throw conflict()
  }

  async assertIdle() {
    await this.withAdmission(() => this.checkIdle())
  }

  async remove(packId: WorldPackId) {
    return this.withAdmission(async () => {
      await this.checkIdle()
      return this.service.control('remove', { packId })
    })
  }

  async discard(id: string) {
    return this.withAdmission(async () => {
      await this.checkIdle()
      return this.service.control('discard', { id })
    })
  }

  async current(jobId: string): Promise<WorldJob> {
    const job = await this.queue.getJob(jobId)
    if (!job) throw new WorldOfflineError(409, 'The world map reservation no longer exists.')
    if (!job.data.cancelRequested) {
      const live = (await this.service.connectedInventory()).job
      if (live?.id === job.data.operationId && (job.data.mode === 'download' || job.data.resumeAccepted)) {
        return live
      }
    }
    return this.withAdmission(async () => {
      const stored = await this.queue.getJob(jobId)
      if (!stored) throw new WorldOfflineError(409, 'The world map reservation no longer exists.')
      const data = stored.data
      if (data.cancelRequested && data.mode === 'download' && !data.dispatchAttempted) {
        return { ...pendingJob(stored), status: 'cancelled', stage: 'cancelled', message: 'Download cancelled.' }
      }
      const { job: worker } = await this.service.connectedInventory()
      const matching = worker?.id === data.operationId ? worker : null
      if (data.cancelRequested) {
        if (!matching) {
          return { ...pendingJob(stored), status: 'cancelled', stage: 'cancelled', message: 'Download cancelled.' }
        }
        if (!worldJobActive(matching) || matching.cancelRequested) return matching
        return this.responseJob(await this.service.control('cancel', { id: data.operationId }), data.operationId)
      }
      if (data.mode === 'resume') {
        if (!matching) throw new WorldOfflineError(409, 'The paused world map operation is no longer available.')
        if (data.resumeAccepted) return matching
        const result = matching.status === 'paused'
          ? this.responseJob(await this.service.control('resume', { id: data.operationId }), data.operationId)
          : matching
        await stored.updateData({ ...data, resumeAccepted: true })
        return result
      }
      if (matching) return matching
      if (!data.dispatchAttempted) await stored.updateData({ ...data, dispatchAttempted: true })
      return this.responseJob(await this.service.control('download', {
        packIds: [data.packId], requestId: data.operationId,
      }), data.operationId)
    })
  }

  private responseJob(response: { job?: WorldJob | null }, id: string) {
    if (response.job?.id !== id) throw new WorldOfflineError(503, 'The map worker has not acknowledged this operation.')
    return response.job
  }
}
