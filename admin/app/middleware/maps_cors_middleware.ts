import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

// origin: ['*'] in config/cors.ts never matches a real Origin header
// (@adonisjs/cors only wildcards on the bare string origin: '*'), and a
// global fix would also expose the write API since credentials: true is
// set. Scope anonymous, read-only CORS to map tiles/assets and the one
// JSON route another app actually reads, GET/HEAD/OPTIONS only.

const MAP_ASSET_EXACT_PATHS = ['/api/maps/styles']
const MAP_ASSET_PREFIXES = ['/pmtiles/', '/basemaps-assets/', '/storage/maps/']
const READABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function isMapAssetPath(pathname: string): boolean {
  return MAP_ASSET_EXACT_PATHS.includes(pathname) || MAP_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function isReadableMethod(method: string): boolean {
  return READABLE_METHODS.has(method)
}

export default class MapsCorsMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    if (!isMapAssetPath(request.url()) || !isReadableMethod(request.method())) return next()

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
