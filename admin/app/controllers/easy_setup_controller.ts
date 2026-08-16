import { DockerService } from '#services/docker_service'
import { SystemService } from '#services/system_service'
import { ZimService } from '#services/zim_service'
import { CollectionManifestService } from '#services/collection_manifest_service'
import KVStore from '#models/kv_store'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class EasySetupController {
  constructor(
    private systemService: SystemService,
    private zimService: ZimService,
    private dockerService: DockerService
  ) {}

  async index({ inertia }: HttpContext) {
    const [services, remoteOllamaUrl, localImageTags] = await Promise.all([
      this.systemService.getServices({ installedOnly: false }),
      KVStore.getValue('ai.remoteOllamaUrl'),
      this.dockerService.listLocalImageTags(),
    ])

    // Apps whose image is already in the local Docker daemon install without
    // touching a registry (createContainerPreflight skips the pull when the
    // image is present). An offline artifact bundle built with --with-apps
    // loads exactly these, so this is what makes the wizard's offline mode
    // honest: it can say which capabilities are genuinely installable now
    // instead of pulling and failing halfway.
    const localImages = new Set(localImageTags)
    const locallyAvailableServices = services
      .filter((service) => !!service.container_image && localImages.has(service.container_image))
      .map((service) => service.service_name)

    return inertia.render('easy-setup/index', {
      system: {
        services: services,
        remoteOllamaUrl: remoteOllamaUrl ?? '',
        locallyAvailableServices,
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
