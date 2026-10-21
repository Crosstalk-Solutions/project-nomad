import { CollectionUpdateService } from '#services/collection_update_service'
import {
  assertNotPrivateUrl,
  applyContentUpdateValidator,
  applyAllContentUpdatesValidator,
} from '#validators/common'
import type { HttpContext } from '@adonisjs/core/http'

export default class CollectionUpdatesController {
  /**
   * Verifica se há atualizações disponíveis para as coleções.
   */
  async checkForUpdates({}: HttpContext) {
    const service = new CollectionUpdateService()
    return await service.checkForUpdates()
  }

  /**
   * Aplica uma atualização de conteúdo.
   */
  async applyUpdate({ request }: HttpContext) {
    const update = await request.validateUsing(applyContentUpdateValidator)
    assertNotPrivateUrl(update.download_url)

    const service = new CollectionUpdateService()
    return await service.applyUpdate(update)
  }

  /**
   * Aplica todas as atualizações de conteúdo informadas.
   */
  async applyAllUpdates({ request }: HttpContext) {
    const { updates } = await request.validateUsing(applyAllContentUpdatesValidator)

    for (const update of updates) {
      assertNotPrivateUrl(update.download_url)
    }

    const service = new CollectionUpdateService()
    return await service.applyAllUpdates(updates)
  }
}
```
