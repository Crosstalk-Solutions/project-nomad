import { setTimeout as sleep } from 'node:timers/promises'
import { UnrecoverableError, type Job } from 'bullmq'
import {
  RUN_WORLD_OFFLINE,
  WORLD_OFFLINE_QUEUE,
  WorldOfflineQueue,
  worldJobActive,
} from '#services/world_offline_queue'
import { WorldOfflineError } from '#services/world_offline_service'

export class RunWorldOfflineJob {
  static key = RUN_WORLD_OFFLINE
  static queue = WORLD_OFFLINE_QUEUE

  constructor(private queue: Pick<WorldOfflineQueue, 'current'> = new WorldOfflineQueue()) {}

  async handle(job: Pick<Job, 'id'>, signal?: AbortSignal) {
    if (!job.id) throw new UnrecoverableError('Missing world map reservation ID.')
    let unavailable = 0
    for (;;) {
      signal?.throwIfAborted()
      try {
        const current = await this.queue.current(job.id)
        if (!worldJobActive(current)) return current
        unavailable = 0
      } catch (error) {
        if (error instanceof WorldOfflineError && error.status < 500) {
          throw new UnrecoverableError(error.message)
        }
        if (++unavailable >= 8) throw error
      }
      await sleep(1_500, undefined, { signal })
    }
  }
}
