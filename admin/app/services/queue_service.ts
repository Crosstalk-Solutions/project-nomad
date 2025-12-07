import { Queue } from 'bullmq'
import queueConfig from '#config/queue'

export class QueueService {
  private queues: Map<string, Queue> = new Map()

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
  }
}
