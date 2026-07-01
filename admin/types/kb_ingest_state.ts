export const KB_INGEST_STATES = [
  'pending_decision',
  'indexed',
  'browse_only',
  'failed',
  'stalled',
] as const

export type KbIngestStateValue = (typeof KB_INGEST_STATES)[number]
