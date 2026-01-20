import { DockerService } from '#services/docker_service';
import { SystemService } from '#services/system_service'
import { SystemUpdateService } from '#services/system_update_service'
import { affectServiceValidator, installServiceValidator } from '#validators/system';
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class SystemController {
    constructor(
        private systemService: SystemService,
        private dockerService: DockerService,
        private systemUpdateService: SystemUpdateService
    ) { }

    async getInternetStatus({ }: HttpContext) {
        return await this.systemService.getInternetStatus();
    }

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

    async checkLatestVersion({ }: HttpContext) {
        return await this.systemService.checkLatestVersion();
    }

    async forceReinstallService({ request, response }: HttpContext) {
        const payload = await request.validateUsing(installServiceValidator);
        const result = await this.dockerService.forceReinstall(payload.service_name);
        if (!result) {
            response.internalServerError({ error: 'Failed to force reinstall service' });
            return;
        }
        response.send({ success: result.success, message: result.message });
    }

    async requestSystemUpdate({ response }: HttpContext) {
        if (!this.systemUpdateService.isSidecarAvailable()) {
            response.status(503).send({
                success: false,
                error: 'Update sidecar is not available. Ensure the updater container is running.',
            });
            return;
        }

        const result = await this.systemUpdateService.requestUpdate();

        if (result.success) {
            response.send({
                success: true,
                message: result.message,
                note: 'Monitor update progress via GET /api/system/update/status. The connection may drop during container restart.',
            });
        } else {
            response.status(409).send({
                success: false,
                error: result.message,
            });
        }
    }

    async getSystemUpdateStatus({ response }: HttpContext) {
        const status = this.systemUpdateService.getUpdateStatus();

        if (!status) {
            response.status(500).send({
                error: 'Failed to retrieve update status',
            });
            return;
        }

        response.send(status);
    }

    async getSystemUpdateLogs({ response }: HttpContext) {
        const logs = this.systemUpdateService.getUpdateLogs();
        response.send({ logs });
    }
}