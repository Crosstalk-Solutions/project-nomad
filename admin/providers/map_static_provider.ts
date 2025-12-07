import MapsStaticMiddleware from '#middleware/maps_static_middleware'
import logger from '@adonisjs/core/services/logger'
import type { ApplicationService } from '@adonisjs/core/types'
import { defineConfig } from '@adonisjs/static'
import { join } from 'path'

/**
 * This is a bit of a hack to serve static files from the
 * /storage/maps directory using AdonisJS static middleware because
 * the middleware does not allow us to define a custom path we want
 * to serve (it always serves from public/ by default).
 *
 * We use the same other config options, just change the path
 * (though we could also separate config if needed).
 */
export default class MapStaticProvider {
  constructor(protected app: ApplicationService) {}
  register() {
    this.app.container.singleton(MapsStaticMiddleware, () => {
      const path = join(process.cwd(), '/storage/maps')
      logger.debug(`Maps static files will be served from ${path}`)
      const config = this.app.config.get<any>('static', defineConfig({}))
      return new MapsStaticMiddleware(path, config)
    })
  }
}
