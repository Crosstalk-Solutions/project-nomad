import { DockerService } from '#services/docker_service';
import { SystemService } from '#services/system_service'
import { installServiceValidator } from '#validators/system';
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class SystemController {
    constructor(
        private systemService: SystemService,
        private dockerService: DockerService
    ) { }

    async getServices({ response }: HttpContext) {
        const services = await this.systemService.getServices();
        response.send(services);
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

    async simulateSSE({ response }: HttpContext) {
        this.dockerService.simulateSSE();
        response.send({ message: 'Started simulation of SSE' })
    }
}