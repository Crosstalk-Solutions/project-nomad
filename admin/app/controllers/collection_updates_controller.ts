import { CollectionUpdateService } from '#services/collection_update_service'
import type { HttpContext } from '@adonisjs/core/http'

export default class CollectionUpdatesController {
  async checkForUpdates({}: HttpContext) {
    const collectionUpdateService = new CollectionUpdateService()
    return await collectionUpdateService.checkForUpdates()
  }
}
