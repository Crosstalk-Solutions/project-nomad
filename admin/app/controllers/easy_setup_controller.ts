import { SystemService } from '#services/system_service'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class EasySetupController {
  constructor(private systemService: SystemService) {}

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
}
