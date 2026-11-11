import type { HttpContext } from '@adonisjs/core/http'
import { OfflineRouteService } from '#services/offline_route_service'
import { OfflineRouteError } from '../utils/offline_route.js'

export default class OfflineRoutesController {
  async coverage() {
    return new OfflineRouteService().inventory()
  }
  async route({ request, response }: HttpContext) {
    try {
      return await new OfflineRouteService().route(request.body())
    } catch (error) {
      if (error instanceof OfflineRouteError)
        return response.status(error.status).send({
          message: error.message,
          code: error.code,
          ...(error.engineCode !== undefined ? { engineCode: error.engineCode } : {}),
          ...(error.distanceLimitMeters !== undefined
            ? { distanceLimitMeters: error.distanceLimitMeters }
            : {}),
        })
      throw error
    }
  }
}
