import { readdir, stat, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { MapRegionService } from './map_region_service.js'
import type {
  MapRegionComponent,
  MapRegionComponentState,
  MapRegionOperation,
  MapRegionOperations,
  MapRegionBuildStatus,
} from '../../types/map_regions.js'
import {
  operationType,
  applyBuilderProgress,
  regionOperationErrorCode,
  clearQueuedMeasurements,
} from '../utils/map_region_progress.js'
import { MapRegionPhaseHistory } from './map_region_phase_history.js'

export interface RegionQueueEntry {
  state: 'active' | 'waiting' | 'delayed' | 'failed' | 'completed' | 'unknown'
  regionId: string
  component: MapRegionComponent
  operationId?: string
  waitingFor?: string
  position?: number
}
type QueueSnapshot = () => Promise<RegionQueueEntry[]>
type RecordState = Awaited<ReturnType<MapRegionService['record']>>
const samples = new Map<
  string,
  { at: number; bytes: number; lastProgressAt?: string; rate?: number }
>()
const inflight = new Map<string, Promise<MapRegionOperations>>()
const cached = new Map<string, { at: number; value: MapRegionOperations }>()
const queuePending = new Map<string, Promise<RegionQueueEntry[]>>()
const safeDate = (value?: string) =>
  value && Number.isFinite(Date.parse(value)) ? value : undefined
const numeric = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

/** Lightweight, read-only activity projection. Polling never changes job progress. */
export class MapRegionOperationService {
  constructor(
    private regions = new MapRegionService(),
    private queues: QueueSnapshot = async () => [],
    private clock = Date.now
  ) {}

  private publicState(record: RecordState): MapRegionComponentState {
    const fields = [
      'status',
      'updating',
      'progress',
      'bytesDownloaded',
      'totalBytes',
      'error',
      'installedVersion',
      'installedBytes',
      'records',
      'dataDate',
      'operation',
    ] as const
    const state: any = {}
    for (const key of fields) if (record[key] !== undefined) state[key] = record[key]
    return state
  }

  private async builder(record: RecordState): Promise<MapRegionBuildStatus | undefined> {
    if (!record.preparation) return undefined
    const base = (
      record.preparation.builderKind === 'progress'
        ? process.env.MAP_REGION_PREPARATION_BUILDER_URL
        : process.env.MAP_REGION_BUILDER_URL
    )?.replace(/\/$/, '')
    if (!base) throw new Error('Preparation service unavailable')
    const response = await fetch(base + '/build/' + record.preparation.jobId, {
      signal: AbortSignal.timeout(1800),
    })
    if (response.status === 404) return undefined
    if (!response.ok) throw new Error('Preparation status unavailable')
    const status = (await response.json()) as MapRegionBuildStatus
    if (
      !['queued', 'preparing', 'completed', 'failed', 'cancelled', 'cancelling'].includes(
        status.status
      )
    )
      throw new Error('Unknown preparation status')
    return status
  }

  private async legacyActivity(
    regionId: string,
    component: MapRegionComponent,
    record: RecordState,
    operation: MapRegionOperation
  ) {
    if (!record.preparation || !/^[a-z0-9-]{1,100}$/.test(record.preparation.jobId)) return
    const directory = join(this.regions.root, 'staging', record.preparation.jobId)
    const artifact = resolve(this.regions.root, record.preparation.relativePath)
    if (resolve(artifact, '..') !== directory) return
    if ((await realpath(directory).catch(() => undefined)) !== directory) return
    const paths = [
      artifact,
      ...(component === 'search' ? [join(directory, 'search.locations')] : []),
    ]
    let bytes = 0,
      modified = 0
    for (const file of paths) {
      const info = await stat(file).catch(() => undefined)
      if (info?.isFile()) {
        bytes += info.size
        modified = Math.max(modified, info.mtimeMs)
      }
    }
    if (!bytes) return
    const key = this.regions.root + '|' + regionId + '|' + component + '|' + operation.id
    const now = this.clock(),
      previous = samples.get(key)
    operation.workBytes = bytes
    const delta = previous ? bytes - previous.bytes : 0
    const elapsed = previous ? (now - previous.at) / 1000 : 0
    const changed = previous && delta > 0
    const lastProgressAt = changed
      ? new Date(now).toISOString()
      : previous?.lastProgressAt || (modified ? new Date(modified).toISOString() : undefined)
    operation.lastProgressAt = lastProgressAt
    if (changed && elapsed > 0) {
      const rate = delta / elapsed
      operation.workRateBytesPerSecond = previous?.rate ? 0.35 * rate + 0.65 * previous.rate : rate
      operation.activityEvidence = 'output_growth'
    }
    if (lastProgressAt && now - Date.parse(lastProgressAt) > 120000)
      operation.activity = 'no_recent_progress'
    samples.set(key, { at: now, bytes, lastProgressAt, rate: operation.workRateBytesPerSecond })
    while (samples.size > 200) samples.delete(samples.keys().next().value!)
  }

  async snapshot(): Promise<MapRegionOperations> {
    const key = this.regions.root
    const previous = cached.get(key)
    if (previous && this.clock() - previous.at < 1200) return previous.value
    const active = inflight.get(key)
    if (active) return active
    const work = this.read()
    inflight.set(key, work)
    try {
      const value = await work
      cached.set(key, { at: this.clock(), value })
      return value
    } finally {
      if (inflight.get(key) === work) inflight.delete(key)
    }
  }

  private async read(): Promise<MapRegionOperations> {
    const now = this.clock()
    let entries: RegionQueueEntry[] = [],
      queueAvailable = true
    let pending = queuePending.get(this.regions.root)
    if (!pending) {
      pending = this.queues()
      queuePending.set(this.regions.root, pending)
      void pending
        .finally(() => {
          if (queuePending.get(this.regions.root) === pending)
            queuePending.delete(this.regions.root)
        })
        .catch(() => {})
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      entries = await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Queue status unavailable')), 1800)
        }),
      ])
    } catch {
      queueAvailable = false
    } finally {
      if (timer) clearTimeout(timer)
    }
    const ids = await readdir(join(this.regions.root, 'state')).catch(() => [] as string[])
    const operations: MapRegionOperations['operations'] = []
    for (const id of ids) {
      if (!/^[a-z0-9][a-z0-9_-]{0,119}$/.test(id)) continue
      const components: Partial<Record<MapRegionComponent, MapRegionComponentState>> = {}
      let name = id
      for (const component of ['routing'] as MapRegionComponent[]) {
        const record = await this.regions.inspectRecord(id, component)
        if (
          !record ||
          !['queued', 'downloading', 'preparing', 'cancelling', 'failed', 'cancelled'].includes(
            record.status
          )
        )
          continue
        name = record.region?.name || record.installed?.name || name
        const state = this.publicState(record)
        let operation: MapRegionOperation = {
          ...record.operation,
          id: record.operationId || record.operation?.id || 'legacy-' + id + '-' + component,
          type: operationType(record),
          phase:
            record.status === 'installed'
              ? 'ready'
              : record.status === 'preparing'
                ? component === 'search'
                  ? 'building_search'
                  : 'building_routing'
                : record.status,
          telemetry: record.operation?.telemetry || 'legacy',
          sourceMode:
            record.searchUpgrade || record.cachedSource ? 'cached' : record.operation?.sourceMode,
          activity: ['queued'].includes(record.status) ? 'waiting' : 'active',
          retryable: ['failed', 'cancelled'].includes(record.status),
        }
        if (
          record.operation?.phase &&
          !['failed', 'cancelled', 'cancelling', 'installed'].includes(record.status)
        )
          operation.phase = record.operation.phase
        const queue = entries.find(
          (entry) =>
            entry.regionId === id &&
            entry.component === component &&
            (!entry.operationId || entry.operationId === record.operationId)
        )
        if (
          queue &&
          ['waiting', 'delayed'].includes(queue.state) &&
          !['failed', 'cancelled', 'cancelling'].includes(record.status)
        ) {
          state.status = 'queued'
          operation.phase = 'queued'
          operation.activity = 'waiting'
          operation.queueReason =
            queue.state === 'delayed'
              ? 'retry_delay'
              : queue.waitingFor
                ? 'another_operation'
                : undefined
          operation.waitingFor = queue.waitingFor
          operation.queuePosition = queue.position
          operation.retryable = false
        } else if (record.preparation) {
          try {
            const build = await this.builder(record)
            operation.heartbeatAt = new Date(now).toISOString()
            if (build) {
              operation = applyBuilderProgress(operation, build)
              if (build.status === 'queued') {
                state.status = 'queued'
                operation.phase = 'queued'
                operation.activity = 'waiting'
                operation.queueReason = 'preparer_busy'
                operation.retryable = false
              } else if (
                build.status === 'preparing' &&
                ['failed', 'cancelled'].includes(record.status)
              ) {
                state.status = 'preparing'
                operation.phase = component === 'search' ? 'building_search' : 'building_routing'
                operation.retryable = false
              } else if (build.status === 'completed') operation.phase = 'validating'
              else if (['failed', 'cancelled'].includes(build.status)) {
                // A historical builder attempt can be terminal while its durable
                // operation is queued/recovering. Only the operation owner may
                // commit terminal component state; polling never resurrects it.
                if (!['failed', 'cancelled'].includes(record.status)) {
                  operation.activity = 'unavailable'
                  operation.phase = 'status_unavailable'
                  operation.errorCode = 'PREPARATION_RECONCILING'
                  operation.retryable = false
                }
              }
              if (!build.telemetryVersion && build.status === 'preparing')
                await this.legacyActivity(id, component, record, operation)
              if (
                build.telemetryVersion &&
                build.status === 'preparing' &&
                safeDate(build.lastProgressAt) &&
                now - Date.parse(build.lastProgressAt!) > 120000
              )
                operation.activity = 'no_recent_progress'
            } else {
              operation.activity = 'unavailable'
              operation.retryable = false
              operation.errorCode = 'PREPARATION_STATUS_MISSING'
            }
          } catch {
            operation.activity = 'unavailable'
            operation.retryable = false
            operation.errorCode = 'PREPARATION_STATUS_UNAVAILABLE'
          }
        }
        if (
          !queueAvailable &&
          ['queued', 'preparing', 'downloading', 'cancelling'].includes(record.status)
        ) {
          operation.activity = 'unavailable'
          operation.queueReason = 'queue_unavailable'
          operation.retryable = false
        }
        if (state.status === 'downloading') {
          operation.bytesTransferred = numeric(state.bytesDownloaded)
          operation.totalBytes = numeric(state.totalBytes)
          if (operation.lastProgressAt && now - Date.parse(operation.lastProgressAt) > 10000) {
            operation.rateBytesPerSecond = 0
            delete operation.etaSeconds
          }
          if (operation.lastProgressAt && now - Date.parse(operation.lastProgressAt) > 30000)
            operation.activity = 'no_recent_progress'
        } else {
          delete operation.rateBytesPerSecond
        }
        if (
          operation.telemetry === 'legacy' &&
          state.totalBytes &&
          state.bytesDownloaded === state.totalBytes
        )
          operation.transferComplete = true
        if (['failed', 'cancelled'].includes(state.status)) {
          operation.activity = 'waiting'
          operation.errorCode ||= regionOperationErrorCode(state.error)
        }
        if (operation.phase === 'queued') clearQueuedMeasurements(operation)
        operation.sourceFormat ||=
          record.cachedSourceDefinition?.format || record.region?.sources[component]?.format
        operation.sourceBytes ||=
          record.preparation?.source.size || record.cachedSource?.size || record.totalBytes
        await new MapRegionPhaseHistory(this.regions.root, this.clock)
          .estimate(component, operation)
          .catch(() => {})
        state.operation = operation
        components[component] = state
      }
      if (Object.keys(components).length) operations.push({ regionId: id, name, components })
    }
    return { operations, observedAt: new Date(now).toISOString() }
  }
}
