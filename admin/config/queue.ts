import env from '#start/env'
import { Redis } from 'ioredis'

// BullMQ treats a plain `{host, port}` connection object as a recipe: every
// Queue / Worker instantiates its own ioredis client from it, and script
// commands executed against those clients can spawn further short-lived
// connections. Under sustained ZIM ingestion this leaked ~1 client/sec until
// Redis maxclients was exhausted (#885). Passing a single shared ioredis
// instance instead gives BullMQ a pool to reuse — Workers still duplicate it
// once for their blocking client, which is expected and bounded.
// `maxRetriesPerRequest: null` is mandatory for connections shared with BullMQ.
const sharedConnection = new Redis({
  host: env.get('REDIS_HOST'),
  port: env.get('REDIS_PORT') ?? 6379,
  db: env.get('REDIS_DB') ?? 0,
  maxRetriesPerRequest: null,
})

const queueConfig = {
  connection: sharedConnection,
}

export default queueConfig
