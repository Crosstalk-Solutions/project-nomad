import { DockerService } from '#services/docker_service';
import { SystemService } from '#services/system_service'
import { SystemUpdateService } from '#services/system_update_service'
import { ContainerRegistryService } from '#services/container_registry_service'
import { CheckServiceUpdatesJob } from '#jobs/check_service_updates_job'
import { affectServiceValidator, checkLatestVersionValidator, installServiceValidator, subscribeToReleaseNotesValidator, updateServiceValidator } from '#validators/system';
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class SystemController {
    constructor(
        private systemService: SystemService,
        private dockerService: DockerService,
        private systemUpdateService: SystemUpdateService,
        private containerRegistryService: ContainerRegistryService
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
            response.status(400).send({ success: false, message: result.message });
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

    async checkLatestVersion({ request }: HttpContext) {
        const payload = await request.validateUsing(checkLatestVersionValidator)
        return await this.systemService.checkLatestVersion(payload.force);
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


    async subscribeToReleaseNotes({ request }: HttpContext) {
        const reqData = await request.validateUsing(subscribeToReleaseNotesValidator);
        return await this.systemService.subscribeToReleaseNotes(reqData.email);
    }

    async checkServiceUpdates({ response }: HttpContext) {
        await CheckServiceUpdatesJob.dispatch()
        response.send({ success: true, message: 'Service update check dispatched' })
    }

    async getAvailableVersions({ params, response }: HttpContext) {
        const serviceName = params.name
        const service = await (await import('#models/service')).default
            .query()
            .where('service_name', serviceName)
            .where('installed', true)
            .first()

        if (!service) {
            return response.status(404).send({ error: `Service ${serviceName} not found or not installed` })
        }

        try {
            const hostArch = await this.getHostArch()
            const updates = await this.containerRegistryService.getAvailableUpdates(
                service.container_image,
                hostArch,
                service.source_repo
            )
            response.send({ versions: updates })
        } catch (error) {
            response.status(500).send({ error: `Failed to fetch versions: ${error.message}` })
        }
    }

    async updateService({ request, response }: HttpContext) {
        const payload = await request.validateUsing(updateServiceValidator)
        const result = await this.dockerService.updateContainer(
            payload.service_name,
            payload.target_version
        )

        if (result.success) {
            response.send({ success: true, message: result.message })
        } else {
            response.status(400).send({ error: result.message })
        }
    }

    private async getHostArch(): Promise<string> {
        try {
            const info = await this.dockerService.docker.info()
            const arch = info.Architecture || ''
            const archMap: Record<string, string> = {
                x86_64: 'amd64',
                aarch64: 'arm64',
                armv7l: 'arm',
                amd64: 'amd64',
                arm64: 'arm64',
            }
            return archMap[arch] || arch.toLowerCase()
        } catch {
            return 'amd64'
        }
    }
}