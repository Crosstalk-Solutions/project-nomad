import { Queue } from 'bullmq'
import queueConfig from '#config/queue'

// Process-wide singleton. Instantiating a fresh QueueService per dispatch /
// status lookup leaks connections, and under sustained job churn (e.g.
// multi-batch ZIM ingestion enqueueing a continuation every few seconds) it
// saturates Redis's maxclients within hours. All queues additionally reuse the
// single shared ioredis instance exported from #config/queue (#885).
export class QueueService {
  private queues: Map<string, Queue> = new Map()

  private static _instance: QueueService | null = null

  private constructor() {}

  static getInstance(): QueueService {
    if (!QueueService._instance) {
      QueueService._instance = new QueueService()
    }
    return QueueService._instance
  }

  getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      const queue = new Queue(name, {
        connection: queueConfig.connection,
      })
      this.queues.set(name, queue)
    }
    return this.queues.get(name)!
  }

  async close() {
    for (const queue of this.queues.values()) {
      await queue.close()
    }
    this.queues.clear()
  }
}
