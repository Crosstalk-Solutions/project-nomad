import { CollectionUpdateService } from '#services/collection_update_service'
import {
  applyContentUpdateValidator,
  applyAllContentUpdatesValidator,
} from '#validators/common'
import type { HttpContext } from '@adonisjs/core/http'

export default class CollectionUpdatesController {
  async checkForUpdates({}: HttpContext) {
    const service = new CollectionUpdateService()
    return await service.checkForUpdates()
  }

  async applyUpdate({ request }: HttpContext) {
    const update = await request.validateUsing(applyContentUpdateValidator)
    const service = new CollectionUpdateService()
    return await service.applyUpdate(update)
  }

  async applyAllUpdates({ request }: HttpContext) {
    const { updates } = await request.validateUsing(applyAllContentUpdatesValidator)
    const service = new CollectionUpdateService()
    return await service.applyAllUpdates(updates)
  }
}
