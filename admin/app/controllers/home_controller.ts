import { SystemService } from '#services/system_service'
import { DrugReferenceService } from '#services/drug_reference_service'
import logger from '@adonisjs/core/services/logger'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class HomeController {
    constructor(
        private systemService: SystemService,
    ) { }

    async index({ response }: HttpContext) {
        // Redireciona / para /home
        return response.redirect().toPath('/home');
    }

    async home({ inertia }: HttpContext) {
        const services = await this.systemService.getServices({ installedOnly: true });
        return inertia.render('home', {
            system: {
                services
            },
            // Controla a exibição dos blocos de Referência de Medicamentos /
            // "Quando usar o quê" de acordo com o estado de instalação do conjunto
            // de dados da FDA. Considera-se instalado quando a importação da categoria
            // selecionada chega ao estado 'ready' ou quando uma instalação está em
            // andamento (downloading/ingesting). Assim, o bloco aparece assim que
            // o usuário inicia a instalação e permanece visível durante o processo,
            // em vez de aparecer apenas no final.
            drugReferenceInstalled: await this.computeDrugReferenceInstalled(),
        })
    }

    /**
     * Retorna true quando o conjunto de dados de medicamentos da FDA para uso
     * offline está instalado ou em processo de instalação. Consulta o status da
     * importação em duas etapas: ready (totalmente instalado) ou uma fase ativa
     * (downloading/downloaded/ingesting). rowCount > 0 também cobre uma tabela
     * preenchida cujo histórico de tarefas foi removido.
     *
     * Nunca lança exceções: se a consulta do status falhar, oculta os blocos
     * (falha fechada) em vez de gerar um erro HTTP 500 no painel.
     */
    private async computeDrugReferenceInstalled(): Promise<boolean> {
        try {
            const status = await new DrugReferenceService().getIngestStatus()
            const installing =
                status.phase === 'downloading' ||
                status.phase === 'downloaded' ||
                status.phase === 'ingesting'
            return status.phase === 'ready' || installing || status.rowCount > 0
        } catch (err) {
            logger.error(
                `[HomeController] Falha ao verificar a instalação da referência de medicamentos: ${
                    err instanceof Error ? err.message : String(err)
                }`
            )
            return false
        }
    }
}
