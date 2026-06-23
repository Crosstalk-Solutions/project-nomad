
export const KV_STORE_SCHEMA = {
  'chat.suggestionsEnabled':    'boolean',
  'chat.lastModel':             'string',
  'rag.docsEmbedded':           'boolean',
  'rag.defaultIngestPolicy':    'string',
  'system.updateAvailable':     'boolean',
  'system.latestVersion':       'string',
  'system.earlyAccess':         'boolean',
  'system.internetStatusTestUrl': 'string',
  'autoUpdate.enabled':         'boolean',
  'autoUpdate.windowStart':     'string',
  'autoUpdate.windowEnd':       'string',
  'autoUpdate.cooloffHours':    'string',
  'autoUpdate.lastAttemptAt':   'string',
  'autoUpdate.lastError':       'string',
  'autoUpdate.lastResult':      'string',
  'autoUpdate.consecutiveFailures': 'string',
  'autoUpdate.autoDisabledReason':  'string',
  'appAutoUpdate.enabled':          'boolean',
  'appAutoUpdate.lastAttemptAt':    'string',
  'appAutoUpdate.lastResult':       'string',
  'contentAutoUpdate.enabled':           'boolean',
  'contentAutoUpdate.windowStart':       'string',
  'contentAutoUpdate.windowEnd':         'string',
  'contentAutoUpdate.cooloffHours':      'string',
  'contentAutoUpdate.maxBytesPerWindow': 'string',
  'contentAutoUpdate.lastAttemptAt':     'string',
  'contentAutoUpdate.lastResult':        'string',
  'contentAutoUpdate.lastError':         'string',
  'contentAutoUpdate.consecutiveFailures': 'string',
  'contentAutoUpdate.autoDisabledReason':  'string',
  'contentAutoUpdate.windowBytesUsed':   'string',
  'contentAutoUpdate.windowResetAt':     'string',
  'ui.hasVisitedEasySetup':     'boolean',
  'ui.theme':                   'string',
  'ai.assistantCustomName':     'string',
  'gpu.type':                   'string',
  'ai.remoteOllamaUrl':         'string',
  'ai.ollamaFlashAttention':    'boolean',
  'ai.amdGpuAcceleration':      'boolean',
  'ai.amdHsaOverride':          'string',
  'ai.autoFixGpuPassthrough':   'boolean',
  'gpu.autoRemediatedAt':       'string',
  // Drug Reference v1 — export_date of the last successfully completed
  // openFDA drug-label ingest (e.g. "2026-06-06"). Written by
  // IngestDrugDataJob on final-part completion; read by the search page's
  // status panel to show "Last updated: <date>". Null when never ingested.
  'drugReference.lastUpdatedExportDate': 'string',
  // Drug Reference — two-step ingest download-state marker (no migration; status
  // lives in job data + this KV key). Written by DownloadDrugDataJob after the
  // LAST part lands on disk; a JSON string of DownloadStateMarker
  // ({ export_date, totalParts, parts: [{ index, name, path, bytes }],
  // completedAtMs }). Read by IngestDrugDataJob to rebuild the part list for a
  // manual "Ingest into search" run (no manifest, no re-download) and by the
  // service to gate POST /ingest. Parsed defensively (parseDownloadState) with a
  // null fallback — the key simply doesn't exist before the first download.
  // Cleared after a full ingest succeeds (when the on-disk parts are deleted).
  'drugReference.downloadState': 'string',
} as const

type KVTagToType<T extends string> = T extends 'boolean' ? boolean : string

export type KVStoreKey = keyof typeof KV_STORE_SCHEMA
export type KVStoreValue<K extends KVStoreKey> = KVTagToType<(typeof KV_STORE_SCHEMA)[K]>
