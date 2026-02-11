import { SystemService } from '#services/system_service'
import { ZimService } from '#services/zim_service'
import { CollectionManifestService } from '#services/collection_manifest_service'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class EasySetupController {
  constructor(
    private systemService: SystemService,
    private zimService: ZimService
  ) {}

  async index({ inertia }: HttpContext) {
    const services = await this.systemService.getServices({ installedOnly: false })
    return inertia.render('easy-setup/index', {
      system: {
        services: services,
      },
    })
  }

  async complete({ inertia }: HttpContext) {
    return inertia.render('easy-setup/complete')
  }

  async listCuratedCategories({}: HttpContext) {
    return await this.zimService.listCuratedCategories()
  }

  async refreshManifests({}: HttpContext) {
    const manifestService = new CollectionManifestService()
    const [zimChanged, mapsChanged, wikiChanged] = await Promise.all([
      manifestService.fetchAndCacheSpec('zim_categories'),
      manifestService.fetchAndCacheSpec('maps'),
      manifestService.fetchAndCacheSpec('wikipedia'),
    ])

    return {
      success: true,
      changed: {
        zim_categories: zimChanged,
        maps: mapsChanged,
        wikipedia: wikiChanged,
      },
    }
  }
}
