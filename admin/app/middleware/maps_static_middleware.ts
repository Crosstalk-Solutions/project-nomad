import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import StaticMiddleware from '@adonisjs/static/static_middleware'
import { AssetsConfig } from '@adonisjs/static/types'
import { dirname, basename } from 'node:path'
import { localDetailEnabled, localDetailRoot } from '#services/local_detail_service'

/**
 * See #providers/map_static_provider.ts for explanation
 * of why this middleware exists.
 */
export default class MapsStaticMiddleware {
  constructor(
    private path: string,
    private config: AssetsConfig
  ) {}

  async handle(ctx: HttpContext, next: NextFn) {
    if (ctx.request.url().startsWith('/local-detail/')) {
      const path = localDetailRoot()
      if (!localDetailEnabled() || basename(path) !== 'local-detail'
          || !/^\/local-detail\/pmtiles\/partial-z8-\d{1,3}-\d{1,3}-(?:satellite|topography|elevation|street)\.pmtiles$/.test(ctx.request.url())) {
        return ctx.response.notFound()
      }
      // A separate read-only mount avoids creating any directory inside the shared world mount.
      return new StaticMiddleware(dirname(path), this.config).handle(ctx, next)
    }
    const staticMiddleware = new StaticMiddleware(this.path, this.config)
    return staticMiddleware.handle(ctx, next)
  }
}
