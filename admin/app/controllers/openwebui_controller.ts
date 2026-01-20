import { OpenWebUIService } from '#services/openwebui_service'
import { modelNameSchema } from '#validators/download'
import { getAvailableModelsSchema } from '#validators/openwebui'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class OpenWebUIController {
  constructor(private openWebUIService: OpenWebUIService) {}

  async models({ request }: HttpContext) {
    const reqData = await request.validateUsing(getAvailableModelsSchema)
    return await this.openWebUIService.getAvailableModels({
      sort: reqData.sort,
      recommendedOnly: reqData.recommendedOnly,
    })
  }

  async installedModels({}: HttpContext) {
    return await this.openWebUIService.getInstalledModels()
  }

  async deleteModel({ request }: HttpContext) {
    const reqData = await request.validateUsing(modelNameSchema)
    await this.openWebUIService.deleteModel(reqData.model)
    return {
      success: true,
      message: `Model deleted: ${reqData.model}`,
    }
  }

  async dispatchModelDownload({ request }: HttpContext) {
    const reqData = await request.validateUsing(modelNameSchema)
    await this.openWebUIService.dispatchModelDownload(reqData.model)
    return {
      success: true,
      message: `Download job dispatched for model: ${reqData.model}`,
    }
  }
}
