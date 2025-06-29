import { SystemService } from '#services/system_service'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class HomeController {
    constructor(
        private systemService: SystemService,
    ) { }

    async index({ inertia }: HttpContext) {
        const services = await this.systemService.getServices();
        return inertia.render('home', {
            system: {
                services
            }
        })
    }
}