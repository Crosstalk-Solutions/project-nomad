import { ZimService } from '#services/zim_service'
import {
  downloadCollectionValidator,
  filenameParamValidator,
  remoteDownloadValidator,
  saveInstalledTierValidator,
  selectWikipediaValidator,
} from '#validators/common'
import { listRemoteZimValidator } from '#validators/zim'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class ZimController {
  constructor(private zimService: ZimService) {}

  async list({}: HttpContext) {
    return await this.zimService.list()
  }

  async listRemote({ request }: HttpContext) {
    const payload = await request.validateUsing(listRemoteZimValidator)
    const { start = 0, count = 12, query } = payload
    return await this.zimService.listRemote({ start, count, query })
  }

  async downloadRemote({ request }: HttpContext) {
    const payload = await request.validateUsing(remoteDownloadValidator)
    const { filename, jobId } = await this.zimService.downloadRemote(payload.url)

    return {
      message: 'Download started successfully',
      filename,
      jobId,
      url: payload.url,
    }
  }

  async downloadCollection({ request }: HttpContext) {
    const payload = await request.validateUsing(downloadCollectionValidator)
    const resources = await this.zimService.downloadCollection(payload.slug)

    return {
      message: 'Download started successfully',
      slug: payload.slug,
      resources,
    }
  }

  async listCuratedCollections({}: HttpContext) {
    return this.zimService.listCuratedCollections()
  }

  async fetchLatestCollections({}: HttpContext) {
    const success = await this.zimService.fetchLatestCollections()
    return { success }
  }

  async saveInstalledTier({ request }: HttpContext) {
    const payload = await request.validateUsing(saveInstalledTierValidator)
    await this.zimService.saveInstalledTier(payload.categorySlug, payload.tierSlug)
    return { success: true }
  }

  async delete({ request, response }: HttpContext) {
    const payload = await request.validateUsing(filenameParamValidator)

    try {
      await this.zimService.delete(payload.params.filename)
    } catch (error) {
      if (error.message === 'not_found') {
        return response.status(404).send({
          message: `ZIM file with key ${payload.params.filename} not found`,
        })
      }
      throw error // Re-throw any other errors and let the global error handler catch
    }

    return {
      message: 'ZIM file deleted successfully',
    }
  }

  // Wikipedia selector endpoints

  async getWikipediaState({}: HttpContext) {
    return this.zimService.getWikipediaState()
  }

  async selectWikipedia({ request }: HttpContext) {
    const payload = await request.validateUsing(selectWikipediaValidator)
    return this.zimService.selectWikipedia(payload.optionId)
  }
}
