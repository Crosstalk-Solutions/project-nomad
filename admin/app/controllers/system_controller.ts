import { DockerService } from '#services/docker_service';
import { SystemService } from '#services/system_service'
import { SystemUpdateService } from '#services/system_update_service'
import { ContainerRegistryService } from '#services/container_registry_service'
import { AutoUpdateService } from '#services/auto_update_service'
import { AppAutoUpdateService } from '#services/app_auto_update_service'
import { ContentAutoUpdateService } from '#services/content_auto_update_service'
import { DownloadService } from '#services/download_service'
import { QueueService } from '#services/queue_service'
import { CheckServiceUpdatesJob } from '#jobs/check_service_updates_job'
import {
  affectServiceValidator,
  checkLatestVersionValidator,
  customAppValidator,
  deleteCustomAppValidator,
  installServiceValidator,
  preflightCustomValidator,
  preflightValidator,
  serviceLogsValidator,
  subscribeToReleaseNotesValidator,
  uninstallServiceValidator,
  updateCustomAppValidator,
  updateServiceValidator,
  setServiceAutoUpdateValidator,
  setServiceCustomUrlValidator,
  normalizeCustomUrl,
} from '#validators/system'
import {
  DEFAULT_CPUS,
  DEFAULT_MEMORY_MB,
  evaluateCustomApp,
} from '#services/custom_app_guard'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import Service from '#models/service'

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

    async getAutoUpdateStatus({ response }: HttpContext) {
        // Construct inline reusing already-injected singletons + the QueueService
        // singleton (its constructor is private to prevent Redis connection leaks,
        // so we must not let the container new a fresh one).
        const autoUpdateService = new AutoUpdateService(
            this.dockerService,
            new DownloadService(QueueService.getInstance()),
            this.systemService,
            this.systemUpdateService,
            this.containerRegistryService
        )

        try {
            const status = await autoUpdateService.getStatus()
            response.send(status)
        } catch (error) {
            logger.error({ err: error }, '[SystemController] Failed to get auto-update status')
            response.status(500).send({ error: 'Failed to retrieve auto-update status' })
        }
    }

    async getAppAutoUpdateStatus({ response }: HttpContext) {
        // Constructed inline reusing already-injected singletons + the QueueService
        // singleton (its constructor is private to prevent Redis connection leaks),
        // mirroring getAutoUpdateStatus. Apps need no SystemUpdateService (no sidecar).
        const appAutoUpdateService = new AppAutoUpdateService(
            this.dockerService,
            new DownloadService(QueueService.getInstance()),
            this.systemService,
            this.containerRegistryService
        )

        try {
            const status = await appAutoUpdateService.getStatus()
            response.send(status)
        } catch (error) {
            logger.error({ err: error }, '[SystemController] Failed to get app auto-update status')
            response.status(500).send({ error: 'Failed to retrieve app auto-update status' })
        }
    }

    async getContentAutoUpdateStatus({ response }: HttpContext) {
        // Mirrors getAppAutoUpdateStatus. Content auto-update needs only the
        // DownloadService (for the active-download pre-flight); the catalog and
        // collection-update services default-construct inside the service.
        const contentAutoUpdateService = new ContentAutoUpdateService(
            new DownloadService(QueueService.getInstance())
        )

        try {
            const status = await contentAutoUpdateService.getStatus()
            response.send(status)
        } catch (error) {
            logger.error({ err: error }, '[SystemController] Failed to get content auto-update status')
            response.status(500).send({ error: 'Failed to retrieve content auto-update status' })
        }
    }

    async setServiceAutoUpdate({ request, response }: HttpContext) {
        const payload = await request.validateUsing(setServiceAutoUpdateValidator)
        const service = await Service.query().where('service_name', payload.service_name).first()
        if (!service) {
            return response.status(404).send({ error: `Service ${payload.service_name} not found` })
        }

        service.auto_update_enabled = payload.enabled
        // Re-enabling clears any prior self-disable so the app gets a fresh start.
        if (payload.enabled) {
            service.auto_update_consecutive_failures = 0
            service.auto_update_disabled_reason = null
        }
        await service.save()

        return response.send({ success: true, message: 'App auto-update preference updated' })
    }


    async subscribeToReleaseNotes({ request }: HttpContext) {
        const reqData = await request.validateUsing(subscribeToReleaseNotesValidator);
        return await this.systemService.subscribeToReleaseNotes(reqData.email);
    }

    async getDebugInfo({}: HttpContext) {
        const debugInfo = await this.systemService.getDebugInfo()
        return { debugInfo }
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
            logger.error({ err: error }, `[SystemController] Failed to fetch versions for ${serviceName}`)
            response.status(500).send({ error: 'Failed to fetch available versions for this service.' })
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

    /**
     * Pre-install preflight check: reports port conflicts and resource warnings for a service.
     * Results are advisory — the UI shows warnings but allows the user to force-proceed.
     */
    async preflightCheck({ request, response }: HttpContext) {
        const payload = await request.validateUsing(preflightValidator)

        const service = await Service.query().where('service_name', payload.service_name).first()
        if (!service) {
            return response.status(404).send({ error: `Service ${payload.service_name} not found` })
        }

        // Extract host ports from container_config — the MySQL driver may return JSON columns
        // as an already-parsed object rather than a string, so guard before calling JSON.parse.
        const rawConfig = service.container_config
        const config = rawConfig
            ? typeof rawConfig === 'object'
                ? rawConfig
                : JSON.parse(rawConfig as string)
            : null
        const portBindings: Record<string, [{ HostPort: string }]> =
            config?.HostConfig?.PortBindings ?? {}
        const hostPorts = Object.values(portBindings)
            .flat()
            .map((b) => parseInt(b.HostPort, 10))
            .filter((p) => !isNaN(p))

        // Parse resource requirements from metadata (same object-guard as container_config)
        let minMemoryMB = 256
        let minDiskMB = 512
        try {
            const rawMeta = service.metadata
            const meta = rawMeta
                ? typeof rawMeta === 'object'
                    ? rawMeta
                    : JSON.parse(rawMeta as string)
                : null
            if (meta?.minMemoryMB) minMemoryMB = meta.minMemoryMB
            if (meta?.minDiskMB) minDiskMB = meta.minDiskMB
        } catch {}

        const [{ conflicts: portConflicts }, resourceWarnings] = await Promise.all([
            this.dockerService.checkPortConflicts(hostPorts),
            this.systemService.checkResourceWarnings(minMemoryMB, minDiskMB),
        ])

        return response.send({ portConflicts, resourceWarnings })
    }

    /** Return the next suggested host port for a custom app (8600+ range). */
    async suggestCustomPort({ response }: HttpContext) {
        const port = await this.systemService.getNextSuggestedCustomPort()
        return response.send({ port })
    }

    /**
     * Service-less preflight for the custom-app form: given host ports, volumes and an image,
     * report port conflicts, host resource warnings, overridable guard warnings (risky bind
     * mounts / untrusted or moving-tag images), and hard blocks (docker socket, system dirs,
     * malformed image). Lets the form give live feedback before a Service record exists.
     */
    async preflightCustomApp({ request, response }: HttpContext) {
        const payload = await request.validateUsing(preflightCustomValidator)
        const [{ conflicts }, resourceWarnings] = await Promise.all([
            this.dockerService.checkPortConflicts(payload.ports ?? []),
            this.systemService.checkResourceWarnings(256, 512),
        ])
        // When editing, the app's own container legitimately holds its ports — don't flag those.
        const portConflicts = payload.exclude_service
            ? conflicts.filter((c) => c.usedBy !== payload.exclude_service)
            : conflicts
        const guard = evaluateCustomApp({ image: payload.image, volumes: payload.volumes })
        return response.send({
            portConflicts,
            resourceWarnings: [...resourceWarnings, ...guard.warnings],
            blocked: guard.blocked,
        })
    }

    /** Create and immediately begin installing a custom app container. */
    async createCustomApp({ request, response }: HttpContext) {
        const payload = await request.validateUsing(customAppValidator)

        // Derive a stable service_name from the friendly name
        const slug = payload.friendly_name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
        const serviceName = `nomad_custom_${slug}`

        const existing = await Service.query().where('service_name', serviceName).first()
        if (existing) {
            return response.status(409).send({
                success: false,
                message: `A custom app named "${payload.friendly_name}" already exists. Choose a different name.`,
            })
        }

        // Reject duplicate host ports within the request — Docker would otherwise fail at
        // start time with an opaque "port is already allocated" error.
        const hostPorts = (payload.ports ?? []).map((p) => p.host)
        const duplicateHostPorts = [...new Set(hostPorts.filter((p, i) => hostPorts.indexOf(p) !== i))]
        if (duplicateHostPorts.length) {
            return response.status(422).send({
                success: false,
                message: `Duplicate host port(s): ${duplicateHostPorts.join(', ')}. Each host port can map to only one container.`,
            })
        }

        // Security guardrails: hard-block dangerous bind mounts / malformed images regardless of
        // force; surface overridable warnings (risky paths, untrusted/moving-tag images) unless forced.
        const guard = evaluateCustomApp({ image: payload.image, volumes: payload.volumes })
        if (guard.blocked.length) {
            return response.status(422).send({
                success: false,
                message: guard.blocked.join(' '),
                blocked: guard.blocked,
            })
        }
        if (!payload.force && guard.warnings.length) {
            return response.status(409).send({
                success: false,
                message: guard.warnings.join(' '),
                warnings: guard.warnings,
            })
        }

        // Advisory preflight: surface port conflicts before creating the record so a failed
        // install doesn't leave a phantom card. The user can re-submit with force=true to override.
        if (!payload.force && hostPorts.length) {
            const { conflicts } = await this.dockerService.checkPortConflicts(hostPorts)
            if (conflicts.length) {
                return response.status(409).send({
                    success: false,
                    message: `Port conflict: ${conflicts
                        .map((c) => `${c.port} (in use by ${c.usedBy})`)
                        .join(', ')}.`,
                    portConflicts: conflicts,
                })
            }
        }

        const { containerConfig, uiLocation } = this.buildCustomContainerConfig(payload)

        await Service.create({
            service_name: serviceName,
            friendly_name: payload.friendly_name,
            container_image: payload.image,
            container_config: JSON.stringify(containerConfig),
            ui_location: uiLocation,
            icon: payload.icon || 'IconBrandDocker',
            installed: false,
            installation_status: 'idle',
            is_dependency_service: false,
            is_custom: true,
            category: payload.category ?? 'custom',
            depends_on: null,
        })

        const result = await this.dockerService.createContainerPreflight(serviceName)
        if (result.success) {
            return response.send({ success: true, message: result.message, service_name: serviceName })
        }
        return response.status(400).send({ success: false, message: result.message })
    }

    /** Delete a custom app: stop + remove its container, then delete the DB record. */
    async deleteCustomApp({ request, response }: HttpContext) {
        const payload = await request.validateUsing(deleteCustomAppValidator)

        const service = await Service.query().where('service_name', payload.service_name).first()
        if (!service) {
            return response.status(404).send({ error: `Service ${payload.service_name} not found` })
        }
        if (!service.is_custom) {
            return response.status(403).send({ error: 'Only custom apps can be deleted.' })
        }

        await this.dockerService.removeCustomAppContainer(payload.service_name, payload.remove_image ?? false)
        await service.delete()

        return response.send({ success: true, message: `Custom app ${payload.service_name} deleted` })
    }

    /** Uninstall a curated catalog app: stop + remove its container (optionally its image) and
     * return the card to the available catalog. App data under the storage path stays on disk,
     * so a later reinstall picks it back up. Custom apps are removed via deleteCustomApp instead,
     * which also drops their DB record. */
    async uninstallService({ request, response }: HttpContext) {
        const payload = await request.validateUsing(uninstallServiceValidator)

        const service = await Service.query().where('service_name', payload.service_name).first()
        if (!service) {
            return response.status(404).send({ error: `Service ${payload.service_name} not found` })
        }
        if (service.is_custom) {
            return response.status(403).send({ error: 'Custom apps are removed via delete.' })
        }
        if (service.is_dependency_service) {
            return response.status(403).send({ error: 'Dependency services cannot be uninstalled directly.' })
        }
        if (!service.installed) {
            return response.status(409).send({ error: `Service ${payload.service_name} is not installed` })
        }

        const result = await this.dockerService.uninstallService(
            payload.service_name,
            payload.remove_image ?? false
        )
        if (!result.success) {
            return response.status(500).send({ success: false, message: result.message })
        }
        return response.send({ success: true, message: result.message })
    }

    /** Migrate downloaded content (channels + content files already on disk) from the legacy Kolibri
     * install into the Gen 2 install, entirely locally. Accounts/progress are intentionally left as a
     * manual step. No request payload — the source/target services are fixed. */
    async migrateLegacyKolibriContent({ response }: HttpContext) {
        const result = await this.dockerService.migrateLegacyKolibriContent()
        if (!result.success) {
            return response.status(400).send({ success: false, message: result.message })
        }
        return response.send({ success: true, message: result.message })
    }

    /** Set or clear an app's custom launch URL (works for curated and custom apps). Purely a
     * metadata change — no container is touched. An empty/invalid value clears the override, after
     * which the default host + port link is used again. */
    async setServiceCustomUrl({ request, response }: HttpContext) {
        const payload = await request.validateUsing(setServiceCustomUrlValidator)

        const service = await Service.query().where('service_name', payload.service_name).first()
        if (!service) {
            return response.status(404).send({ success: false, message: `Service ${payload.service_name} not found` })
        }
        // Hidden dependency services (e.g. Qdrant) aren't user-launchable, so they have no link to set.
        if (service.is_dependency_service) {
            return response.status(403).send({ success: false, message: 'This service cannot be configured.' })
        }

        // Reject a non-empty value that isn't a valid http(s) URL; an empty value clears the override.
        const normalized = normalizeCustomUrl(payload.custom_url)
        if (payload.custom_url && payload.custom_url.trim() && !normalized) {
            return response.status(422).send({
                success: false,
                message: 'Custom URL must be a valid http(s) address (e.g. https://jellyfin.myhomelab.net).',
            })
        }

        service.custom_url = normalized
        await service.save()

        return response.send({ success: true, custom_url: service.custom_url })
    }

    /** Re-pull a custom app's image and recreate its container in place (preserving volumes). */
    async updateCustomApp_pullLatest({ request, response }: HttpContext) {
        const payload = await request.validateUsing(installServiceValidator)

        const service = await Service.query().where('service_name', payload.service_name).first()
        if (!service) {
            return response.status(404).send({ success: false, message: `Service ${payload.service_name} not found` })
        }
        if (!service.is_custom) {
            return response.status(403).send({ success: false, message: 'Only custom apps can be updated this way.' })
        }

        const result = await this.dockerService.recreateCustomAppContainer(payload.service_name, {
            forcePull: true,
        })
        if (result.success) {
            return response.send({ success: true, message: result.message })
        }
        return response.status(400).send({ success: false, message: result.message })
    }

    /** Return the last N lines of a service container's logs. */
    async getServiceLogs({ params, request, response }: HttpContext) {
        // Scope to managed services only — otherwise any sibling container's logs (admin app,
        // database) would be readable by name on this unauthenticated API surface.
        const service = await Service.query().where('service_name', params.name).first()
        if (!service) {
            return response.status(404).send({ success: false, message: `Service ${params.name} not found` })
        }
        const { tail } = await request.validateUsing(serviceLogsValidator)
        const result = await this.dockerService.getContainerLogs(params.name, tail ?? 200)
        if (!result.success) {
            return response.status(404).send({ success: false, message: result.message })
        }
        return response.send({ success: true, logs: result.logs })
    }

    /** Return a one-shot CPU/memory usage snapshot for a running service container. */
    async getServiceStats({ params, response }: HttpContext) {
        // Scope to managed services only (see getServiceLogs).
        const service = await Service.query().where('service_name', params.name).first()
        if (!service) {
            return response.status(404).send({ success: false, message: `Service ${params.name} not found` })
        }
        const result = await this.dockerService.getContainerStats(params.name)
        if (!result.success) {
            return response.status(404).send({ success: false, message: result.message })
        }
        return response.send({ success: true, running: result.running ?? false, stats: result.stats ?? null })
    }

    /** Return an app's current configuration in the editable form-shape. */
    async getCustomApp({ params, response }: HttpContext) {
        const service = await Service.query().where('service_name', params.name).first()
        if (!service) {
            return response.status(404).send({ error: `Service ${params.name} not found` })
        }
        // Custom and curated apps are both editable; hidden dependency services (e.g. Qdrant) are not.
        if (service.is_dependency_service) {
            return response.status(403).send({ error: 'This service cannot be edited.' })
        }
        return response.send({ success: true, app: this.parseCustomContainerConfig(service) })
    }

    /** Reconfigure an app: validate + guard, persist the new config, then recreate the container.
     * Works for both custom apps and curated (pre-configured) apps. Editing a curated app marks it
     * user-modified so the seeder stops overwriting the user's changes. */
    async updateCustomApp({ request, response }: HttpContext) {
        const payload = await request.validateUsing(updateCustomAppValidator)

        const service = await Service.query().where('service_name', payload.service_name).first()
        if (!service) {
            return response.status(404).send({ success: false, message: `Service ${payload.service_name} not found` })
        }
        // Custom and curated apps are both editable; hidden dependency services (e.g. Qdrant) are not.
        if (service.is_dependency_service) {
            return response.status(403).send({ success: false, message: 'This service cannot be edited.' })
        }

        // Reject duplicate host ports within the request.
        const hostPorts = (payload.ports ?? []).map((p) => p.host)
        const duplicateHostPorts = [...new Set(hostPorts.filter((p, i) => hostPorts.indexOf(p) !== i))]
        if (duplicateHostPorts.length) {
            return response.status(422).send({
                success: false,
                message: `Duplicate host port(s): ${duplicateHostPorts.join(', ')}. Each host port can map to only one container.`,
            })
        }

        // Security guardrails (same posture as create).
        const guard = evaluateCustomApp({ image: payload.image, volumes: payload.volumes })
        if (guard.blocked.length) {
            return response.status(422).send({ success: false, message: guard.blocked.join(' '), blocked: guard.blocked })
        }
        if (!payload.force && guard.warnings.length) {
            return response.status(409).send({ success: false, message: guard.warnings.join(' '), warnings: guard.warnings })
        }

        // Port conflicts — but ignore ports already held by this app's own container.
        if (!payload.force && hostPorts.length) {
            const { conflicts } = await this.dockerService.checkPortConflicts(hostPorts)
            const external = conflicts.filter((c) => c.usedBy !== payload.service_name)
            if (external.length) {
                return response.status(409).send({
                    success: false,
                    message: `Port conflict: ${external
                        .map((c) => `${c.port} (in use by ${c.usedBy})`)
                        .join(', ')}.`,
                    portConflicts: external,
                })
            }
        }

        // Merge the form fields into the app's existing config rather than rebuilding from scratch,
        // so advanced settings a curated app ships with (GPU device requests, special env, etc.) are
        // preserved across an edit.
        // Preserve an explicit scheme (e.g. ui_location "https:8480") across an edit — otherwise a
        // TLS-serving app's Open link would silently revert to http after any reconfigure.
        const prevScheme = (service.ui_location || '').match(/^(https?):\d+$/)?.[1]
        const { containerConfig, uiLocation } = this.mergeCustomContainerConfig(
            service.container_config,
            payload
        )
        service.friendly_name = payload.friendly_name
        service.container_image = payload.image
        service.container_config = JSON.stringify(containerConfig)
        service.ui_location = prevScheme && uiLocation && /^\d+$/.test(uiLocation)
            ? `${prevScheme}:${uiLocation}`
            : uiLocation
        service.category = payload.category ?? service.category ?? 'custom'
        if (payload.icon) service.icon = payload.icon
        // Flag as user-modified so the seeder stops overwriting this app's config on future runs.
        service.is_user_modified = true
        await service.save()

        const result = await this.dockerService.recreateCustomAppContainer(payload.service_name)
        if (result.success) {
            return response.send({ success: true, message: result.message, service_name: payload.service_name })
        }
        return response.status(400).send({ success: false, message: result.message })
    }

    /**
     * Build a Docker container config (HostConfig + ExposedPorts + Env) from custom-app form input,
     * applying default resource caps. Shared by create and update so both stay in lockstep.
     */
    private buildCustomContainerConfig(payload: {
        ports?: { container: number; host: number }[]
        volumes?: { host_path: string; container_path: string }[]
        env?: string[]
        memory_mb?: number
        cpus?: number
    }): { containerConfig: Record<string, any>; uiLocation: string | null } {
        const portBindings: Record<string, [{ HostPort: string }]> = {}
        const exposedPorts: Record<string, {}> = {}
        for (const { container, host } of payload.ports ?? []) {
            portBindings[`${container}/tcp`] = [{ HostPort: String(host) }]
            exposedPorts[`${container}/tcp`] = {}
        }

        const binds = (payload.volumes ?? []).map(
            ({ host_path, container_path }) => `${host_path}:${container_path}`
        )

        // Resource caps so a runaway custom container can't starve the host. Memory is bytes;
        // NanoCpus is CPUs × 1e9. Defaults are generous and user-overridable.
        const memoryBytes = (payload.memory_mb ?? DEFAULT_MEMORY_MB) * 1024 * 1024
        const nanoCpus = Math.round((payload.cpus ?? DEFAULT_CPUS) * 1e9)

        const containerConfig: Record<string, any> = {
            HostConfig: {
                RestartPolicy: { Name: 'unless-stopped' },
                PortBindings: portBindings,
                Memory: memoryBytes,
                NanoCpus: nanoCpus,
                ...(binds.length ? { Binds: binds } : {}),
            },
            ExposedPorts: exposedPorts,
            ...(payload.env?.length ? { Env: payload.env } : {}),
        }

        const firstHostPort = payload.ports?.[0]?.host
        const uiLocation = firstHostPort ? String(firstHostPort) : null
        return { containerConfig, uiLocation }
    }

    /**
     * Merge custom-app form input into an app's *existing* container config. Used by the edit path so
     * editing a curated app only changes the fields exposed in the form (image/ports/volumes/env and,
     * if supplied, resource caps) while preserving everything else it ships with (GPU DeviceRequests,
     * User, custom HostConfig keys, etc.). Unlike buildCustomContainerConfig, resource caps are NOT
     * defaulted here — a curated app intentionally left uncapped stays uncapped unless the user sets one.
     */
    private mergeCustomContainerConfig(
        existingRaw: string | null,
        payload: {
            ports?: { container: number; host: number }[]
            volumes?: { host_path: string; container_path: string }[]
            env?: string[]
            memory_mb?: number
            cpus?: number
        }
    ): { containerConfig: Record<string, any>; uiLocation: string | null } {
        const parsed = existingRaw
            ? typeof existingRaw === 'object'
                ? existingRaw
                : JSON.parse(existingRaw as string)
            : {}
        // Deep clone so we never mutate the parsed source.
        const containerConfig: Record<string, any> = JSON.parse(JSON.stringify(parsed ?? {}))
        containerConfig.HostConfig = containerConfig.HostConfig ?? {}
        // Keep a restart policy if the existing config lacked one.
        containerConfig.HostConfig.RestartPolicy =
            containerConfig.HostConfig.RestartPolicy ?? { Name: 'unless-stopped' }

        const portBindings: Record<string, [{ HostPort: string }]> = {}
        const exposedPorts: Record<string, {}> = {}
        for (const { container, host } of payload.ports ?? []) {
            portBindings[`${container}/tcp`] = [{ HostPort: String(host) }]
            exposedPorts[`${container}/tcp`] = {}
        }
        containerConfig.HostConfig.PortBindings = portBindings
        containerConfig.ExposedPorts = exposedPorts

        const binds = (payload.volumes ?? []).map(
            ({ host_path, container_path }) => `${host_path}:${container_path}`
        )
        if (binds.length) containerConfig.HostConfig.Binds = binds
        else delete containerConfig.HostConfig.Binds

        if (payload.env?.length) containerConfig.Env = payload.env
        else delete containerConfig.Env

        // Only touch resource caps when the user explicitly set them — preserve existing/uncapped otherwise.
        if (payload.memory_mb != null) {
            containerConfig.HostConfig.Memory = payload.memory_mb * 1024 * 1024
        }
        if (payload.cpus != null) {
            containerConfig.HostConfig.NanoCpus = Math.round(payload.cpus * 1e9)
        }

        const firstHostPort = payload.ports?.[0]?.host
        const uiLocation = firstHostPort ? String(firstHostPort) : null
        return { containerConfig, uiLocation }
    }

    /** Inverse of buildCustomContainerConfig: turn a stored Service into the editable form-shape. */
    private parseCustomContainerConfig(service: Service) {
        const raw = service.container_config
        const config = raw ? (typeof raw === 'object' ? raw : JSON.parse(raw as string)) : {}
        const hostConfig = config?.HostConfig ?? {}

        const ports = Object.entries(hostConfig.PortBindings ?? {}).map(([key, val]: [string, any]) => ({
            container: Number.parseInt(key, 10),
            host: Number.parseInt(val?.[0]?.HostPort, 10),
        }))

        const volumes = (hostConfig.Binds ?? []).map((bind: string) => {
            const idx = bind.indexOf(':')
            return { host_path: bind.slice(0, idx), container_path: bind.slice(idx + 1) }
        })

        return {
            service_name: service.service_name,
            friendly_name: service.friendly_name,
            image: service.container_image,
            category: service.category ?? 'custom',
            icon: service.icon ?? 'IconBrandDocker',
            ports,
            volumes,
            env: (config?.Env ?? []) as string[],
            memory_mb: hostConfig.Memory ? Math.round(hostConfig.Memory / (1024 * 1024)) : undefined,
            cpus: hostConfig.NanoCpus ? hostConfig.NanoCpus / 1e9 : undefined,
        }
    }
}