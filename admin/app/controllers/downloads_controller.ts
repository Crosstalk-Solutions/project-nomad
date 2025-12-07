import type { HttpContext } from '@adonisjs/core/http'
import { DownloadService } from '#services/download_service'
import { downloadJobsByFiletypeSchema } from '#validators/download'
import { inject } from '@adonisjs/core'

@inject()
export default class DownloadsController {
  constructor(private downloadService: DownloadService) {}

  async index() {
    return this.downloadService.listDownloadJobs()
  }

  async filetype({ request }: HttpContext) {
    const payload = await request.validateUsing(downloadJobsByFiletypeSchema)
    return this.downloadService.listDownloadJobs(payload.params.filetype)
  }
}
