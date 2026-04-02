import env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import compression from 'compression'

const compress = env.get('DISABLE_COMPRESSION') ? null : compression()

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
