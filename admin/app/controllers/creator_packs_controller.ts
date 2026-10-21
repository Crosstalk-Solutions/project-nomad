import { CreatorPackService } from '#services/creator_pack_service'
import { DownloadService } from '#services/download_service'
import { QueueService } from '#services/queue_service'
import logger from '@adonisjs/core/services/logger'
import type { HttpContext } from '@adonisjs/core/http'

export default class CreatorPacksController {
  private creatorPackService = new CreatorPackService()

  /**
   * Catálogo com o status de cada pacote, além do progresso em tempo real
   * de quaisquer downloads de pacotes em andamento (tarefas de download ZIM —
   * filtradas no lado do cliente por collection_ref quando a interface precisar;
   * por enquanto, a lista bruta de tarefas ZIM é suficiente para acompanhar o progresso).
   */
  async index({ response }: HttpContext) {
    try {
      const configured = this.creatorPackService.isConfigured()
      const packs = await this.creatorPackService.listPacksWithStatus()
      const downloadService = new DownloadService(QueueService.getInstance())
      const downloads = await downloadService.listDownloadJobs('zim')
      return { configured, packs, downloads }
    } catch (error: any) {
      logger.error('[CreatorPacksController] Falha ao listar os pacotes de criadores:', error?.message || error)
      return response.status(500).send({ message: 'Falha ao carregar os pacotes de criadores' })
    }
  }

  async install({ params, response }: HttpContext) {
    const packId = params.id as string
    const result = await this.creatorPackService.installPack(packId)

    switch (result.code) {
      case 'dispatched':
        return response.status(202).send({
          message: 'Download do pacote iniciado',
          filename: result.filename,
        })
      case 'already_installed':
        return { message: 'O pacote já está instalado' }
      case 'already_downloading':
        return { message: 'O download do pacote já está em andamento' }
      case 'not_found':
        return response.status(404).send({ message: `Pacote de criador não encontrado: ${packId}` })
      case 'not_configured':
        return response.status(503).send({
          message: 'Os pacotes de criadores não estão configurados neste servidor',
        })
    }
  }

  async uninstall({ params, response }: HttpContext) {
    const packId = params.id as string
    const result = await this.creatorPackService.uninstallPack(packId)

    switch (result.code) {
      case 'uninstalled':
        return { message: 'Pacote desinstalado', filename: result.filename }
      case 'not_installed':
        return response.status(404).send({ message: `O pacote de criador não está instalado: ${packId}` })
    }
  }
}
