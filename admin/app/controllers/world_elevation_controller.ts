import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { lookupElevationContours } from '#services/world_elevation_contours'
import { WorldOfflineService } from '#services/world_offline_service'
import { LocalDetailService } from '#services/local_detail_service'
import { validateWorldElevationContoursQuery } from '#validators/world_offline'

@inject()
export default class WorldElevationController {
  constructor(private world: WorldOfflineService) {}

  async contours({ request, response }: HttpContext) {
    const viewport = await validateWorldElevationContoursQuery(request.qs())
    if (viewport.south >= viewport.north || viewport.west === viewport.east) {
      return response.unprocessableEntity({ message: 'The elevation contour viewport is empty or inverted.' })
    }
    response.header('Cache-Control', 'no-store')
    const abort = new AbortController()
    const cancel = () => abort.abort()
    response.response.once('close', cancel)
    try {
      const archives = await this.world.localElevationArchives()
      const local = await new LocalDetailService().localElevationArchives().catch(() => [])
      // The renderer chooses one coherent native grid across all downloaded
      // neighbours. Incomplete regional coverage retains the world fallback.
      return await lookupElevationContours([...local, ...archives], viewport, abort.signal)
    } catch (error) {
      if (abort.signal.aborted) return
      logger.warn({ err: error }, 'The installed data could not be read for elevation contours.')
      return response.status(503).send({ message: 'The installed data could not be read for elevation contours.' })
    } finally {
      response.response.removeListener('close', cancel)
    }
  }
}
