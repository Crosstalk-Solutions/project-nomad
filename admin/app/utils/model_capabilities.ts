import type { ModelVisionCapability } from '../../types/ollama.js'

export type ModelCapabilities = {
  thinking: boolean
  vision: ModelVisionCapability
}

export type ModelCapabilityProbes = {
  ollamaShow: () => Promise<unknown>
  llamaProps: () => Promise<unknown>
}

export type InstalledModelMetadata = {
  name: string
  size: number
  capabilities?: string[]
}

export function capabilitiesFromOllamaShow(value: unknown): ModelCapabilities | null {
  if (!value || typeof value !== 'object') return null
  const capabilities = (value as { capabilities?: unknown }).capabilities
  if (!Array.isArray(capabilities) || !capabilities.every((item) => typeof item === 'string')) {
    return null
  }

  return {
    thinking: capabilities.includes('thinking'),
    vision: capabilities.includes('vision') ? 'supported' : 'unsupported',
  }
}

export function visionCapabilityFromLlamaProps(value: unknown): ModelVisionCapability | null {
  if (!value || typeof value !== 'object') return null
  const modalities = (value as { modalities?: unknown }).modalities
  if (modalities && typeof modalities === 'object' && !Array.isArray(modalities)) {
    const vision = (modalities as { vision?: unknown }).vision
    return typeof vision === 'boolean' ? (vision ? 'supported' : 'unsupported') : null
  }
  if (Array.isArray(modalities) && modalities.every((item) => typeof item === 'string')) {
    return modalities.includes('image') || modalities.includes('vision')
      ? 'supported'
      : 'unsupported'
  }
  return null
}

export async function resolveModelCapabilities(
  advertisedMetadata: unknown,
  probes: ModelCapabilityProbes
): Promise<ModelCapabilities | null> {
  const advertised = capabilitiesFromOllamaShow(advertisedMetadata)
  if (advertised) return advertised

  try {
    const ollama = capabilitiesFromOllamaShow(await probes.ollamaShow())
    if (ollama) return ollama
  } catch {}

  try {
    const vision = visionCapabilityFromLlamaProps(await probes.llamaProps())
    if (vision) return { thinking: false, vision }
  } catch {}

  return null
}

export function installedModelsFromOpenAIResponse(value: unknown): InstalledModelMetadata[] {
  if (!value || typeof value !== 'object') return []
  const data = (value as { data?: unknown }).data
  if (!Array.isArray(data)) return []

  return data.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const { id, capabilities } = entry as { id?: unknown; capabilities?: unknown }
    if (typeof id !== 'string') return []

    const model: InstalledModelMetadata = { name: id, size: 0 }
    if (
      Array.isArray(capabilities) &&
      capabilities.every((capability) => typeof capability === 'string')
    ) {
      model.capabilities = capabilities
    }
    return [model]
  })
}
