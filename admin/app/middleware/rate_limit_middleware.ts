import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * In-memory sliding window rate limiter.
 *
 * Tracks requests by IP + route pattern and enforces a configurable
 * maximum number of requests per time window. Returns 429 Too Many
 * Requests with standard rate-limit headers when the limit is exceeded.
 */

interface RateLimitEntry {
  timestamps: number[]
}

const store = new Map<string, RateLimitEntry>()

// Periodically clean up expired entries every 60 seconds
const CLEANUP_INTERVAL_MS = 60_000

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    // Remove entries whose newest timestamp is older than 5 minutes
    // (the longest practical window we'd configure)
    if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < now - 5 * 60_000) {
      store.delete(key)
    }
  }
}, CLEANUP_INTERVAL_MS).unref()

export default class RateLimitMiddleware {
  /**
   * @param limit  - Maximum number of requests allowed in the window
   * @param windowSeconds - Length of the sliding window in seconds
   */
  async handle(
    { request, response }: HttpContext,
    next: NextFn,
    options: { limit: number; window: number }
  ) {
    const limit = options.limit ?? 10
    const windowSeconds = options.window ?? 60
    const windowMs = windowSeconds * 1000
    const now = Date.now()

    const ip = request.ip()
    const routePattern = request.ctx?.route?.pattern ?? request.url()
    const key = `${ip}:${routePattern}`

    let entry = store.get(key)
    if (!entry) {
      entry = { timestamps: [] }
      store.set(key, entry)
    }

    // Slide the window: remove timestamps outside the current window
    const windowStart = now - windowMs
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart)

    if (entry.timestamps.length >= limit) {
      const oldestInWindow = entry.timestamps[0]
      const retryAfterMs = oldestInWindow + windowMs - now
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000)

      response.header('Retry-After', String(retryAfterSeconds))
      response.header('X-RateLimit-Limit', String(limit))
      response.header('X-RateLimit-Remaining', '0')
      response.header('X-RateLimit-Reset', String(Math.ceil((oldestInWindow + windowMs) / 1000)))

      return response.status(429).send({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
      })
    }

    // Record this request
    entry.timestamps.push(now)

    // Set informational rate-limit headers on successful requests
    response.header('X-RateLimit-Limit', String(limit))
    response.header('X-RateLimit-Remaining', String(limit - entry.timestamps.length))

    return next()
  }
}
