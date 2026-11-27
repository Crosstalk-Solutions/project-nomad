import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { isIP } from 'node:net'
import env from '#start/env'
import { WorldOfflineQueue } from '#services/world_offline_queue'
import { WorldOfflineError, worldOfflineEnabled } from '#services/world_offline_service'
import {
  worldDownloadValidator,
  worldJobActionValidator,
  worldRemoveValidator,
} from '#validators/world_offline'
import type { WorldPackId } from '../../types/world_offline.js'

function isLocalPeer(address?: string) {
  const ip = address?.toLowerCase().replace(/^::ffff:/, '').split('%')[0] ?? ''
  if (ip === '::1') return true
  if (isIP(ip) === 6) return /^(?:f[cd]|fe[89ab])/.test(ip)
  if (isIP(ip) !== 4) return false
  const [first, second] = ip.split('.').map(Number)
  return first === 127 || first === 10 || (first === 192 && second === 168)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 169 && second === 254)
}

function validateMutation({ request }: HttpContext) {
  const origin = request.header('origin')
  const site = request.header('sec-fetch-site')
  const authority = request.header('host')
  let sameOrigin = !origin
  if (origin && (origin === `http://${authority}` || origin === `https://${authority}`)) {
    try {
      const browser = new URL(origin)
      const host = browser.hostname.replace(/^\[|\]$/g, '')
      sameOrigin = host === 'localhost' || isLocalPeer(host)
        || browser.origin === new URL(env.get('URL')).origin
    } catch {
      sameOrigin = false
    }
  }
  if (!isLocalPeer(request.request.socket.remoteAddress) || !sameOrigin
      || (site && site !== 'same-origin' && site !== 'none')) {
    throw new WorldOfflineError(403, 'Use the local NOMAD panel to manage offline maps.')
  }
  if (request.header('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new WorldOfflineError(415, 'Map package operations require application/json.')
  }
}

@inject()
export default class WorldOfflineController {
  constructor(private queue: WorldOfflineQueue) {}

  private async respond(ctx: HttpContext, action: () => Promise<unknown>, status = 200, write = false) {
    try {
      if (!worldOfflineEnabled()) throw new WorldOfflineError(404, 'World offline is disabled.')
      if (write) validateMutation(ctx)
      return ctx.response.status(status).send(await action())
    } catch (error) {
      if (error instanceof WorldOfflineError) {
        return ctx.response.status(error.status).send({ message: error.message })
      }
      throw error
    }
  }

  index(ctx: HttpContext) {
    return this.respond(ctx, () => this.queue.inventory())
  }

  download(ctx: HttpContext) {
    return this.respond(ctx, async () => {
      const { packIds } = await ctx.request.validateUsing(worldDownloadValidator)
      return this.queue.download(packIds[0] as WorldPackId)
    }, 202, true)
  }

  remove(ctx: HttpContext) {
    return this.respond(ctx, async () => {
      const { packId } = await ctx.request.validateUsing(worldRemoveValidator)
      return this.queue.remove(packId as WorldPackId)
    }, 200, true)
  }

  private jobAction(ctx: HttpContext, action: 'cancel' | 'pause' | 'resume' | 'retry' | 'discard') {
    return this.respond(ctx, async () => {
      const { id } = await ctx.request.validateUsing(worldJobActionValidator)
      return this.queue[action](id)
    }, action === 'resume' || action === 'retry' ? 202 : 200, true)
  }

  cancel(ctx: HttpContext) { return this.jobAction(ctx, 'cancel') }
  pause(ctx: HttpContext) { return this.jobAction(ctx, 'pause') }
  resume(ctx: HttpContext) { return this.jobAction(ctx, 'resume') }
  retry(ctx: HttpContext) { return this.jobAction(ctx, 'retry') }
  discard(ctx: HttpContext) { return this.jobAction(ctx, 'discard') }
}
