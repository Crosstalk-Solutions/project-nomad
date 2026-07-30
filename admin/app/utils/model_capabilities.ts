import type { ModelVisionCapability } from '../../types/ollama.js'

export type ModelCapabilities = {
  thinking: boolean
  vision: ModelVisionCapability
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
