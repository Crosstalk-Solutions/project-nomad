import { MapService } from '#services/map_service';
import { SystemService } from '#services/system_service';
import { inject } from '@adonisjs/core';
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class SettingsController {
    constructor(
        private systemService: SystemService,
        private mapService: MapService
    ) { }

    async system({ inertia }: HttpContext) {
        const systemInfo = await this.systemService.getSystemInfo();
        return inertia.render('settings/system', {
            system: {
                info: systemInfo
            }
        });
    }

    async apps({ inertia }: HttpContext) {
        const services = await this.systemService.getServices({ installedOnly: false });
        return inertia.render('settings/apps', {
            system: {
                services
            }
        });
    }
    
    async legal({ inertia }: HttpContext) {
        return inertia.render('settings/legal');
    }

    async maps({ inertia }: HttpContext) {
        const baseAssetsCheck = await this.mapService.checkBaseAssetsExist();
        const regionFiles = await this.mapService.listRegions();
        return inertia.render('settings/maps', {
            maps: {
                baseAssetsExist: baseAssetsCheck,
                regionFiles: regionFiles.files
            }
        });
    }

    async zim({ inertia }: HttpContext) {
        return inertia.render('settings/zim/index')
    }

    async zimRemote({ inertia }: HttpContext) {
        return inertia.render('settings/zim/remote-explorer');
    }
}