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
            response.internalServerError({ error: 'Falha ao executar a ação no serviço' });
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
            response.internalServerError({ error: 'Falha ao reinstalar o serviço à força' });
            return;
        }
        response.send({ success: result.success, message: result.message });
    }

    async requestSystemUpdate({ response }: HttpContext) {
        if (!this.systemUpdateService.isSidecarAvailable()) {
            response.status(503).send({
                success: false,
                error: 'O sidecar de atualização não está disponível. Verifique se o contêiner atualizador está em execução.',
            });
            return;
        }

        const result = await this.systemUpdateService.requestUpdate();

        if (result.success) {
            response.send({
                success: true,
                message: result.message,
                note: 'Acompanhe o progresso da atualização por meio de GET /api/system/update/status. A conexão pode cair durante a reinicialização do contêiner.',
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
                error: 'Falha ao obter o status da atualização',
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
        // Cria a instância diretamente, reutilizando os singletons já injetados e o QueueService
        // singleton (seu construtor é privado para evitar vazamentos de conexões Redis,
        // portanto, não devemos permitir que o contêiner crie uma nova instância).
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
            logger.error({ err: error }, '[SystemController] Falha ao obter o status da atualização automática')
            response.status(500).send({ error: 'Falha ao obter o status da atualização automática' })
        }
    }

    async getAppAutoUpdateStatus({ response }: HttpContext) {
        // Cria a instância diretamente, reutilizando os singletons já injetados e o QueueService
        // singleton (seu construtor é privado para evitar vazamentos de conexões Redis),
        // seguindo o padrão de getAutoUpdateStatus. Aplicativos não precisam de SystemUpdateService (não há sidecar).
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
            logger.error({ err: error }, '[SystemController] Falha ao obter o status da atualização automática dos aplicativos')
            response.status(500).send({ error: 'Falha ao obter o status da atualização automática dos aplicativos' })
        }
    }

    async getContentAutoUpdateStatus({ response }: HttpContext) {
        // Segue o padrão de getAppAutoUpdateStatus. A atualização automática de conteúdo precisa apenas do
        // DownloadService (para a verificação prévia de downloads ativos); o catálogo e
        // os serviços de atualização de coleções são instanciados por padrão dentro do serviço.
        const contentAutoUpdateService = new ContentAutoUpdateService(
            new DownloadService(QueueService.getInstance())
        )

        try {
            const status = await contentAutoUpdateService.getStatus()
            response.send(status)
        } catch (error) {
            logger.error({ err: error }, '[SystemController] Falha ao obter o status da atualização automática de conteúdo')
            response.status(500).send({ error: 'Falha ao obter o status da atualização automática de conteúdo' })
        }
    }

    async setServiceAutoUpdate({ request, response }: HttpContext) {
        const payload = await request.validateUsing(setServiceAutoUpdateValidator)
        const service = await Service.query().where('service_name', payload.service_name).first()
        if (!service) {
            return response.status(404).send({ error: `Serviço ${payload.service_name} não encontrado` })
        }

        service.auto_update_enabled = payload.enabled
        // Ao reativar, limpa qualquer desativação automática anterior para que o aplicativo tente novamente do zero.
        if (payload.enabled) {
            service.auto_update_consecutive_failures = 0
            service.auto_update_disabled_reason = null
        }
        await service.save()

        return response.send({ success: true, message: 'Preferência de atualização automática do aplicativo atualizada' })
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
        response.send({ success: true, message: 'Verificação de atualizações dos serviços iniciada' })
    }

    async getAvailableVersions({ params, response }: HttpContext) {
        const serviceName = params.name
        const service = await (await import('#models/service')).default
            .query()
            .where('service_name', serviceName)
            .where('installed', true)
            .first()

        if (!service) {
            return response.status(404).send({ error: `Serviço ${serviceName} não encontrado ou não instalado` })
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
            logger.error({ err: error }, `[SystemController] Falha ao buscar versões para ${serviceName}`)
            response.status(500).send({ error: 'Falha ao buscar as versões disponíveis para este serviço.' })
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
     * Verificação prévia à instalação: informa conflitos de portas e avisos de recursos de um serviço.
     * Os resultados são informativos — a interface exibe avisos, mas permite que o usuário prossiga mesmo assim.
     */
    async preflightCheck({ request, response }: HttpContext) {
        const payload = await request.validateUsing(preflightValidator)

        const service = await Service.query().where('service_name', payload.service_name).first()
        if (!service) {
            return response.status(404).send({ error: `Serviço ${payload.service_name} não encontrado` })
        }

        // Extrai as portas do host de container_config — o driver MySQL pode retornar colunas JSON
        // como objetos já analisados, em vez de strings; por isso, verifica o tipo antes de chamar JSON.parse.
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

        // Analisa os requisitos de recursos dos metadados (com a mesma verificação de objeto usada em container_config)
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

    /** Retorna a próxima porta do host sugerida para um aplicativo personalizado (faixa a partir de 8600). */
    async suggestCustomPort({ response }: HttpContext) {
        const port = await this.systemService.getNextSuggestedCustomPort()
        return response.send({ port })
    }

    /**
     * Verificação prévia sem serviço para o formulário de aplicativo personalizado: com portas do host, volumes e uma imagem,
     * informa conflitos de portas, avisos sobre recursos do host, alertas de segurança que podem ser ignorados (montagens bind
     * arriscadas / imagens não confiáveis ou com tags mutáveis) e bloqueios obrigatórios (socket do Docker, diretórios do sistema,
     * imagem malformada). Permite que o formulário forneça feedback imediato antes de existir um registro Service.
     */
    async preflightCustomApp({ request, response }: HttpContext) {
        const payload = await request.validateUsing(preflightCustomValidator)
        const [{ conflicts }, resourceWarnings] = await Promise.all([
            this.dockerService.checkPortConflicts(payload.ports ?? []),
            this.systemService.checkResourceWarnings(256, 512),
        ])
        // Durante a edição, o próprio contêiner do aplicativo pode estar usando suas portas; não sinalize essas portas.
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

    /** Cria um contêiner de aplicativo personalizado e inicia sua instalação imediatamente. */
    async createCustomApp({ request, response }: HttpContext) {
        const payload = await request.validateUsing(customAppValidator)

        // Gera um service_name estável a partir do nome amigável
        const slug = payload.friendly_name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
        const serviceName = `nomad_custom_${slug}`

        const existing = await Service.query().where('service_name', serviceName).first()
        if (existing) {
            return response.status(409).send({
                success: false,
                message: `Já existe um aplicativo personalizado chamado "${payload.friendly_name}". Escolha outro nome.`,
            })
        }

        // Rejeita portas do host duplicadas na solicitação — caso contrário, o Docker falharia
        // ao iniciar, com uma mensagem pouco clara de "a porta já está alocada".
        const hostPorts = (payload.ports ?? []).map((p) => p.host)
        const duplicateHostPorts = [...new Set(hostPorts.filter((p, i) => hostPorts.indexOf(p) !== i))]
        if (duplicateHostPorts.length) {
            return response.status(422).send({
                success: false,
                message: `Porta(s) do host duplicada(s): ${duplicateHostPorts.join(', ')}. Cada porta do host pode ser mapeada para apenas um contêiner.`,
            })
        }

        // Proteções de segurança: bloqueia montagens bind perigosas e imagens malformadas independentemente de
        // force; exibe avisos que podem ser ignorados (caminhos arriscados, imagens não confiáveis ou com tags mutáveis), a menos que force esteja ativo.
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

        // Verificação prévia informativa: mostra conflitos de portas antes de criar o registro, para que uma instalação
        // malsucedida não deixe um cartão fantasma. O usuário pode enviar novamente com force=true para ignorar o aviso.
        if (!payload.force && hostPorts.length) {
            const { conflicts } = await this.dockerService.checkPortConflicts(hostPorts)
            if (conflicts.length) {
                return response.status(409).send({
                    success: false,
                    message: `Conflito de portas: ${conflicts
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

    /** Exclui um aplicativo personalizado: interrompe e remove seu contêiner e, em seguida, exclui o registro do banco de dados. */
    async deleteCustomApp({ request, response }: HttpContext) {
        const payload = await request.validateUsing(deleteCustomAppValidator)

        const service = await Service.query().where('service_name', payload.service_name).first()
        if (!service) {
            return response.status(404).send({ error: `Serviço ${payload.service_name} não encontrado` })
        }
        if (!service.is_custom) {
            return response.status(403).send({ error: 'Somente aplicativos personalizados podem ser excluídos.' })
        }

        await this.dockerService.removeCustomAppContainer(payload.service_name, payload.remove_image ?? false)
        await service.delete()

        return response.send({ success: true, message: `Aplicativo personalizado ${payload.service_name} excluído` })
    }

    /** Desinstala um aplicativo do catálogo: interrompe e remove seu contêiner (e, opcionalmente, sua imagem) e
     * devolve o cartão ao catálogo de disponíveis. Os dados do aplicativo no caminho de armazenamento permanecem no disco,
     * para serem reutilizados em uma reinstalação posterior. Aplicativos personalizados são removidos por deleteCustomApp,
     * que também exclui o registro correspondente no banco de dados. */
    async uninstallService({ request, response }: HttpContext) {
        const payload = await request.validateUsing(uninstallServiceValidator)

        const service = await Service.query().where('service_name', payload.service_name).first()
        if (!service) {
            return response.status(404).send({ error: `Serviço ${payload.service_name} não encontrado` })
        }
        if (service.is_custom) {
            return response.status(403).send({ error: 'Aplicativos personalizados devem ser removidos pela opção de exclusão.' })
        }
        if (service.is_dependency_service) {
            return response.status(403).send({ error: 'Serviços de dependência não podem ser desinstalados diretamente.' })
        }
        if (!service.installed) {
            return response.status(409).send({ error: `O serviço ${payload.service_name} não está instalado` })
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

    /** Define ou limpa a URL de inicialização personalizada de um aplicativo (do catálogo ou personalizado). É apenas uma
     * alteração de metadados — nenhum contêiner é modificado. Um valor vazio ou inválido limpa a substituição; depois disso,
     * o link padrão de host + porta volta a ser utilizado. */
    async setServiceCustomUrl({ request, response }: HttpContext) {
        const payload = await request.validateUsing(setServiceCustomUrlValidator)

        const service = await Service.query().where('service_name', payload.service_name).first()
        if (!service) {
            return response.status(404).send({ success: false, message: `Serviço ${payload.service_name} não encontrado` })
        }
        // Hidden dependency services (e.g. Qdrant) aren't user-launchable, so they have no link to set.
        if (service.is_dependency_service) {
            return response.status(403).send({ success: false, message: 'Este serviço não pode ser configurado.' })
        }

        // Rejeita um valor não vazio que não seja uma URL HTTP(S) válida; um valor vazio limpa a substituição.
        const normalized = normalizeCustomUrl(payload.custom_url)
        if (payload.custom_url && payload.custom_url.trim() && !normalized) {
            return response.status(422).send({
                success: false,
                message: 'A URL personalizada deve ser um endereço HTTP(S) válido (por exemplo, https://jellyfin.myhomelab.net).',
            })
        }

        service.custom_url = normalized
        await service.save()

        return response.send({ success: true, custom_url: service.custom_url })
    }

    /** Baixa novamente a imagem de um aplicativo personalizado e recria seu contêiner no lugar, preservando os volumes. */
    async updateCustomApp_pullLatest({ request, response }: HttpContext) {
        const payload = await request.validateUsing(installServiceValidator)

        const service = await Service.query().where('service_name', payload.service_name).first()
        if (!service) {
            return response.status(404).send({ success: false, message: `Serviço ${payload.service_name} não encontrado` })
        }
        if (!service.is_custom) {
            return response.status(403).send({ success: false, message: 'Somente aplicativos personalizados podem ser atualizados desta forma.' })
        }

        const result = await this.dockerService.recreateCustomAppContainer(payload.service_name, {
            forcePull: true,
        })
        if (result.success) {
            return response.send({ success: true, message: result.message })
        }
        return response.status(400).send({ success: false, message: result.message })
    }

    /** Retorna as últimas N linhas dos logs do contêiner de um serviço. */
    async getServiceLogs({ params, request, response }: HttpContext) {
        // Limita a consulta aos serviços gerenciados — caso contrário, os logs de qualquer contêiner irmão (aplicativo administrativo,
        // banco de dados) poderiam ser lidos pelo nome por meio desta API sem autenticação.
        const service = await Service.query().where('service_name', params.name).first()
        if (!service) {
            return response.status(404).send({ success: false, message: `Serviço ${params.name} não encontrado` })
        }
        const { tail } = await request.validateUsing(serviceLogsValidator)
        const result = await this.dockerService.getContainerLogs(params.name, tail ?? 200)
        if (!result.success) {
            return response.status(404).send({ success: false, message: result.message })
        }
        return response.send({ success: true, logs: result.logs })
    }

    /** Retorna uma captura pontual do uso de CPU e memória de um contêiner de serviço em execução. */
    async getServiceStats({ params, response }: HttpContext) {
        // Limita a consulta aos serviços gerenciados (consulte getServiceLogs).
        const service = await Service.query().where('service_name', params.name).first()
        if (!service) {
            return response.status(404).send({ success: false, message: `Serviço ${params.name} não encontrado` })
        }
        const result = await this.dockerService.getContainerStats(params.name)
        if (!result.success) {
            return response.status(404).send({ success: false, message: result.message })
        }
        return response.send({ success: true, running: result.running ?? false, stats: result.stats ?? null })
    }

    /** Retorna a configuração atual de um aplicativo no formato esperado pelo formulário de edição. */
    async getCustomApp({ params, response }: HttpContext) {
        const service = await Service.query().where('service_name', params.name).first()
        if (!service) {
            return response.status(404).send({ error: `Serviço ${params.name} não encontrado` })
        }
        // Aplicativos personalizados e do catálogo podem ser editados; serviços de dependência ocultos (por exemplo, Qdrant) não podem.
        if (service.is_dependency_service) {
            return response.status(403).send({ error: 'Este serviço não pode ser editado.' })
        }
        return response.send({ success: true, app: this.parseCustomContainerConfig(service) })
    }

    /** Reconfigura um aplicativo: valida e verifica a segurança, salva a nova configuração e recria o contêiner.
     * Funciona para aplicativos personalizados e do catálogo (pré-configurados). A edição de um aplicativo do catálogo o marca
     * como modificado pelo usuário, para que o seeder pare de sobrescrever as alterações feitas. */
    async updateCustomApp({ request, response }: HttpContext) {
        const payload = await request.validateUsing(updateCustomAppValidator)

        const service = await Service.query().where('service_name', payload.service_name).first()
        if (!service) {
            return response.status(404).send({ success: false, message: `Serviço ${payload.service_name} não encontrado` })
        }
        // Aplicativos personalizados e do catálogo podem ser editados; serviços de dependência ocultos (por exemplo, Qdrant) não podem.
        if (service.is_dependency_service) {
            return response.status(403).send({ success: false, message: 'Este serviço não pode ser editado.' })
        }

        // Rejeita portas do host duplicadas na solicitação.
        const hostPorts = (payload.ports ?? []).map((p) => p.host)
        const duplicateHostPorts = [...new Set(hostPorts.filter((p, i) => hostPorts.indexOf(p) !== i))]
        if (duplicateHostPorts.length) {
            return response.status(422).send({
                success: false,
                message: `Porta(s) do host duplicada(s): ${duplicateHostPorts.join(', ')}. Cada porta do host pode ser mapeada para apenas um contêiner.`,
            })
        }

        // Proteções de segurança (mesmas regras da criação).
        const guard = evaluateCustomApp({ image: payload.image, volumes: payload.volumes })
        if (guard.blocked.length) {
            return response.status(422).send({ success: false, message: guard.blocked.join(' '), blocked: guard.blocked })
        }
        if (!payload.force && guard.warnings.length) {
            return response.status(409).send({ success: false, message: guard.warnings.join(' '), warnings: guard.warnings })
        }

        // Conflitos de portas — ignora, porém, as portas já utilizadas pelo próprio contêiner do aplicativo.
        if (!payload.force && hostPorts.length) {
            const { conflicts } = await this.dockerService.checkPortConflicts(hostPorts)
            const external = conflicts.filter((c) => c.usedBy !== payload.service_name)
            if (external.length) {
                return response.status(409).send({
                    success: false,
                    message: `Conflito de portas: ${external
                        .map((c) => `${c.port} (in use by ${c.usedBy})`)
                        .join(', ')}.`,
                    portConflicts: external,
                })
            }
        }

        // Mescla os campos do formulário à configuração existente do aplicativo, em vez de reconstruí-la do zero,
        // para preservar as configurações avançadas fornecidas por um aplicativo do catálogo (solicitações de dispositivos GPU, variáveis de ambiente especiais etc.)
        // durante a edição.
        // Preserva um esquema explícito (por exemplo, ui_location "https:8480") durante a edição; caso contrário, um
        // link de abertura de um aplicativo que usa TLS voltaria silenciosamente para HTTP após qualquer reconfiguração.
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
        // Marca como modificado pelo usuário para que o seeder não sobrescreva a configuração do aplicativo em execuções futuras.
        service.is_user_modified = true
        await service.save()

        const result = await this.dockerService.recreateCustomAppContainer(payload.service_name)
        if (result.success) {
            return response.send({ success: true, message: result.message, service_name: payload.service_name })
        }
        return response.status(400).send({ success: false, message: result.message })
    }

    /**
     * Cria uma configuração de contêiner Docker (HostConfig + ExposedPorts + Env) a partir dos dados do formulário,
     * aplicando limites padrão de recursos. É compartilhada pela criação e atualização para manter ambos os fluxos consistentes.
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

        // Limites de recursos impedem que um contêiner personalizado descontrolado esgote os recursos do host. A memória é medida em bytes;
        // NanoCpus corresponde a CPUs × 1e9. Os padrões são generosos e podem ser alterados pelo usuário.
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
     * Mescla os dados do formulário de aplicativo personalizado à configuração de contêiner *existente* do aplicativo. É usado na edição para que
     * a edição de um aplicativo do catálogo altere somente os campos expostos no formulário (imagem/portas/volumes/variáveis de ambiente e,
     * se fornecidos, limites de recursos), preservando todo o restante (GPU DeviceRequests, User, chaves personalizadas de HostConfig etc.). Ao contrário de
     * buildCustomContainerConfig, os limites de recursos NÃO recebem valores padrão aqui — um aplicativo do catálogo que não tinha limites continuará sem eles, a menos que o usuário defina algum.
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
        // Faz uma cópia profunda para nunca modificar a origem analisada.
        const containerConfig: Record<string, any> = JSON.parse(JSON.stringify(parsed ?? {}))
        containerConfig.HostConfig = containerConfig.HostConfig ?? {}
        // Mantém uma política de reinicialização caso a configuração existente não tenha uma.
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

        // Altera os limites de recursos somente quando o usuário os define explicitamente; caso contrário, preserva os valores existentes ou a ausência de limites.
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

    /** Operação inversa de buildCustomContainerConfig: converte um Service armazenado para o formato editável do formulário. */
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
