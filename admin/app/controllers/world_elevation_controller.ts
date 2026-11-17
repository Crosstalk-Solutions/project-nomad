import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { lookupElevationContours } from '#services/world_elevation_contours'
import { lookupElevationProfile } from '#services/world_elevation_profile'
import { lookupElevation } from '#services/world_elevation_service'
import { WorldOfflineService } from '#services/world_offline_service'
import {
  validateWorldElevationContoursQuery, validateWorldElevationProfileQuery, validateWorldElevationQuery,
} from '#validators/world_offline'

@inject()
export default class WorldElevationController {
  constructor(private world: WorldOfflineService) {}

  async inspect({ request, response }: HttpContext) {
    const { lat, lng } = await validateWorldElevationQuery(request.qs())
    response.header('Cache-Control', 'no-store')
    try {
      const archives = await this.world.localElevationArchives()
      return await lookupElevation(archives, lat, lng)
    } catch (error) {
      logger.warn({ err: error }, 'The installed elevation data could not be read.')
      return response.status(503).send({ message: 'The installed elevation data could not be read.' })
    }
  }

  async profile({ request, response }: HttpContext) {
    const { latA, lngA, latB, lngB } = await validateWorldElevationProfileQuery(request.qs())
    response.header('Cache-Control', 'no-store')
    const abort = new AbortController()
    const cancel = () => abort.abort()
    response.response.once('close', cancel)
    try {
      const archives = await this.world.localElevationArchives()
      return await lookupElevationProfile(archives, { lat: latA, lng: lngA }, { lat: latB, lng: lngB }, abort.signal)
    } catch (error) {
      if (abort.signal.aborted) return
      logger.warn({ err: error }, 'The installed data could not be read for the elevation profile.')
      return response.status(503).send({ message: 'The installed data could not be read for the elevation profile.' })
    } finally {
      response.response.removeListener('close', cancel)
    }
  }

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
      return await lookupElevationContours(archives, viewport, abort.signal)
    } catch (error) {
      if (abort.signal.aborted) return
      logger.warn({ err: error }, 'The installed data could not be read for elevation contours.')
      return response.status(503).send({ message: 'The installed data could not be read for elevation contours.' })
    } finally {
      response.response.removeListener('close', cancel)
    }
  }
}
