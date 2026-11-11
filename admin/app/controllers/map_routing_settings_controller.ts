import type { HttpContext } from '@adonisjs/core/http'
import { MapRoutingSettingsService } from '#services/map_routing_settings_service'
import { OfflineRouteService } from '#services/offline_route_service'
import { OfflineRouteError } from '../utils/offline_route.js'

export default class MapRoutingSettingsController {
  async index({ response }: HttpContext) {
    try {
      const { regions } = await new OfflineRouteService().inventory()
      return await new MapRoutingSettingsService().state(regions)
    } catch (error) {
      if (error instanceof OfflineRouteError)
        return response.status(error.status).send({ message: error.message })
      throw error
    }
  }
  async update({ request, response }: HttpContext) {
    try {
      const { regions } = await new OfflineRouteService().inventory()
      return await new MapRoutingSettingsService().save(request.body(), regions)
    } catch (error) {
      if (error instanceof OfflineRouteError)
        return response.status(error.status).send({ message: error.message })
      throw error
    }
  }
}
