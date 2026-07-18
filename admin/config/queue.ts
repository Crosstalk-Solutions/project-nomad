import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
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
  // Don't open the socket at module import time. Importing this file (during
  // `node ace migration:run`, `db:seed`, `queue:work`, or HTTP boot) otherwise
  // races Docker's network/DNS lifecycle: on a fresh `up` the `redis` name is
  // not yet resolvable (EAI_AGAIN), and on a recreate the embedded DNS briefly
  // serves the previous container's IP (ECONNREFUSED to the stale address).
  // Lazy-connecting defers the first dial until BullMQ actually needs Redis —
  // after the entrypoint has confirmed it is reachable — so each (re)connect
  // re-resolves the current IP instead of hammering a stale one.
  lazyConnect: true,
  // Bounded, backing-off retry so a transient outage doesn't busy-loop.
  retryStrategy: (times) => Math.min(times * 200, 2000),
})

// Without an `error` listener ioredis logs the raw "[ioredis] Unhandled error
// event" lines and, on some Node versions, an EventEmitter `error` with no
// listener can crash the process. Route them through the app logger instead.
sharedConnection.on('error', (err) => {
  logger.error({ err }, 'Shared Redis connection error')
})

const queueConfig = {
  connection: sharedConnection,
}

export default queueConfig
