import { KVStoreKey } from '../types/kv_store.js'

export const SETTINGS_KEYS: KVStoreKey[] = [
  'chat.suggestionsEnabled',
  'chat.lastModel',
  'ui.hasVisitedEasySetup',
  'ui.theme',
  'system.earlyAccess',
  'ai.assistantCustomName',
  'ai.remoteOllamaUrl',
  'ai.provider',
  'ai.macNativeWorkerUrl',
  'ai.macNativeModelRoot',
  'ai.ollamaFlashAttention',
  'rag.defaultIngestPolicy',
]
