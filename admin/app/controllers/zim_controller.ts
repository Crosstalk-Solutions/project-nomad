import { ZimService } from '#services/zim_service'
import {
  assertNotPrivateUrl,
  downloadCategoryTierValidator,
  filenameParamValidator,
  remoteDownloadWithMetadataValidator,
  selectWikipediaValidator,
} from '#validators/common'
import { addCustomLibraryValidator, browseLibraryValidator, idParamValidator, listRemoteZimValidator } from '#validators/zim'
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
    const payload = await request.validateUsing(remoteDownloadWithMetadataValidator)
    assertNotPrivateUrl(payload.url)
    const { filename, jobId } = await this.zimService.downloadRemote(payload.url, payload.metadata)

    return {
      message: 'Download started successfully',
      filename,
      jobId,
      url: payload.url,
    }
  }

  async listCuratedCategories({}: HttpContext) {
    return await this.zimService.listCuratedCategories()
  }

  async downloadCategoryTier({ request }: HttpContext) {
    const payload = await request.validateUsing(downloadCategoryTierValidator)
    const resources = await this.zimService.downloadCategoryTier(
      payload.categorySlug,
      payload.tierSlug
    )

    return {
      message: 'Download started successfully',
      categorySlug: payload.categorySlug,
      tierSlug: payload.tierSlug,
      resources,
    }
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

  // Custom library endpoints

  async listCustomLibraries({}: HttpContext) {
    return this.zimService.listCustomLibraries()
  }

  async addCustomLibrary({ request, response }: HttpContext) {
    const payload = await request.validateUsing(addCustomLibraryValidator)
    assertNotPrivateUrl(payload.base_url)
    try {
      const source = await this.zimService.addCustomLibrary(payload.name, payload.base_url)
      return { message: 'Custom library added', library: source }
    } catch (error) {
      if (error.message === 'Maximum of 10 custom libraries allowed') {
        return response.status(400).send({ message: error.message })
      }
      throw error
    }
  }

  async removeCustomLibrary({ request, response }: HttpContext) {
    const payload = await request.validateUsing(idParamValidator)
    try {
      await this.zimService.removeCustomLibrary(payload.params.id)
      return { message: 'Custom library removed' }
    } catch (error) {
      if (error.message === 'Custom library not found') {
        return response.status(404).send({ message: error.message })
      }
      throw error
    }
  }

  async browseLibrary({ request, response }: HttpContext) {
    const payload = await request.validateUsing(browseLibraryValidator)
    try {
      return await this.zimService.browseLibraryUrl(payload.url)
    } catch (error) {
      if (error.message?.includes('loopback or link-local')) {
        return response.status(400).send({ message: error.message })
      }
      return response.status(502).send({
        message: 'Could not fetch directory listing from the provided URL',
      })
    }
  }
}
