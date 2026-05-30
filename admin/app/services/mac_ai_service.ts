import KVStore from '#models/kv_store'
import type { MacAiProvider, MacNativeStatus } from '../../types/mac_ai.js'

export const DEFAULT_MAC_NATIVE_WORKER_URL = 'http://host.docker.internal:8765'

export class MacAiService {
  async getProvider(): Promise<MacAiProvider> {
    const value = await KVStore.getValue('ai.provider')
    if (value === 'remote' || value === 'native_mlx' || value === 'native_coreml') return value
    return 'ollama'
  }

  async getWorkerUrl(): Promise<string> {
    const value = await KVStore.getValue('ai.macNativeWorkerUrl')
    return typeof value === 'string' && value.trim()
      ? value.trim().replace(/\/$/, '')
      : DEFAULT_MAC_NATIVE_WORKER_URL
  }

  async configure(input: {
    provider: MacAiProvider
    workerUrl?: string | null
    modelRoot?: string | null
  }): Promise<{ success: true; message: string }> {
    await KVStore.setValue('ai.provider', input.provider)
    if (input.workerUrl !== undefined) {
      if (input.workerUrl && input.workerUrl.trim()) {
        await KVStore.setValue('ai.macNativeWorkerUrl', input.workerUrl.trim().replace(/\/$/, ''))
      } else {
        await KVStore.clearValue('ai.macNativeWorkerUrl')
      }
    }
    if (input.modelRoot !== undefined) {
      if (input.modelRoot && input.modelRoot.trim()) {
        await KVStore.setValue('ai.macNativeModelRoot', input.modelRoot.trim())
      } else {
        await KVStore.clearValue('ai.macNativeModelRoot')
      }
    }
    return { success: true, message: 'AI provider settings saved.' }
  }

  async status(): Promise<MacNativeStatus> {
    const provider = await this.getProvider()
    const url = await this.getWorkerUrl()
    const nativeProvider = provider === 'native_mlx' || provider === 'native_coreml'
    if (!nativeProvider) {
      return { configured: false, connected: false, active: false, provider, url, models: [] }
    }

    try {
      const [healthResponse, modelResponse] = await Promise.all([
        fetch(`${url}/health`, { signal: AbortSignal.timeout(2500) }),
        fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(2500) }),
      ])
      const modelsPayload: any = modelResponse.ok ? await modelResponse.json() : { data: [] }
      const models = Array.isArray(modelsPayload?.data)
        ? modelsPayload.data.map((model: any) => ({
            id: String(model.id),
            name: String(model.name || model.id),
            backend: model.backend === 'coreml' ? 'coreml' : 'mlx',
            path: typeof model.path === 'string' ? model.path : undefined,
            usableForChat: Boolean(model.usable_for_chat ?? model.usableForChat),
            notes: typeof model.notes === 'string' ? model.notes : undefined,
          }))
        : []
      return {
        configured: true,
        connected: healthResponse.ok,
        active: healthResponse.ok,
        provider,
        url,
        models,
      }
    } catch (error) {
      return {
        configured: true,
        connected: false,
        active: false,
        provider,
        url,
        models: [],
        message: error instanceof Error ? error.message : 'Native Mac AI worker is unreachable.',
      }
    }
  }
}
