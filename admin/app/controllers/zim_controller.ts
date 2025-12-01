import { ZimService } from '#services/zim_service'
import { filenameValidator, remoteDownloadValidator } from '#validators/common'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class ZimController {
  constructor(private zimService: ZimService) {}

  async list({}: HttpContext) {
    return await this.zimService.list()
  }

  async listRemote({ request }: HttpContext) {
    const { start = 0, count = 12 } = request.qs()
    return await this.zimService.listRemote({ start, count })
  }

  async downloadRemote({ request }: HttpContext) {
    const payload = await request.validateUsing(remoteDownloadValidator)
    const filename = await this.zimService.downloadRemote(payload.url)

    return {
      message: 'Download started successfully',
      filename,
      url: payload.url,
    }
  }

  async delete({ request, response }: HttpContext) {
    const payload = await request.validateUsing(filenameValidator)

    try {
      await this.zimService.delete(payload.filename)
    } catch (error) {
      if (error.message === 'not_found') {
        return response.status(404).send({
          message: `ZIM file with key ${payload.filename} not found`,
        })
      }
      throw error // Re-throw any other errors and let the global error handler catch
    }

    return {
      message: 'ZIM file deleted successfully',
    }
  }
}
