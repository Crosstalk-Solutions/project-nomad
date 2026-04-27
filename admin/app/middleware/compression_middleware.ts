import env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import compression from 'compression'
import type { IncomingMessage, ServerResponse } from 'node:http'

// Skip compression for Server-Sent Events. The compression library buffers
// response writes to determine encoding, which collapses per-token streaming
// into a single block delivered after generation completes (regression in
// v1.31.0-rc.2, reported in #781 by @toasterking).
const compress = env.get('DISABLE_COMPRESSION')
  ? null
  : compression({
      filter: (req: IncomingMessage, res: ServerResponse) => {
        const contentType = res.getHeader('Content-Type')
        if (typeof contentType === 'string' && contentType.includes('text/event-stream')) {
          return false
        }
        return compression.filter(req, res)
      },
    })

export default class CompressionMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    if (!compress) return await next()

    await new Promise<void>((resolve, reject) => {
      compress(request.request as any, response.response as any, (err?: any) => {
        if (err) reject(err)
        else resolve()
      })
    })

    await next()
  }
}
