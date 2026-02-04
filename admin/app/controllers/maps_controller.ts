import { MapService } from '#services/map_service'
import {
  downloadCollectionValidator,
  filenameParamValidator,
  remoteDownloadValidator,
  remoteDownloadValidatorOptional,
} from '#validators/common'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class MapsController {
  constructor(private mapService: MapService) {}

  async index({ inertia }: HttpContext) {
    const baseAssetsCheck = await this.mapService.ensureBaseAssets()
    const regionFiles = await this.mapService.listRegions()
    return inertia.render('maps', {
      maps: {
        baseAssetsExist: baseAssetsCheck,
        regionFiles: regionFiles.files,
      },
    })
  }

  async downloadBaseAssets({ request }: HttpContext) {
    const payload = await request.validateUsing(remoteDownloadValidatorOptional)
    await this.mapService.downloadBaseAssets(payload.url)
    return { success: true }
  }

  async downloadRemote({ request }: HttpContext) {
    const payload = await request.validateUsing(remoteDownloadValidator)
    const filename = await this.mapService.downloadRemote(payload.url)
    return {
      message: 'Download started successfully',
      filename,
      url: payload.url,
    }
  }

  async downloadCollection({ request }: HttpContext) {
    const payload = await request.validateUsing(downloadCollectionValidator)
    const resources = await this.mapService.downloadCollection(payload.slug)
    return {
      message: 'Collection download started successfully',
      slug: payload.slug,
      resources,
    }
  }

  // For providing a "preflight" check in the UI before actually starting a background download
  async downloadRemotePreflight({ request }: HttpContext) {
    const payload = await request.validateUsing(remoteDownloadValidator)
    const info = await this.mapService.downloadRemotePreflight(payload.url)
    return info
  }

  async fetchLatestCollections({}: HttpContext) {
    const success = await this.mapService.fetchLatestCollections()
    return { success }
  }

  async listCuratedCollections({}: HttpContext) {
    return await this.mapService.listCuratedCollections()
  }

  async listRegions({}: HttpContext) {
    return await this.mapService.listRegions()
  }

  async styles({ request, response }: HttpContext) {
    // Automatically ensure base assets are present before generating styles
    const baseAssetsExist = await this.mapService.ensureBaseAssets()
    if (!baseAssetsExist) {
      return response.status(500).send({
        message:
          'Base map assets are missing and could not be downloaded. Please check your connection and try again.',
      })
    }

    const styles = await this.mapService.generateStylesJSON(request.host())
    return response.json(styles)
  }

  async delete({ request, response }: HttpContext) {
    const payload = await request.validateUsing(filenameParamValidator)

    try {
      await this.mapService.delete(payload.params.filename)
    } catch (error) {
      if (error.message === 'not_found') {
        return response.status(404).send({
          message: `Map file with key ${payload.params.filename} not found`,
        })
      }
      throw error // Re-throw any other errors and let the global error handler catch
    }

    return {
      message: 'Map file deleted successfully',
    }
  }
}
