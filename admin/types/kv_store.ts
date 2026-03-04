
export const KV_STORE_SCHEMA = {
  'chat.suggestionsEnabled': 'boolean',
  'rag.docsEmbedded':        'boolean',
  'system.updateAvailable':  'boolean',
  'system.latestVersion':    'string',
  'ui.hasVisitedEasySetup':  'boolean',
} as const

type KVTagToType<T extends string> = T extends 'boolean' ? boolean : string

export type KVStoreKey = keyof typeof KV_STORE_SCHEMA
export type KVStoreValue<K extends KVStoreKey> = KVTagToType<(typeof KV_STORE_SCHEMA)[K]>
