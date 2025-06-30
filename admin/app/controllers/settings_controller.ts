import { SystemService } from '#services/system_service';
import { inject } from '@adonisjs/core';
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class SettingsController {
    constructor(
        private systemService: SystemService,
    ) { }

    async system({ inertia }: HttpContext) {
        // const services = await this.systemService.getServices();
        return inertia.render('settings/system', {
            // system: {
            //     services
            // }
        });
    }

    async apps({ inertia }: HttpContext) {
        const services = await this.systemService.getServices();
        return inertia.render('settings/apps', {
            system: {
                services
            }
        });
    }
}