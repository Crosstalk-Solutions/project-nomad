import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { isIP } from 'node:net'
import { LocalDetailService, LocalDetailError, localDetailEnabled } from '#services/local_detail_service'
import { isLocalDetailCoordinate } from '../../types/local_detail.js'
import env from '#start/env'

function localPeer(value?: string) {
  const ip = value?.toLowerCase().replace(/^::ffff:/, '').split('%')[0] ?? ''
  if (ip === '::1') return true
  if (isIP(ip) === 6) return /^(?:f[cd]|fe[89ab])/.test(ip)
  if (isIP(ip) !== 4) return false
  const [a, b] = ip.split('.').map(Number)
  return a === 127 || a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31
}

@inject()
export default class LocalDetailController {
  constructor(private detail: LocalDetailService) {}

  private async respond(ctx: HttpContext, action?: 'calculate' | 'download' | 'queue' | 'cancel' | 'retry' | 'delete' | 'recalculate' | 'cleanup') {
    try {
      if (!localDetailEnabled()) throw new LocalDetailError(404, 'Regional offline maps are disabled.')
      if (!action) return ctx.response.header('Cache-Control', 'no-store').send(await this.detail.inventory())
      const origin = ctx.request.header('origin'), site = ctx.request.header('sec-fetch-site'), host = ctx.request.header('host')
      let approvedOrigin = !origin
      if (origin && (origin === `http://${host}` || origin === `https://${host}`)) {
        try {
          const browser = new URL(origin), hostname = browser.hostname.replace(/^\[|\]$/g, '')
          approvedOrigin = hostname === 'localhost' || localPeer(hostname) || browser.origin === new URL(env.get('URL')).origin
        } catch { approvedOrigin = false }
      }
      if (!localPeer(ctx.request.request.socket.remoteAddress)
          || !approvedOrigin
          || site && site !== 'same-origin' && site !== 'none') {
        throw new LocalDetailError(403, 'Use the local NOMAD panel to manage regional maps.')
      }
      if (ctx.request.header('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        throw new LocalDetailError(415, 'Regional map operations require application/json.')
      }
      const payload = ctx.request.body()
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new LocalDetailError(422, 'Send a JSON map selection object.')
      if (action === 'calculate' || action === 'download' || action === 'delete') {
        if (!Array.isArray(payload.cells) || !payload.cells.length || payload.cells.length > 64
            || !payload.cells.every(isLocalDetailCoordinate)) throw new LocalDetailError(422, 'Select valid squares from the map (up to 64 per request).')
        payload.cells = payload.cells.map(({ x, y }: { x: number; y: number }) => ({ x, y }))
        if (action === 'download' && (typeof payload.quoteId !== 'string' || payload.quoteId.length > 128)) {
          throw new LocalDetailError(422, 'Calculate the selected squares before downloading.')
        }
      } else if (action === 'queue') {
        if (!Array.isArray(payload.batches) || !payload.batches.length || payload.batches.length > 1024
            || !payload.batches.every((batch: {quoteId?: unknown; excludedCells?: unknown}) => batch
              && typeof batch.quoteId === 'string' && /^[a-f0-9]{32}$/.test(batch.quoteId)
              && (batch.excludedCells === undefined || Array.isArray(batch.excludedCells) && batch.excludedCells.length <= 64
                && batch.excludedCells.every((id: unknown) => typeof id === 'string' && /^8\/\d{1,3}\/\d{1,3}$/.test(id))))) {
          throw new LocalDetailError(422, 'Send the reviewed estimate batches for the regional grid.')
        }
        if (payload.requestId !== undefined && (typeof payload.requestId !== 'string' || !payload.requestId.length || payload.requestId.length > 128)) {
          throw new LocalDetailError(422, 'Use a request identifier of at most 128 characters.')
        }
        payload.batches = payload.batches.map((batch: {quoteId: string; excludedCells?: string[]}) => ({ quoteId: batch.quoteId, excludedCells: batch.excludedCells ?? [] }))
      } else if (action === 'cleanup') {
        if (!['saved-preparation', 'expired-metadata'].includes(payload.scope)
          || payload.scope === 'saved-preparation' && (typeof payload.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(payload.id))) {
          throw new LocalDetailError(422, 'Review a documented cleanup scope before discarding temporary data.')
        }
      } else if (typeof payload.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(payload.id)) {
        throw new LocalDetailError(422, 'A valid task identifier is required.')
      }
      return ctx.response.status(['download', 'queue', 'retry'].includes(action) ? 202 : 200).send(await this.detail.control(action, payload))
    } catch (error) {
      if (error instanceof LocalDetailError) return ctx.response.status(error.status).send({ message: error.message })
      throw error
    }
  }
  index(ctx: HttpContext) { return this.respond(ctx) }
  calculate(ctx: HttpContext) { return this.respond(ctx, 'calculate') }
  download(ctx: HttpContext) { return this.respond(ctx, 'download') }
  cancel(ctx: HttpContext) { return this.respond(ctx, 'cancel') }
  retry(ctx: HttpContext) { return this.respond(ctx, 'retry') }
  delete(ctx: HttpContext) { return this.respond(ctx, 'delete') }
  queue(ctx: HttpContext) { return this.respond(ctx, 'queue') }
  recalculate(ctx: HttpContext) { return this.respond(ctx, 'recalculate') }
  cleanup(ctx: HttpContext) { return this.respond(ctx, 'cleanup') }
}
