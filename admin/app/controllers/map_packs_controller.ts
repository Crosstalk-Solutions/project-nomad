import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { MapPackService } from '#services/map_pack_service'
import { InstallMapPackJob } from '#jobs/install_map_pack_job'
import { MapPackError, mapPackId } from '../utils/map_pack_manifest.js'

@inject()
export default class MapPacksController {
  constructor(private mapPackService: MapPackService) {}

  private failure(response: HttpContext['response'], error: unknown) {
    if (error instanceof MapPackError) {
      return response.status(error.status).send({ success: false, message: error.message })
    }
    throw error
  }

  async index({ response }: HttpContext) {
    try {
      return await this.mapPackService.getState()
    } catch (error) {
      return this.failure(response, error)
    }
  }

  async install({ request, response }: HttpContext) {
    try {
      if (!MapPackService.downloadsConfigured())
        throw new MapPackError('The optional map pack catalog is not configured.', 503)
      const packageId = mapPackId(request.input('packageId'))
      const manifest = await this.mapPackService.catalogPackage(packageId)
      await this.mapPackService.queueInstall(manifest, () =>
        InstallMapPackJob.dispatch(packageId, manifest.version)
      )
      return response
        .status(202)
        .send({ success: true, message: 'Package download queued', packageId })
    } catch (error) {
      return this.failure(response, error)
    }
  }

  async activate({ request, response }: HttpContext) {
    try {
      const manifest = await this.mapPackService.activate(request.input('packageId'))
      return { success: true, packageId: manifest.id, ...(await this.mapPackService.getState()) }
    } catch (error) {
      return this.failure(response, error)
    }
  }

  async uninstall({ params, request, response }: HttpContext) {
    try {
      const packageId = mapPackId(params.packageId ?? request.input('packageId'))
      await this.mapPackService.uninstall(packageId, () =>
        InstallMapPackJob.removePending(packageId)
      )
      return { success: true }
    } catch (error) {
      return this.failure(response, error)
    }
  }

  async deactivate({ response }: HttpContext) {
    try {
      await this.mapPackService.deactivate()
      return { success: true, ...(await this.mapPackService.getState()) }
    } catch (error) {
      return this.failure(response, error)
    }
  }
}
