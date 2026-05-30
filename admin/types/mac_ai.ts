export type MacAiProvider = 'ollama' | 'remote' | 'native_mlx' | 'native_coreml'

export type MacNativeModel = {
  id: string
  name: string
  backend: 'mlx' | 'coreml'
  path?: string
  usableForChat: boolean
  notes?: string
}

export type MacNativeStatus = {
  configured: boolean
  connected: boolean
  url: string
  provider: MacAiProvider
  active: boolean
  models: MacNativeModel[]
  message?: string
}
