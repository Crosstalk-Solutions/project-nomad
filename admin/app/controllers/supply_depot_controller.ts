import { SystemService } from '#services/system_service'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class SupplyDepotController {
  constructor(private systemService: SystemService) {}

  async index({ inertia }: HttpContext) {
    const services = await this.systemService.getServices({ installedOnly: false })
    return inertia.render('supply-depot', { system: { services } })
  }
}
