import { DockerService } from '#services/docker_service';
import { SystemService } from '#services/system_service'
import { affectServiceValidator, installServiceValidator } from '#validators/system';
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class SystemController {
    constructor(
        private systemService: SystemService,
        private dockerService: DockerService
    ) { }

    async getSystemInfo({ }: HttpContext) {
        return await this.systemService.getSystemInfo();
    }

    async getServices({ }: HttpContext) {
        return await this.systemService.getServices({ installedOnly: true });
    }

    async installService({ request, response }: HttpContext) {
        const payload = await request.validateUsing(installServiceValidator);

        const result = await this.dockerService.createContainerPreflight(payload.service_name);
        if (result.success) {
            response.send({ success: true, message: result.message });
        } else {
            response.status(400).send({ error: result.message });
        }
    }

    async affectService({ request, response }: HttpContext) {
        const payload = await request.validateUsing(affectServiceValidator);
        const result = await this.dockerService.affectContainer(payload.service_name, payload.action);
        if (!result) {
            response.internalServerError({ error: 'Failed to affect service' });
            return;
        }
        response.send({ success: result.success, message: result.message });
    }
}