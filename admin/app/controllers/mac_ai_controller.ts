import { MacAiService } from '#services/mac_ai_service'
import { RagService } from '#services/rag_service'
import { assertNotCloudMetadataUrl } from '#validators/common'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import type { MacAiProvider } from '../../types/mac_ai.js'
import Service from '#models/service'
import KVStore from '#models/kv_store'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import logger from '@adonisjs/core/services/logger'

@inject()
export default class MacAiController {
  constructor(
    private macAiService: MacAiService,
    private ragService: RagService
  ) {}

  async status({ response }: HttpContext) {
    return response.status(200).json(await this.macAiService.status())
  }

  async configure({ request, response }: HttpContext) {
    const provider = request.input('provider', 'ollama') as MacAiProvider
    if (!['ollama', 'remote', 'native_mlx', 'native_coreml'].includes(provider)) {
      return response.status(400).json({ success: false, message: 'Unsupported AI provider.' })
    }

    const workerUrl = request.input('workerUrl', undefined) as string | null | undefined
    if (workerUrl && workerUrl.trim()) {
      try {
        assertNotCloudMetadataUrl(workerUrl)
      } catch (error) {
        return response.status(400).json({
          success: false,
          message: error instanceof Error ? error.message : 'Invalid native worker URL.',
        })
      }
    }

    const result = await this.macAiService.configure({
      provider,
      workerUrl,
      modelRoot: request.input('modelRoot', undefined),
    })

    if (provider === 'native_mlx' || provider === 'native_coreml' || provider === 'remote') {
      const aiService = await Service.query().where('service_name', SERVICE_NAMES.OLLAMA).first()
      if (aiService) {
        aiService.installed = true
        aiService.installation_status = 'idle'
        await aiService.save()
      }
      await KVStore.setValue('chat.suggestionsEnabled', false)
      this.ragService.discoverNomadDocs().catch((error) => {
        logger.error('[MacAiController] Failed to discover Nomad docs:', error)
      })
    }

    return response.status(200).json(result)
  }
}
