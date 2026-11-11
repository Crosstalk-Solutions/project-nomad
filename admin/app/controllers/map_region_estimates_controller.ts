import type { HttpContext } from '@adonisjs/core/http'
import { MapRegionEstimateService } from '#services/map_region_estimate_service'
import { MapRegionError, mapRegionComponents } from '../utils/map_region_catalog.js'

export default class MapRegionEstimatesController {
  async show({ params, request, response }: HttpContext) {
    try {
      const raw = request.input('components', 'routing')
      // The HTTP query parser may expand comma-separated values into an array.
      const components = mapRegionComponents(
        Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : raw
      )
      const operation = request.input('operation', 'install')
      if (operation !== 'install' && operation !== 'update')
        throw new MapRegionError('Choose install or update')
      return await new MapRegionEstimateService().estimate(params.regionId, components, operation)
    } catch (error) {
      if (error instanceof MapRegionError)
        return response.status(error.status).send({ message: error.message })
      throw error
    }
  }
}
