import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

// origin: ['*'] in config/cors.ts never matches a real Origin header
// (@adonisjs/cors only wildcards on the bare string origin: '*'), and a
// global fix would also expose the write API since credentials: true is
// set. Scope anonymous, read-only CORS to the map asset paths instead.

const MAP_ASSET_PREFIXES = ['/api/maps/', '/pmtiles/', '/basemaps-assets/', '/storage/maps/']

export function isMapAssetPath(pathname: string): boolean {
  return MAP_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export default class MapsCorsMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    if (!isMapAssetPath(request.url())) return next()

    // safeHeader so this stays inert if the global CORS config is ever fixed.
    response.safeHeader('Access-Control-Allow-Origin', '*')
    response.header('Access-Control-Expose-Headers', 'ETag, Content-Range, Accept-Ranges, Content-Length')
    response.header('Vary', 'Origin')

    if (request.method() === 'OPTIONS') {
      // serve-static only handles GET/HEAD, so OPTIONS would otherwise 404.
      response.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      response.header('Access-Control-Allow-Headers', 'Range, If-None-Match, If-Match')
      response.header('Access-Control-Max-Age', '600')
      return response.status(204)
    }

    return next()
  }
}
