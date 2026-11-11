import type {
  MapRegionComponent,
  MapRegionComponentState,
  MapRegionOperation,
  MapRegionBuildStatus,
} from '../../types/map_regions.js'

export const operationType = (state: {
  searchUpgrade?: boolean
  updating?: boolean
  operation?: MapRegionOperation
}): MapRegionOperation['type'] =>
  state.operation?.type ||
  (state.searchUpgrade ? 'index_upgrade' : state.updating ? 'source_update' : 'install')

export function regionOperationErrorCode(message?: string) {
  if (!message) return undefined
  if (/stopped sending|timed?\s*out|timeout/i.test(message)) return 'TIMEOUT'
  if (/disk|free space|ENOSPC/i.test(message)) return 'INSUFFICIENT_SPACE'
  if (/checksum|integrity|corrupt/i.test(message)) return 'SOURCE_INTEGRITY'
  if (/interrupted/i.test(message)) return 'INTERRUPTED'
  if (/public source|fetch failed|ECONN|network/i.test(message)) return 'SOURCE_UNAVAILABLE'
  return 'PREPARATION_FAILED'
}

export function newRegionOperation(
  id: string,
  type: MapRegionOperation['type'],
  previous?: MapRegionOperation,
  cached = false
): MapRegionOperation {
  const now = new Date().toISOString()
  return {
    id,
    type,
    phase: 'queued',
    queuedAt: now,
    phaseStartedAt: now,
    sourceMode: cached ? 'cached' : 'download',
    attempt: (previous?.attempt || 0) + 1,
    telemetry: 'reported',
    activity: 'waiting',
    retryable: false,
  }
}

/** A heartbeat is evidence of liveness, not of advancement. Never use record mtime. */
export function persistRegionProgress(
  previous: MapRegionComponentState,
  next: MapRegionComponentState,
  id: string,
  component: MapRegionComponent,
  now = Date.now()
): MapRegionOperation {
  const prior = previous.operation?.id === id ? previous.operation : undefined
  const candidate = next.operation?.id === id ? next.operation : prior
  const phase = ['failed', 'cancelled', 'cancelling'].includes(next.status)
    ? next.status
    : next.status === 'installed'
      ? 'ready'
      : candidate?.phase ||
        (next.status === 'preparing'
          ? component === 'search'
            ? 'building_search'
            : 'building_routing'
          : next.status)
  const result: MapRegionOperation = {
    ...prior,
    ...candidate,
    id,
    type: candidate?.type || operationType(next),
    phase,
    telemetry: candidate?.telemetry || 'reported',
  }
  const phaseChanged = prior?.phase !== phase || prior?.detail !== result.detail
  const advanced =
    phaseChanged ||
    (next.bytesDownloaded ?? 0) > (previous.bytesDownloaded ?? 0) ||
    (result.recordsProcessed ?? 0) > (prior?.recordsProcessed ?? 0)
  if (phaseChanged) {
    result.phaseStartedAt = new Date(now).toISOString()
    delete result.rateBytesPerSecond
    delete result.etaSeconds
    delete result.phaseEtaMinSeconds
    delete result.phaseEtaMaxSeconds
    delete result.etaBasis
    delete result.etaSamples
    for (const field of [
      'recordsProcessed',
      'recordsTotal',
      'recordsPerSecond',
      'stageBytesProcessed',
      'stageTotalBytes',
      'stageRateBytesPerSecond',
    ] as const)
      if (candidate?.[field] === undefined) delete result[field]
  } else if (prior?.phaseStartedAt) result.phaseStartedAt = prior.phaseStartedAt
  if (advanced && !result.lastProgressAt) result.lastProgressAt = new Date(now).toISOString()
  if (advanced && result.lastProgressAt === prior?.lastProgressAt)
    result.lastProgressAt = new Date(now).toISOString()
  if (phase === 'downloading') {
    result.bytesTransferred = next.bytesDownloaded ?? result.bytesTransferred ?? 0
    result.totalBytes = next.totalBytes ?? result.totalBytes
    const elapsed = prior?.lastProgressAt ? (now - Date.parse(prior.lastProgressAt)) / 1000 : 0
    const delta = result.bytesTransferred - (prior?.bytesTransferred ?? result.bytesTransferred)
    if (!phaseChanged && elapsed > 0 && delta > 0) {
      const rate = delta / elapsed
      result.rateBytesPerSecond = prior?.rateBytesPerSecond
        ? 0.35 * rate + 0.65 * prior.rateBytesPerSecond
        : rate
      if (result.totalBytes)
        result.etaSeconds = Math.max(
          0,
          (result.totalBytes - result.bytesTransferred) / result.rateBytesPerSecond
        )
    }
  }
  result.activity = ['queued', 'waiting_retry'].includes(phase) ? 'waiting' : 'active'
  if (phase === 'queued') clearQueuedMeasurements(result)
  result.retryable = ['failed', 'cancelled'].includes(next.status)
  if (next.status === 'failed') result.errorCode = regionOperationErrorCode(next.error)
  return result
}

export function applyBuilderProgress(
  operation: MapRegionOperation,
  status: MapRegionBuildStatus
): MapRegionOperation {
  const next = {
    ...operation,
    telemetry: status.telemetryVersion ? ('reported' as const) : ('legacy' as const),
  }
  if (!status.telemetryVersion) return next
  if (status.phase !== operation.phase || status.detail !== operation.detail) {
    delete next.recordsProcessed
    delete next.recordsTotal
    delete next.recordsPerSecond
    delete next.stageBytesProcessed
    delete next.stageTotalBytes
    delete next.stageRateBytesPerSecond
    delete next.etaSeconds
    delete next.phaseEtaMinSeconds
    delete next.phaseEtaMaxSeconds
    delete next.etaBasis
    delete next.etaSamples
  }
  const mapping = {
    phase: 'phase',
    detail: 'detail',
    queuedAt: 'queuedAt',
    startedAt: 'startedAt',
    heartbeatAt: 'heartbeatAt',
    lastProgressAt: 'lastProgressAt',
    recordsProcessed: 'recordsProcessed',
    recordsTotal: 'recordsTotal',
    recordsPerSecond: 'recordsPerSecond',
    bytesProcessed: 'stageBytesProcessed',
    totalBytes: 'stageTotalBytes',
    bytesPerSecond: 'stageRateBytesPerSecond',
    etaSeconds: 'etaSeconds',
  } as const
  for (const [from, to] of Object.entries(mapping)) {
    const value = status[from as keyof MapRegionBuildStatus]
    if (value !== undefined) (next as any)[to] = value
  }
  if (status.status === 'queued') clearQueuedMeasurements(next)
  return next
}

/** A waiting preparer has not started the old attempt's step. */
export function clearQueuedMeasurements(operation: MapRegionOperation) {
  for (const field of [
    'startedAt',
    'detail',
    'recordsProcessed',
    'recordsTotal',
    'recordsPerSecond',
    'stageBytesProcessed',
    'stageTotalBytes',
    'stageRateBytesPerSecond',
    'rateBytesPerSecond',
    'etaSeconds',
    'phaseEtaMinSeconds',
    'phaseEtaMaxSeconds',
    'etaBasis',
    'etaSamples',
    'workBytes',
    'workRateBytesPerSecond',
    'activityEvidence',
  ] as const)
    delete operation[field]
}
