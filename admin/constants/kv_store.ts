import { KVStoreKey } from "../types/kv_store.js";

export const SETTINGS_KEYS: KVStoreKey[] = [
    'chat.suggestionsEnabled',
    'chat.lastModel',
    'ui.hasVisitedEasySetup',
    'ui.theme',
    'system.earlyAccess',
    'system.internetStatusTestUrl',
    'ai.assistantCustomName',
    'ai.remoteOllamaUrl',
    'ai.ollamaFlashAttention',
    'ai.autoThinking',
    'rag.defaultIngestPolicy',
    'autoUpdate.enabled',
    'autoUpdate.windowStart',
    'autoUpdate.windowEnd',
    'autoUpdate.cooloffHours',
    'appAutoUpdate.enabled',
    'contentAutoUpdate.enabled',
    'contentAutoUpdate.windowStart',
    'contentAutoUpdate.windowEnd',
    'contentAutoUpdate.cooloffHours',
    'contentAutoUpdate.maxBytesPerWindow',
    'benchmark.rerunBannerDismissed',
    'apps.homebox.apiKeyPepper'
];