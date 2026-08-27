import KVStore from '#models/kv_store'
import { BenchmarkService } from '#services/benchmark_service'
import { ContextWindowService } from '#services/context_window_service'
import { MapService } from '#services/map_service'
import { OllamaService } from '#services/ollama_service'
import { SystemService } from '#services/system_service'
import { getSettingSchema, updateSettingSchema, validateSettingValue } from '#validators/settings'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import { parseMinRelevance } from '../utils/misc.js'
import { RAG_MIN_FINAL_SCORE } from '../../constants/ollama.js'

@inject()
export default class SettingsController {
  constructor(
    private systemService: SystemService,
    private mapService: MapService,
    private benchmarkService: BenchmarkService,
    private ollamaService: OllamaService,
    private contextWindowService: ContextWindowService
  ) {}

  async system({ inertia }: HttpContext) {
    const systemInfo = await this.systemService.getSystemInfo()
    return inertia.render('settings/system', {
      system: {
        info: systemInfo,
      },
    })
  }

  async apps({ inertia }: HttpContext) {
    const services = await this.systemService.getServices({ installedOnly: false })
    return inertia.render('settings/apps', {
      system: {
        services,
      },
    })
  }

  async legal({ inertia }: HttpContext) {
    return inertia.render('settings/legal')
  }

  async support({ inertia }: HttpContext) {
    return inertia.render('settings/support')
  }

  async maps({ inertia }: HttpContext) {
    const baseAssetsCheck = await this.mapService.ensureBaseAssets()
    const [regionFiles, worldBasemapExists] = await Promise.all([
      this.mapService.listRegions(),
      this.mapService.checkWorldBasemapExists(),
    ])
    return inertia.render('settings/maps', {
      maps: {
        baseAssetsExist: baseAssetsCheck,
        worldBasemapExists,
        regionFiles: regionFiles.files,
      },
    })
  }

  async models({ inertia }: HttpContext) {
    const availableModels = await this.ollamaService.getAvailableModels({
      sort: 'pulls',
      recommendedOnly: false,
      query: null,
      limit: 15,
    })
    const installedModels = await this.ollamaService.getModels().catch(() => [])
    const chatSuggestionsEnabled = await KVStore.getValue('chat.suggestionsEnabled')
    const aiAssistantCustomName = await KVStore.getValue('ai.assistantCustomName')
    const remoteOllamaUrl = await KVStore.getValue('ai.remoteOllamaUrl')
    const ollamaFlashAttention = await KVStore.getValue('ai.ollamaFlashAttention')
    const autoThinking = await KVStore.getValue('ai.autoThinking')
    const tasksModel = await KVStore.getValue('ai.tasksModel')
    const ragEnabled = await KVStore.getValue('rag.enabled')
    const contextWindow = await KVStore.getValue('ai.contextWindow')
    const minRelevance = await KVStore.getValue('rag.minRelevance')
    // Resolved window per installed model, so the setting shows what "Auto"
    // actually produced rather than leaving the user to guess. Best-effort:
    // a model whose metadata can't be read simply doesn't get a badge.
    const resolvedContextWindows: Record<string, number> = {}
    await Promise.all(
      (installedModels || []).map(async (model) => {
        try {
          resolvedContextWindows[model.name] = await this.contextWindowService.windowFor(model.name)
        } catch {
          /* leave unset */
        }
      })
    )
    return inertia.render('settings/models', {
      models: {
        availableModels: availableModels?.models || [],
        installedModels: installedModels || [],
        settings: {
          chatSuggestionsEnabled: chatSuggestionsEnabled ?? false,
          aiAssistantCustomName: aiAssistantCustomName ?? '',
          remoteOllamaUrl: remoteOllamaUrl ?? '',
          ollamaFlashAttention: ollamaFlashAttention ?? true,
          autoThinking: autoThinking ?? false,
          tasksModel: tasksModel ?? '',
          ragEnabled: ragEnabled ?? true,
          contextWindow: contextWindow ?? 'auto',
          // Sent as the resolved number so the select can match an option
          // without duplicating the "unset means the default" rule in the UI.
          minRelevance: parseMinRelevance(minRelevance, RAG_MIN_FINAL_SCORE),
        },
        resolvedContextWindows,
      },
    })
  }

  async update({ inertia }: HttpContext) {
    const updateInfo = await this.systemService.checkLatestVersion()
    return inertia.render('settings/update', {
      system: {
        updateAvailable: updateInfo.updateAvailable,
        latestVersion: updateInfo.latestVersion,
        currentVersion: updateInfo.currentVersion,
      },
    })
  }

  async zim({ inertia }: HttpContext) {
    return inertia.render('settings/zim/index')
  }

  async zimRemote({ inertia }: HttpContext) {
    return inertia.render('settings/zim/remote-explorer')
  }

  async creatorPacks({ inertia }: HttpContext) {
    return inertia.render('settings/creator-packs')
  }

  async benchmark({ inertia }: HttpContext) {
    const latestResult = await this.benchmarkService.getLatestResult()
    const status = this.benchmarkService.getStatus()
    return inertia.render('settings/benchmark', {
      benchmark: {
        latestResult,
        status: status.status,
        currentBenchmarkId: status.benchmarkId,
      },
    })
  }

  async advanced({ inertia }: HttpContext) {
    // When the env var is set it always takes precedence over the stored value,
    // so surface that to the UI to disable the field and explain the override.
    const envOverride = Boolean(env.get('INTERNET_STATUS_TEST_URL')?.trim())
    const internetStatusTestUrl = await KVStore.getValue('system.internetStatusTestUrl')
    return inertia.render('settings/advanced', {
      advanced: {
        internetStatusTestUrl: internetStatusTestUrl ?? '',
        internetStatusTestUrlEnvOverride: envOverride,
      },
    })
  }

  async getSetting({ request, response }: HttpContext) {
    const { key } = await getSettingSchema.validate({ key: request.qs().key });
    const value = await KVStore.getValue(key);
    return response.status(200).send({ key, value });
  }

  async updateSetting({ request, response }: HttpContext) {
    const reqData = await request.validateUsing(updateSettingSchema)
    const valueError = validateSettingValue(reqData.key, reqData.value)
    if (valueError) {
      return response.status(422).send({ success: false, message: valueError })
    }
    await this.systemService.updateSetting(reqData.key, reqData.value)
    return response.status(200).send({ success: true, message: 'Setting updated successfully' })
  }
}
