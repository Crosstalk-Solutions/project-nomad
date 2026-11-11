import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { mapRegionCapacity, mapRegionPreparationRequirement } from '../utils/map_region_capacity.js'
import type {
  MapRegionComponent,
  MapRegionComponentState,
  MapRegionDefinition,
  MapRegionInstalledComponent,
  MapRegionsState,
  MapRegionBuildStatus,
  MapRegionSource,
} from '../../types/map_regions.js'
import {
  newRegionOperation,
  persistRegionProgress,
  applyBuilderProgress,
  operationType,
} from '../utils/map_region_progress.js'
import {
  MapRegionError,
  mapRegionId,
  mapRegionComponent,
  mapRegionComponents,
  parseMapRegionCoverage,
  parseMapRegionCatalog,
  assertMapRegionRequestUrl,
} from '../utils/map_region_catalog.js'
import {
  regionProvider,
  attachLocalAssets,
  pendingRegionProvider,
} from '../utils/map_region_availability.js'
import { MapPackStore } from '../utils/map_pack_store.js'
import { MapRegionUpdateService } from './map_region_update_service.js'
import { refreshPublicRegionCatalog } from '../utils/map_region_public_catalog.js'
import { MAP_REGION_QUEUE } from '../utils/map_region_queue.js'
import { MapRegionPhaseHistory } from './map_region_phase_history.js'
import { withMapRegionLock } from '../utils/map_region_lock.js'
import {
  assertInstallableTerritory,
  isInstallableTerritory,
  mapRegionTerritory,
} from '../utils/map_region_territory.js'

type PreparedSource = {
  url: string
  resolvedUrl: string
  size: number
  sha256: string
  lastModified: string
  downloadedAt: string
  path: string
  etag?: string
}
type Preparation = {
  jobId: string
  relativePath: string
  source: PreparedSource
  builderKind?: 'search' | 'progress'
}
type RecordState = MapRegionComponentState & {
  operationId?: string
  cancelRequestedAt?: string
  installed?: MapRegionInstalledComponent
  region?: MapRegionDefinition
  preparation?: Preparation
  searchUpgrade?: boolean
  cachedSource?: PreparedSource
  cachedSourceDefinition?: MapRegionSource
  cachedCoverage?: MapRegionDefinition['coverage']
  cachedDataDate?: string
  recoveryQueue?: string
  workflow?: {
    id: string
    components: MapRegionComponent[]
    searchOperationId?: string
  }
  requiredSearchSchema?: number
}
const locks = new Map<string, Promise<void>>()
const busy = (status?: string) =>
  ['queued', 'downloading', 'preparing', 'cancelling'].includes(status ?? '')
const validRegionStatuses = new Set([
  'available',
  'queued',
  'downloading',
  'preparing',
  'installed',
  'failed',
  'cancelling',
  'cancelled',
])
const unreadableRegionState =
  'Local routing metadata could not be read. Restore this region’s state before retrying.'
class MapRegionCancelled extends MapRegionError {
  constructor() {
    super('The region operation was cancelled.', 409)
  }
}
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8'))
export async function regionAtomicJson(path: string, value: unknown) {
  await mkdir(resolve(path, '..'), { recursive: true })
  const temporary = path + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, JSON.stringify(value))
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}
export async function fileSha256(path: string, signal?: AbortSignal) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    signal?.throwIfAborted()
    hash.update(chunk)
  }
  return hash.digest('hex')
}

export class MapRegionService {
  static preparationConfigured() {
    return Boolean(
      process.env.MAP_REGION_PREPARATION_BUILDER_URL || process.env.MAP_REGION_BUILDER_URL
    )
  }

  readonly root: string
  readonly catalogPath: string
  constructor(
    root = process.env.MAP_REGIONS_PATH || '/app/storage/map-regions',
    catalogPath = process.env.MAP_REGIONS_CATALOG_PATH || '/app/resources/map-regions/catalog.json'
  ) {
    this.root = resolve(root)
    this.catalogPath = catalogPath
  }
  private builderBase(preparation?: Preparation) {
    if (
      preparation?.builderKind === 'progress' ||
      (!preparation && process.env.MAP_REGION_PREPARATION_BUILDER_URL)
    )
      return (process.env.MAP_REGION_PREPARATION_BUILDER_URL || '').replace(/\/$/, '')
    return (process.env.MAP_REGION_BUILDER_URL || '').replace(/\/$/, '')
  }
  async catalog() {
    const cached = await readJson(join(this.root, 'catalog.json')).catch((error) => {
      if (missing(error)) return undefined
      throw error
    })
    return parseMapRegionCatalog(cached ?? (await readJson(this.catalogPath)))
  }
  async region(id: unknown) {
    const safe = mapRegionId(id)
    const catalog = await this.catalog()
    const region = catalog.regions.find((r) => r.id === safe)
    if (!region) throw new MapRegionError('Region is not in the public catalog', 404)
    return region
  }
  async refreshCatalog() {
    try {
      const catalog = await refreshPublicRegionCatalog(await this.catalog())
      const installed = await this.listInstalledComponents()
      const removed = installed.filter(
        (item) => !catalog.regions.some((region) => region.id === item.regionId)
      )
      if (removed.length)
        throw new MapRegionError(
          'The provider removed an installed region. Its data and the existing catalog were preserved; migrate it before refreshing: ' +
            [...new Set(removed.map((item) => item.regionId))].join(', '),
          409
        )
      await regionAtomicJson(join(this.root, 'catalog.json'), catalog)
      return { success: true, regions: catalog.regions.length, updatedAt: catalog.updatedAt }
    } catch (error) {
      if (error instanceof MapRegionError) throw error
      throw new MapRegionError(
        'The public catalog could not be refreshed. The saved catalog remains available offline. ' +
          (error as Error).message,
        503
      )
    }
  }
  private recordPath(id: string, component: MapRegionComponent) {
    return join(this.root, 'state', mapRegionId(id), component + '.json')
  }
  async record(id: string, component: MapRegionComponent): Promise<RecordState> {
    try {
      const record = await readJson(this.recordPath(id, component))
      if (!validRegionStatuses.has(record?.status))
        throw new MapRegionError(unreadableRegionState, 503)
      return record
    } catch (error) {
      if (missing(error)) return { status: 'available' }
      if (error instanceof MapRegionError) throw error
      throw new MapRegionError(unreadableRegionState, 503, { cause: error })
    }
  }
  /** Inventory readers can skip a damaged record. Mutations use record() to fail safely. */
  async inspectRecord(id: string, component: MapRegionComponent): Promise<RecordState | undefined> {
    try {
      return await this.record(id, component)
    } catch (error) {
      const detail = (error as Error).cause || error
      console.warn(`Cannot read map region ${id} (${component}).`, (detail as Error).message)
      return undefined
    }
  }
  async save(id: string, component: MapRegionComponent, value: RecordState) {
    await regionAtomicJson(this.recordPath(id, component), value)
  }
  /** A queue wrapper must not adopt an operation handed to another queue. */
  async ownsMonitorQueue(
    id: string,
    component: MapRegionComponent,
    operationId: string | undefined,
    queue: string
  ) {
    if (component !== 'routing' || queue !== MAP_REGION_QUEUE) return false
    return this.componentMutation(id, component, async () => {
      const current = await this.record(id, component)
      return !operationId || operationId === current.operationId
    })
  }
  /** The API and queue workers are different processes. Serialize the short
   * cancellation/publication critical section on their shared data volume. */
  private async componentMutation<T>(
    id: string,
    component: MapRegionComponent,
    callback: () => Promise<T>
  ): Promise<T> {
    const directory = join(this.root, 'operation-locks')
    await mkdir(directory, { recursive: true })
    return withMapRegionLock(
      join(directory, mapRegionId(id) + '-' + component + '.sqlite'),
      callback
    )
  }
  private cancelPath(id: string, component: MapRegionComponent, operationId: string) {
    return join(this.root, 'cancellations', mapRegionId(id), component, operationId + '.json')
  }
  private async assertOperation(id: string, component: MapRegionComponent, operationId: string) {
    const current = await this.record(id, component)
    if (
      current.operationId !== operationId ||
      ['cancelling', 'cancelled'].includes(current.status) ||
      (await stat(this.cancelPath(id, component, operationId))
        .then(() => true)
        .catch(() => false))
    )
      throw new MapRegionCancelled()
  }
  private async saveOperation(
    id: string,
    component: MapRegionComponent,
    operationId: string,
    value: RecordState
  ) {
    return this.componentMutation(id, component, async () => {
      await this.assertOperation(id, component, operationId)
      const previous = await this.record(id, component)
      const operation = persistRegionProgress(previous, value, operationId, component)
      operation.sourceFormat ||=
        value.cachedSourceDefinition?.format ||
        value.region?.sources[component]?.format ||
        previous.region?.sources[component]?.format
      operation.sourceBytes =
        value.preparation?.source.size ||
        value.cachedSource?.size ||
        value.totalBytes ||
        operation.sourceBytes
      await new MapRegionPhaseHistory(this.root)
        .transition(component, previous.operation, operation)
        .catch(() => {})
      await this.save(id, component, {
        ...value,
        operationId,
        workflow: value.workflow || previous.workflow,
        requiredSearchSchema: value.requiredSearchSchema || previous.requiredSearchSchema,
        cachedSource: value.cachedSource || previous.cachedSource,
        cachedSourceDefinition: value.cachedSourceDefinition || previous.cachedSourceDefinition,
        cachedCoverage: value.cachedCoverage || previous.cachedCoverage,
        cachedDataDate: value.cachedDataDate || previous.cachedDataDate,
        operation,
      })
    })
  }
  private async pendingComponents(includeLegacy = false) {
    const catalog = await this.catalog()
    const result = []
    const ids = new Set(await readdir(join(this.root, 'state')).catch(() => [] as string[]))
    for (const region of catalog.regions.filter((item) => ids.has(item.id)))
      for (const component of ['routing'] as const) {
        if (!includeLegacy && (!isInstallableTerritory(region) || !region.sources.routing)) continue
        const record = await this.inspectRecord(region.id, component)
        if (record && busy(record.status))
          result.push({
            regionId: region.id,
            name: region.name,
            component,
            status: record.status as 'queued' | 'downloading' | 'preparing' | 'cancelling',
          })
      }
    return result
  }
  async cancel(
    id: unknown,
    components: MapRegionComponent[],
    cancelPending: (component: MapRegionComponent) => Promise<boolean>
  ) {
    const region = await this.region(id)
    for (const component of components) {
      let selected: RecordState | undefined
      await this.componentMutation(region.id, component, async () => {
        const current = await this.record(region.id, component)
        if (!busy(current.status) && !current.preparation) return
        const operationId = current.operationId || randomUUID()
        await regionAtomicJson(this.cancelPath(region.id, component, operationId), {
          requestedAt: new Date().toISOString(),
        })
        selected = {
          ...current,
          operationId,
          status: 'cancelling',
          cancelRequestedAt: new Date().toISOString(),
        }
        await this.save(region.id, component, selected)
      })
      if (!selected) continue
      const noWorker = await cancelPending(component)
      let builderStopped = !selected.preparation
      if (selected.preparation) {
        const base = this.builderBase(selected.preparation)
        try {
          const response = await fetch(base + '/build/' + selected.preparation.jobId + '/cancel', {
            method: 'POST',
            signal: AbortSignal.timeout(15000),
          })
          const value = (await response.json().catch(() => ({}))) as { status?: string }
          builderStopped =
            response.status === 404 ||
            (response.ok && ['cancelled', 'completed', 'failed'].includes(value.status || ''))
        } catch {
          /* Keep cancelling until a worker/recovery confirms shutdown. */
        }
      }
      if (noWorker && builderStopped)
        await this.finishCancellation(region.id, component, selected.operationId!)
    }
    return { success: true }
  }
  private async finishCancellation(
    id: string,
    component: MapRegionComponent,
    operationId: string,
    preparation?: Preparation
  ) {
    let cleanup = preparation
    let acknowledged = false
    await this.componentMutation(id, component, async () => {
      const current = await this.record(id, component)
      if (current.operationId !== operationId) return
      cleanup ||= current.preparation
      await this.save(id, component, {
        ...current,
        status: 'cancelled',
        cachedSource: current.preparation?.source || current.cachedSource,
        updating: false,
        preparation: undefined,
        error: undefined,
      })
      acknowledged = true
    })
    // Builder shutdown has already been confirmed. Remove only this operation's
    // isolated scratch directory, never shared sources or installed versions.
    if (
      cleanup &&
      /^[a-z0-9-]{1,100}$/.test(cleanup.jobId) &&
      (acknowledged ||
        (await stat(this.cancelPath(id, component, operationId))
          .then(() => true)
          .catch(() => false)))
    ) {
      const directory = join(this.root, 'staging', cleanup.jobId)
      const path = resolve(this.root, cleanup.relativePath)
      if (
        resolve(path, '..') === directory &&
        (await realpath(directory)
          .then((actual) => actual === directory)
          .catch(() => false))
      )
        await rm(directory, { recursive: true, force: true }).catch(() => {})
    }
  }
  private async acknowledgeCancellation(
    id: string,
    component: MapRegionComponent,
    operationId: string,
    base: string,
    preparation?: Preparation
  ) {
    let stopped = !preparation
    if (preparation) {
      try {
        const response = await fetch(base + '/build/' + preparation.jobId + '/cancel', {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
        })
        const value = (await response.json().catch(() => ({}))) as { status?: string }
        stopped =
          response.status === 404 ||
          (response.ok && ['completed', 'failed', 'cancelled'].includes(value.status || ''))
      } catch {}
    }
    if (stopped) await this.finishCancellation(id, component, operationId, preparation)
  }
  private async reconcileCancellations() {
    for (const owner of await this.pendingComponents(true)) {
      if (owner.status !== 'cancelling') continue
      const current = await this.inspectRecord(owner.regionId, owner.component)
      if (!current?.preparation || !current.operationId) continue
      const base = this.builderBase(current.preparation)
      try {
        const response = await fetch(base + '/build/' + current.preparation.jobId, {
          signal: AbortSignal.timeout(1500),
        })
        const value = (await response.json().catch(() => ({}))) as { status?: string }
        if (
          response.status === 404 ||
          (response.ok && ['completed', 'failed', 'cancelled'].includes(value.status || ''))
        )
          await this.finishCancellation(owner.regionId, owner.component, current.operationId)
      } catch {}
    }
  }
  private async mutate<T>(callback: () => Promise<T>): Promise<T> {
    const previous = locks.get(this.root) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((r) => {
      release = r
    })
    locks.set(this.root, current)
    await previous
    try {
      return await callback()
    } finally {
      release()
      if (locks.get(this.root) === current) locks.delete(this.root)
    }
  }
  async queueInstall(
    id: unknown,
    components: MapRegionComponent[],
    dispatch: (id: string, c: MapRegionComponent) => Promise<unknown>
  ) {
    components = mapRegionComponents(components)
    const region = await this.region(id)
    assertInstallableTerritory(region)
    for (const component of components)
      if (!region.sources[component])
        throw new MapRegionError(
          'Choose a country or region with this component. Collections are navigation groups.',
          409
        )
    return this.mutate(async () => {
      const catalog = await this.catalog()
      const installed = await this.listInstalledComponents()
      const pending = await this.pendingComponents()
      for (const component of components) {
        if (regionProvider(region, component, catalog.regions, installed)) continue
        const owner = pendingRegionProvider(region, component, catalog.regions, pending)
        if (owner)
          throw new MapRegionError(
            'This component is included in the operation for ' +
              owner.name +
              '. View that region’s progress instead of downloading a duplicate.',
            409
          )
      }
      const selected = components.filter(
        (component) => !regionProvider(region, component, catalog.regions, installed)
      )
      await this.queueWorkflow(region, selected, 'install', dispatch)
    })
  }
  /** One durable routing intention. Postal prerequisites are no longer created. */
  private async queueWorkflow(
    region: MapRegionDefinition,
    components: MapRegionComponent[],
    type: 'install' | 'source_update',
    dispatch: (id: string, component: MapRegionComponent) => Promise<unknown>
  ) {
    if (!components.length) return
    mapRegionComponents(components)
    assertInstallableTerritory(region)
    const component = 'routing' as const
    const current = await this.record(region.id, component)
    if (busy(current.status)) return
    await this.confirmPreparationStopped(current)
    const cached = type === 'install' ? await this.cachedRegionSource(region, component) : undefined
    if (cached) await this.ensurePreparationCapacity(cached)
    const operationId = randomUUID()
    const workflow = { id: randomUUID(), components: [component] as MapRegionComponent[] }
    const record: RecordState = {
      ...current,
      installed: type === 'source_update' ? current.installed : undefined,
      installedVersion: type === 'source_update' ? current.installedVersion : undefined,
      installedBytes: type === 'source_update' ? current.installedBytes : undefined,
      records: undefined,
      region,
      operationId,
      workflow,
      searchUpgrade: undefined,
      recoveryQueue: undefined,
      requiredSearchSchema: undefined,
      updating: type === 'source_update',
      status: 'queued',
      progress: 0,
      cancelRequestedAt: undefined,
      preparation: undefined,
      cachedSource: cached,
      cachedSourceDefinition: cached
        ? { ...region.sources.routing!, dataDate: cached.lastModified || undefined }
        : undefined,
      cachedCoverage: cached ? region.coverage : undefined,
      cachedDataDate: cached?.lastModified || undefined,
      bytesDownloaded: cached?.size,
      totalBytes: cached?.size,
      error: undefined,
      operation: {
        ...newRegionOperation(operationId, type, current.operation, !!cached),
        workflowId: workflow.id,
        workflowComponents: ['routing'],
        sourceFormat: 'osm-pbf',
      },
    }
    const intent = {
      regionId: region.id,
      workflowId: workflow.id,
      previous: { routing: current.operationId },
      records: { routing: record },
    }
    const path = join(this.root, 'workflow-intents', workflow.id + '.json')
    await regionAtomicJson(path, intent)
    await this.materializeWorkflowIntent(intent)
    await rm(path, { force: true })
    try {
      await dispatch(region.id, component)
    } catch (error) {
      await this.saveOperation(region.id, component, operationId, {
        ...record,
        status: 'failed',
        error: (error as Error).message,
      })
      throw error
    }
  }
  private async materializeWorkflowIntent(intent: {
    regionId: string
    workflowId: string
    previous: Partial<Record<MapRegionComponent, string>>
    records: Partial<Record<MapRegionComponent, RecordState>>
  }) {
    const id = mapRegionId(intent.regionId)
    if (!/^[a-f0-9-]{36}$/.test(intent.workflowId)) throw new Error('Invalid workflow identity')
    const region = await this.region(id).catch(() => undefined)
    if (!region || !isInstallableTerritory(region) || !region.sources.routing) return
    for (const component of ['routing'] as const) {
      const planned = intent.records[component]
      if (!planned) continue
      if (
        planned.workflow?.id !== intent.workflowId ||
        planned.region?.id !== id ||
        !/^[a-f0-9-]{36}$/.test(planned.operationId || '')
      )
        throw new Error('Invalid workflow component')
      await this.componentMutation(id, component, async () => {
        const current = await this.record(id, component)
        if (current.operationId === planned.operationId) return
        if (current.operationId !== intent.previous[component] || busy(current.status)) return
        await this.save(id, component, {
          ...planned,
          region,
          workflow: { id: intent.workflowId, components: ['routing'] },
          searchUpgrade: undefined,
          requiredSearchSchema: undefined,
          operation: planned.operation
            ? { ...planned.operation, workflowComponents: ['routing'] }
            : undefined,
        })
      })
    }
  }
  private async recoverWorkflowIntents() {
    const directory = join(this.root, 'workflow-intents')
    const files = await readdir(directory).catch(() => [] as string[])
    for (const name of files.filter((value) => /^[a-f0-9-]{36}\.json$/.test(value))) {
      const path = join(directory, name)
      try {
        const intent = await readJson(path)
        await this.materializeWorkflowIntent(intent)
        await rm(path, { force: true })
      } catch (error) {
        console.warn(`Cannot recover map workflow ${name}.`, (error as Error).message)
      }
    }
  }
  async workflowDependency(_id: string, component: MapRegionComponent, _record?: RecordState) {
    return { ready: component === 'routing', failed: component !== 'routing' }
  }
  async resumeWorkflow(
    id: string,
    dispatch: (id: string, component: MapRegionComponent) => Promise<unknown>
  ) {
    const region = await this.region(id).catch(() => undefined)
    if (!region || !isInstallableTerritory(region) || !region.sources.routing) return
    for (const component of ['routing'] as const) {
      const record = await this.record(id, component)
      if (
        record.workflow &&
        record.status === 'queued' &&
        (await this.workflowDependency(id, component, record)).ready
      )
        await dispatch(id, component)
    }
  }
  async recoverPending(
    dispatch: (id: string, component: MapRegionComponent) => Promise<unknown>,
    workflowsOnly = false
  ) {
    await this.recoverWorkflowIntents()
    const ids = await readdir(join(this.root, 'state')).catch(() => [] as string[])
    const pending: { id: string; record: RecordState }[] = []
    for (const id of ids) {
      if (!/^[a-z0-9][a-z0-9_-]{0,119}$/.test(id)) continue
      const record = await this.inspectRecord(id, 'routing')
      if (!record || !busy(record.status) || (workflowsOnly && !record.workflow)) continue
      pending.push({ id, record })
    }
    if (!pending.length) return 0
    const catalog = await this.catalog()
    let recovered = 0
    for (const { id, record } of pending) {
      const region = catalog.regions.find((item) => item.id === id)
      if (!region || !isInstallableTerritory(region)) continue
      for (const component of ['routing'] as const) {
        if (!region.sources[component]) continue
        if (record.status === 'cancelling') {
          // Cancellation is a durable intent, not a preparation to resurrect.
          await this.cancel(id, [component], async () => true)
          continue
        }
        if (
          (!record.installed || record.updating) &&
          busy(record.status) &&
          (await this.workflowDependency(id, component, record)).ready
        ) {
          // Redis may lose recent queue entries on an unclean host shutdown.
          // Dispatch deduplicates still-active/waiting jobs by their stable ID.
          await dispatch(id, component)
          recovered++
        }
      }
    }
    return recovered
  }
  async resolveProvider(id: unknown, component: MapRegionComponent) {
    mapRegionComponents([component])
    const region = await this.region(id),
      catalog = await this.catalog(),
      installed = await this.listInstalledComponents(component)
    return { region, provider: regionProvider(region, component, catalog.regions, installed) }
  }
  async resolvePendingProvider(id: unknown, component: MapRegionComponent) {
    mapRegionComponents([component])
    const region = await this.region(id),
      catalog = await this.catalog()
    return pendingRegionProvider(region, component, catalog.regions, await this.pendingComponents())
  }
  private async updateState(item: MapRegionInstalledComponent) {
    const value = await readJson(
      join(this.root, 'updates', item.regionId, item.component + '.json')
    ).catch(() => undefined)
    return value?.sourceSha256 === item.source.sha256
      ? value.update
      : { status: 'not_checked' as const }
  }
  async checkUpdates(id?: unknown) {
    const catalog = await this.catalog(),
      installed = await this.listInstalledComponents()
    const selected = id === undefined ? undefined : await this.region(id)
    const ownerIds = new Set<string>()
    if (selected) assertInstallableTerritory(selected)
    if (selected)
      for (const component of ['routing'] as const) {
        const provider = regionProvider(selected, component, catalog.regions, installed)
        if (provider) ownerIds.add(provider.regionId + '|' + component)
      }
    const targets = installed.filter(
      (item) =>
        isInstallableTerritory(item) &&
        (!selected || ownerIds.has(item.regionId + '|' + item.component))
    )
    const checker = new MapRegionUpdateService(this.root)
    const results = []
    // Bound provider load; source probes themselves are shared by URL.
    for (let start = 0; start < targets.length; start += 3) {
      const batch = await Promise.all(
        targets.slice(start, start + 3).map(async (item) => {
          const update = await checker.check(item)
          await regionAtomicJson(
            join(this.root, 'updates', item.regionId, item.component + '.json'),
            { sourceSha256: item.source.sha256, update }
          )
          return { regionId: item.regionId, component: item.component, update }
        })
      )
      results.push(...batch)
    }
    return { checked: results.length, results }
  }
  async queueUpdate(
    id: unknown,
    components: MapRegionComponent[],
    dispatch: (id: string, c: MapRegionComponent) => Promise<unknown>
  ) {
    components = mapRegionComponents(components)
    const region = await this.region(id)
    assertInstallableTerritory(region)
    return this.mutate(async () => {
      const installed = await this.listInstalledComponents()
      for (const component of components) {
        if (!installed.some((item) => item.regionId === region.id && item.component === component))
          throw new MapRegionError(
            'Update the package that provides this coverage, or download the missing component again.',
            409
          )
        if (!region.sources[component])
          throw new MapRegionError('This source is no longer in the public catalog.', 409)
      }
      await this.queueWorkflow(region, components, 'source_update', dispatch)
    })
  }
  private async validatePreparedSource(
    id: string,
    source: PreparedSource,
    format: MapRegionSource['format']
  ) {
    if (!/^[a-f0-9]{64}$/.test(source.sha256))
      throw new MapRegionError('The original cached source has no valid checksum.', 409)
    const expected = join(
      this.root,
      'sources',
      mapRegionId(id),
      source.sha256,
      format === 'osm-pbf' ? 'source.osm.pbf' : 'source.zip'
    )
    const info = await stat(expected).catch(() => undefined)
    if (
      source.path !== expected ||
      !info?.isFile() ||
      info.size !== source.size ||
      (await realpath(expected)) !== expected
    )
      throw new MapRegionError(
        'The original cached source is unavailable or changed. Download newer data explicitly; this retry will not contact the public source.',
        409
      )
    return { ...source, path: expected }
  }
  private async cachedRegionSource(
    region: MapRegionDefinition,
    component: MapRegionComponent,
    definition = region.sources[component]!
  ): Promise<PreparedSource | undefined> {
    const metadata = await readJson(join(this.root, 'sources', region.id, 'current.json')).catch(
      () => undefined
    )
    if (
      !metadata ||
      metadata.url !== definition.url ||
      !Number.isSafeInteger(metadata.size) ||
      metadata.size <= 0 ||
      !/^[a-f0-9]{64}$/.test(metadata.sha256 || '')
    )
      return
    const path = join(
      this.root,
      'sources',
      region.id,
      metadata.sha256,
      definition.format === 'osm-pbf' ? 'source.osm.pbf' : 'source.zip'
    )
    try {
      return await this.validatePreparedSource(region.id, { ...metadata, path }, definition.format)
    } catch {
      return undefined
    }
  }
  private async ensurePreparationCapacity(source: PreparedSource) {
    const capacity = await mapRegionCapacity(this.root)
    if (
      capacity.availableBytes <
      mapRegionPreparationRequirement([
        { size: source.size, format: source.path.endsWith('.zip') ? 'cnefe-zip' : 'osm-pbf' },
      ])
    )
      throw new MapRegionError(
        'Not enough available disk space to prepare the cached source. Existing installed data and the cached source were preserved.',
        422
      )
  }
  private async confirmPreparationStopped(record: RecordState) {
    if (!record.preparation) return
    try {
      const response = await fetch(
        this.builderBase(record.preparation) + '/build/' + record.preparation.jobId,
        { signal: AbortSignal.timeout(3000) }
      )
      if (response.status === 404) return
      if (!response.ok) throw new Error('Unavailable')
      const result = (await response.json()) as MapRegionBuildStatus
      if (['queued', 'preparing', 'cancelling'].includes(result.status))
        throw new MapRegionError(
          'The previous preparation is still running. Refresh its status or cancel it before retrying.',
          409
        )
      if (!['completed', 'failed', 'cancelled'].includes(result.status))
        throw new Error('Unknown status')
    } catch (error) {
      if (error instanceof MapRegionError) throw error
      throw new MapRegionError(
        'Could not confirm that the previous preparation has stopped. Refresh status before retrying.',
        503
      )
    }
  }
  /** A retry retains the intent and immutable source of the failed attempt. */
  async queueRetry(
    id: unknown,
    components: MapRegionComponent[],
    dispatch: (id: string, component: MapRegionComponent) => Promise<unknown>
  ) {
    components = mapRegionComponents(components)
    const region = await this.region(id)
    assertInstallableTerritory(region)
    for (const component of components) {
      const existing = await this.record(region.id, component)
      if (!['failed', 'cancelled'].includes(existing.status))
        throw new MapRegionError(
          'Only a failed or cancelled operation can be retried. Refresh its status first.',
          409
        )
      await this.confirmPreparationStopped(existing)
      await this.mutate(async () => {
        let queued: RecordState | undefined
        await this.componentMutation(region.id, component, async () => {
          const current = await this.record(region.id, component)
          if (
            !['failed', 'cancelled'].includes(current.status) ||
            current.operationId !== existing.operationId
          )
            throw new MapRegionError(
              'This operation changed. Refresh its status before retrying.',
              409
            )
          const captured = current.cachedSource || current.preparation?.source
          const definition =
            current.cachedSourceDefinition ||
            current.region?.sources[component] ||
            region.sources[component]
          if (!definition)
            throw new MapRegionError('The original source definition is unavailable.', 409)
          const source = captured
            ? await this.validatePreparedSource(region.id, captured, definition.format)
            : undefined
          if (source && source.sha256 !== current.installed?.source.sha256)
            await this.ensurePreparationCapacity(source)
          const operationId = randomUUID()
          const workflow = current.workflow
            ? { id: current.workflow.id, components: ['routing'] as MapRegionComponent[] }
            : undefined
          queued = {
            ...current,
            operationId,
            workflow,
            recoveryQueue: undefined,
            searchUpgrade: undefined,
            requiredSearchSchema: undefined,
            region: current.region || region,
            status: 'queued',
            error: undefined,
            progress: 0,
            cancelRequestedAt: undefined,
            preparation: undefined,
            cachedSource: source,
            cachedSourceDefinition: source ? { ...definition, url: source.url } : undefined,
            cachedCoverage: current.cachedCoverage || current.region?.coverage || region.coverage,
            cachedDataDate: current.cachedDataDate || definition.dataDate || source?.lastModified,
            bytesDownloaded: source?.size,
            totalBytes: source?.size,
            operation: newRegionOperation(
              operationId,
              operationType(current),
              current.operation,
              !!source
            ),
          }
          queued.operation = {
            ...queued.operation!,
            workflowId: workflow?.id,
            workflowComponents: workflow?.components,
            sourceFormat: definition.format,
            sourceBytes: source?.size,
          }
          await this.save(region.id, component, queued)
        })
        try {
          if ((await this.workflowDependency(region.id, component, queued)).ready)
            await dispatch(region.id, component)
        } catch (error) {
          if (queued)
            await this.saveOperation(region.id, component, queued.operationId!, {
              ...queued,
              status: 'failed',
              error: (error as Error).message,
            })
          throw error
        }
      })
    }
    return { success: true }
  }
  async listInstalledComponents(component?: MapRegionComponent) {
    if (component === 'search') return []
    const installed: MapRegionInstalledComponent[] = []
    const ids = await readdir(join(this.root, 'state')).catch(() => [] as string[])
    for (const id of ids) {
      if (!/^[a-z0-9][a-z0-9_-]{0,119}$/.test(id)) continue
      for (const kind of ['routing'] as const) {
        const record = await this.inspectRecord(id, kind)
        const item = record?.installed
        if (
          !item ||
          item.regionId !== id ||
          item.component !== kind ||
          typeof item.version !== 'string' ||
          !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(item.version) ||
          typeof item.name !== 'string' ||
          !item.source ||
          typeof item.source.sha256 !== 'string' ||
          !Number.isSafeInteger(item.sizeBytes) ||
          item.sizeBytes <= 0
        )
          continue
        let coverage: MapRegionDefinition['coverage']
        try {
          coverage = parseMapRegionCoverage(item.coverage)
        } catch (error) {
          console.warn(`Cannot read installed map coverage for ${id}.`, (error as Error).message)
          continue
        }
        const filename = 'routing.tar'
        const artifactPath = join(this.root, 'installed', id, kind, item.version, filename)
        const info = await stat(artifactPath).catch(() => null)
        if (info?.isFile() && info.size === item.sizeBytes)
          installed.push({
            ...item,
            coverage,
            artifactPath,
            relativePath: artifactPath.slice(this.root.length + 1),
          })
      }
    }
    return installed
  }
  private async visualInventory() {
    const directory = process.env.MAP_VISUAL_PATH || '/app/storage/maps/pmtiles'
    const result: { name: string; bbox: number[]; maxZoom: number }[] = []
    for (const name of await readdir(directory).catch(() => [] as string[])) {
      if (!name.endsWith('.pmtiles')) continue
      const handle = await open(join(directory, name), 'r')
      try {
        const buffer = Buffer.alloc(127)
        const { bytesRead } = await handle.read(buffer, 0, 127, 0)
        if (bytesRead === 127 && buffer.toString('ascii', 0, 7) === 'PMTiles' && buffer[7] === 3)
          result.push({
            name,
            maxZoom: buffer[101],
            bbox: [102, 106, 110, 114].map((offset) => buffer.readInt32LE(offset) / 1e7),
          })
      } finally {
        await handle.close()
      }
    }
    return result
  }
  async getState(): Promise<MapRegionsState> {
    await this.reconcileCancellations()
    const catalog = await this.catalog()
    const visual = await this.visualInventory()
    const installed = await this.listInstalledComponents()
    const pending = await this.pendingComponents()
    let localAssets = new Map()
    try {
      const packs = await new MapPackStore(
        process.env.MAP_PACKS_PATH || '/app/storage/map-packs',
        process.env.MAP_PACK_CATALOG_PATH || '/app/resources/map-packs/catalog.json',
        process.env.MAP_PACK_ALLOW_LOCAL_DOWNLOADS === 'true'
      ).listInstalled()
      localAssets = attachLocalAssets(catalog.regions, packs)
    } catch {
      /* A malformed optional legacy catalog must not disable official regions. */
    }
    const regions = await Promise.all(
      catalog.regions.map(async (region) => {
        const components: Partial<Record<MapRegionComponent, MapRegionComponentState>> = {}
        for (const component of ['routing'] as const) {
          const provider = regionProvider(region, component, catalog.regions, installed)
          const direct = installed.find(
            (item) => item.regionId === region.id && item.component === component
          )
          if (region.sources[component] || provider || direct) {
            const record: RecordState = (await this.inspectRecord(region.id, component)) ?? {
              status: 'failed',
              error: unreadableRegionState,
            }
            const {
              installed: _installed,
              region: _region,
              preparation: _preparation,
              operationId: _operationId,
              cancelRequestedAt: _cancelRequestedAt,
              searchUpgrade: _searchUpgrade,
              cachedSource: _cachedSource,
              cachedSourceDefinition: _cachedSourceDefinition,
              cachedCoverage: _cachedCoverage,
              cachedDataDate: _cachedDataDate,
              recoveryQueue: _recoveryQueue,
              workflow: _workflow,
              requiredSearchSchema: _requiredSearchSchema,
              installedVersion: _version,
              installedBytes: _bytes,
              records: _records,
              ...publicState
            } = record
            const owner = installed.find(
              (item) => item.regionId === provider?.regionId && item.component === component
            )
            components[component] = {
              ...publicState,
              status: record.status === 'installed' && !direct ? 'available' : record.status,
              error:
                record.status === 'installed' && !direct
                  ? 'The installed file is missing or incomplete. Download this component again.'
                  : publicState.error,
              availability: direct
                ? 'direct'
                : provider
                  ? 'inherited'
                  : region.sources[component]
                    ? 'available'
                    : 'unavailable',
              providedBy: provider,
              pendingProvider: pendingRegionProvider(region, component, catalog.regions, pending),
              update: owner ? await this.updateState(owner) : undefined,
              dependents: direct
                ? catalog.regions
                    .filter(
                      (child) =>
                        child.id !== region.id &&
                        regionProvider(child, component, catalog.regions, installed)?.regionId ===
                          region.id
                    )
                    .map((child) => ({ id: child.id, name: child.name }))
                : undefined,
              ...(direct
                ? {
                    installedVersion: direct.version,
                    installedBytes: direct.sizeBytes,
                    records: direct.records,
                    dataDate: direct.dataDate,
                  }
                : {}),
            }
          }
        }
        const [west, south, east, north] = region.coverage.bbox
        const files = visual.filter(
          (file) =>
            file.bbox[0] <= west &&
            file.bbox[1] <= south &&
            file.bbox[2] >= east &&
            file.bbox[3] >= north
        )
        return {
          ...region,
          coverage: { bbox: region.coverage.bbox },
          components,
          localAssets: localAssets.get(region.id) || [],
          summary: Object.values(components).some(
            (c) => c?.availability === 'direct' || c?.availability === 'inherited'
          )
            ? Object.values(components).every(
                (c) => c?.availability === 'direct' || c?.availability === 'inherited'
              )
              ? ('installed' as const)
              : ('partial' as const)
            : Object.keys(region.sources).length
              ? ('available' as const)
              : ('collection' as const),
          visual: {
            available: files.some((f) => f.maxZoom >= 12),
            basemap: files.length > 0,
            sources: files.map((f) => f.name),
          },
        }
      })
    )
    const stateById = new Map(regions.map((region) => [region.id, region]))
    for (const region of regions) {
      if (
        region.summary !== 'installed' &&
        (region.summary === 'partial' || region.localAssets.length)
      ) {
        let parent = region.parentId
        const seen = new Set<string>()
        while (parent && !seen.has(parent)) {
          seen.add(parent)
          const state = stateById.get(parent)
          if (!state) break
          if (state.summary !== 'installed') state.summary = 'partial'
          parent = state.parentId
        }
      }
      if (region.summary === 'installed') {
        let parent = region.parentId
        const seen = new Set<string>()
        while (parent && !seen.has(parent)) {
          seen.add(parent)
          const state = stateById.get(parent)
          if (!state) break
          if (state.summary !== 'installed') state.summary = 'partial'
          parent = state.parentId
        }
      }
    }
    let builderReady = false,
      engineVersion: string | undefined
    try {
      const response = await fetch(this.builderBase() + '/status', {
        signal: AbortSignal.timeout(2000),
      })
      const value = (await response.json()) as { ready?: boolean; engineVersion?: string }
      builderReady = response.ok && value.ready === true
      engineVersion = value.engineVersion
    } catch {}
    return {
      schema_version: 2,
      regions,
      builderReady,
      engineVersion,
      builderError: builderReady
        ? undefined
        : 'The optional map preparation service is unavailable.',
      sourceUrl: catalog.sourceUrl,
      updatedAt: catalog.updatedAt,
      visual: {
        available: visual.length > 0,
        reused: true,
        message: visual.length
          ? 'Existing PMTiles files are reused without copying or downloading them again.'
          : 'Install visual maps using the map download options below.',
      },
    }
  }
  async remove(id: unknown, component: unknown, cancel: () => Promise<void>) {
    const safe = mapRegionId(id),
      kind = mapRegionComponent(component)
    return this.mutate(async () => {
      const record = await this.record(safe, kind)
      if (busy(record.status))
        throw new MapRegionError('Wait for this component to finish before removing it.', 409)
      if (!record.installed) {
        const { provider } = await this.resolveProvider(safe, kind)
        if (provider && provider.regionId !== safe)
          throw new MapRegionError(
            'This coverage belongs to ' + provider.name + '. Manage that package instead.',
            409
          )
      }
      if (record.preparation) {
        const base = this.builderBase(record.preparation)
        const response = await fetch(base + '/build/' + record.preparation.jobId, {
          signal: AbortSignal.timeout(15000),
        })
        if (response.status !== 404) {
          if (!response.ok)
            throw new MapRegionError(
              'Could not confirm whether preparation has finished. Retry when the preparation service is available.',
              503
            )
          if (
            ['queued', 'preparing', 'cancelling'].includes(
              ((await response.json()) as MapRegionBuildStatus).status
            )
          )
            throw new MapRegionError(
              'Local preparation is still running. Retry or wait for it to finish before removing this component.',
              409
            )
        }
      }
      await cancel()
      await rm(join(this.root, 'installed', safe, kind), { recursive: true, force: true })
      await rm(this.recordPath(safe, kind), { force: true })
      if (record.preparation && /^[a-z0-9-]{1,100}$/.test(record.preparation.jobId))
        await rm(join(this.root, 'staging', record.preparation.jobId), {
          recursive: true,
          force: true,
        })
      const other = await this.record(safe, kind === 'routing' ? 'search' : 'routing')
      if (!other.installed && !busy(other.status))
        await rm(join(this.root, 'sources', safe), { recursive: true, force: true })
    })
  }
  private async sourceRequest(
    source: MapRegionSource,
    method = 'GET',
    headers: Record<string, string> = {},
    signal?: AbortSignal
  ) {
    let url = source.url
    for (let attempt = 0; attempt < 6; attempt++) {
      assertMapRegionRequestUrl(url, source.sourceId)
      const response = await fetch(url, {
        method,
        headers,
        redirect: 'manual',
        signal: signal
          ? AbortSignal.any([
              signal,
              AbortSignal.timeout(method === 'HEAD' ? 30000 : 12 * 3600 * 1000),
            ])
          : AbortSignal.timeout(method === 'HEAD' ? 30000 : 12 * 3600 * 1000),
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location) throw new MapRegionError('Public source returned an invalid redirect', 502)
        url = new URL(location, url).toString()
        continue
      }
      if (!response.ok)
        throw new MapRegionError('Public source returned HTTP ' + response.status, 502)
      return { response, url }
    }
    throw new MapRegionError('Public source redirected too many times', 502)
  }
  private async download(
    region: MapRegionDefinition,
    component: MapRegionComponent,
    preserve?: RecordState,
    expectedMd5?: string,
    control?: { operationId: string; signal: AbortSignal; assert: () => Promise<void> }
  ) {
    await control?.assert()
    const source = region.sources[component]!
    const { response: head, url } = await this.sourceRequest(source, 'HEAD', {}, control?.signal)
    await control?.assert()
    const size = Number(head.headers.get('content-length'))
    if (!Number.isSafeInteger(size) || size <= 0)
      throw new MapRegionError(
        'The public source does not report a reliable size. Its transfer cannot be started safely.',
        422
      )
    const directory = join(this.root, 'sources', region.id)
    const currentPath = join(directory, 'current.json')
    const current = await readJson(currentPath).catch(() => null)
    const modified = head.headers.get('last-modified') || ''
    const etag = head.headers.get('etag') || undefined
    if (
      current?.url === source.url &&
      current.size === size &&
      current.lastModified === modified &&
      current.etag === etag &&
      (modified || etag || expectedMd5 || source.checksum) &&
      /^[a-f0-9]{64}$/.test(current.sha256)
    ) {
      const cached = join(
        directory,
        current.sha256,
        source.format === 'osm-pbf' ? 'source.osm.pbf' : 'source.zip'
      )
      if (
        await stat(cached)
          .then((s) => s.isFile() && s.size === size)
          .catch(() => false)
      ) {
        const actual = await fileSha256(cached, control?.signal)
        if (actual === current.sha256) {
          let matchesExpected = true
          if (expectedMd5) {
            const hash = createHash('md5')
            for await (const chunk of createReadStream(cached)) {
              control?.signal.throwIfAborted()
              hash.update(chunk)
            }
            matchesExpected = hash.digest('hex') === expectedMd5
          }
          if (source.checksum) {
            const hash = createHash(source.checksum.algorithm)
            for await (const chunk of createReadStream(cached)) {
              control?.signal.throwIfAborted()
              hash.update(chunk)
            }
            if (hash.digest('hex') !== source.checksum.value)
              throw new MapRegionError('Cached public source checksum mismatch', 422)
          }
          if (matchesExpected) {
            const verified = { ...current, path: cached }
            if (actual !== preserve?.installed?.source.sha256)
              await this.ensurePreparationCapacity(verified)
            return verified
          }
        }
        if (actual !== current.sha256) await rm(cached, { force: true })
      }
    }
    await mkdir(this.root, { recursive: true })
    const disk = await mapRegionCapacity(this.root)
    const requiredBytes = mapRegionPreparationRequirement([{ size, format: source.format }])
    if (disk.availableBytes < requiredBytes)
      throw new MapRegionError(
        `Not enough free space to download and prepare this region safely. Available: ${(disk.availableBytes / 1024 ** 3).toFixed(1)} GiB. Conservative preparation requirement: ${(requiredBytes / 1024 ** 3).toFixed(1)} GiB.`,
        422
      )
    await mkdir(directory, { recursive: true })
    const partial = join(directory, 'download.part')
    const identity = { url, size, lastModified: modified, expectedMd5 }
    const resume = await readJson(join(directory, 'download.json')).catch(() => null)
    if (JSON.stringify(resume) !== JSON.stringify(identity)) await rm(partial, { force: true })
    await regionAtomicJson(join(directory, 'download.json'), identity)
    let offset = await stat(partial)
      .then((s) => s.size)
      .catch(() => 0)
    if (offset > size) {
      await rm(partial, { force: true })
      offset = 0
    }
    if (offset < size) {
      const idle = new AbortController()
      let idleTimer: ReturnType<typeof setTimeout> | undefined
      const resetIdle = () => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(
          () =>
            idle.abort(
              new MapRegionError(
                'The public source stopped sending data. Retry this download to resume the validated partial file.',
                504
              )
            ),
          60000
        )
        idleTimer.unref()
      }
      resetIdle()
      let file: Awaited<ReturnType<typeof open>> | undefined
      try {
        const { response } = await this.sourceRequest(
          { ...source, url },
          'GET',
          offset ? { 'Range': `bytes=${offset}-`, 'If-Range': modified } : {},
          control?.signal ? AbortSignal.any([control.signal, idle.signal]) : idle.signal
        )
        if (response.status === 206) {
          const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
            response.headers.get('content-range') || ''
          )
          if (!range || Number(range[1]) !== offset || Number(range[3]) !== size)
            throw new MapRegionError('The public source returned an invalid resume range', 502)
        } else offset = 0
        file = await open(partial, offset ? 'a' : 'w')
        let updated = 0
        try {
          for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
            if (idleTimer) clearTimeout(idleTimer)
            control?.signal.throwIfAborted()
            offset += chunk.length
            if (offset > size)
              throw new MapRegionError('Public source exceeded its declared size', 422)
            await file.writeFile(chunk)
            if (Date.now() - updated > 1500) {
              updated = Date.now()
              const progress: RecordState = {
                ...preserve,
                region,
                status: 'downloading',
                progress: Math.floor((offset / size) * 100),
                bytesDownloaded: offset,
                totalBytes: size,
                operation: {
                  ...(preserve?.operation || {
                    id: control?.operationId || 'legacy',
                    type: operationType(preserve || {}),
                  }),
                  phase: 'downloading',
                  sourceMode: 'download',
                  heartbeatAt: new Date().toISOString(),
                },
              }
              if (control)
                await this.saveOperation(region.id, component, control.operationId, progress)
              else await this.save(region.id, component, progress)
            }
            resetIdle()
          }
        } finally {
          await file?.close()
        }
      } catch (error) {
        if (idle.signal.aborted) throw idle.signal.reason
        throw error
      } finally {
        if (idleTimer) clearTimeout(idleTimer)
      }
    }
    if ((await stat(partial)).size !== size)
      throw new MapRegionError('Public source download is incomplete', 502)
    await control?.assert()
    if (control)
      await this.saveOperation(region.id, component, control.operationId, {
        ...(await this.record(region.id, component)),
        status: 'preparing',
        bytesDownloaded: size,
        totalBytes: size,
        operation: {
          ...((await this.record(region.id, component)).operation || {
            id: control.operationId,
            type: operationType(preserve || {}),
          }),
          phase: 'verifying_source',
          transferComplete: true,
        },
      })
    const sha256 = await fileSha256(partial, control?.signal)
    if (expectedMd5) {
      const hash = createHash('md5')
      for await (const chunk of createReadStream(partial)) {
        control?.signal.throwIfAborted()
        hash.update(chunk)
      }
      if (hash.digest('hex') !== expectedMd5) {
        await rm(partial, { force: true })
        throw new MapRegionError(
          'The source changed after its update check. Check again before retrying.',
          422
        )
      }
    }
    if (source.checksum) {
      const hash = createHash(source.checksum.algorithm)
      for await (const chunk of createReadStream(partial)) {
        control?.signal.throwIfAborted()
        hash.update(chunk)
      }
      if (hash.digest('hex') !== source.checksum.value) {
        await rm(partial, { force: true })
        throw new MapRegionError('Public source checksum mismatch', 422)
      }
    }
    const destination = join(
      directory,
      sha256,
      source.format === 'osm-pbf' ? 'source.osm.pbf' : 'source.zip'
    )
    await mkdir(resolve(destination, '..'), { recursive: true })
    await control?.assert()
    await rename(partial, destination)
    const metadata = {
      url: source.url,
      resolvedUrl: url,
      size,
      sha256,
      lastModified: modified,
      etag,
      downloadedAt: new Date().toISOString(),
    }
    await regionAtomicJson(currentPath, metadata)
    return { ...metadata, path: destination }
  }
  private async buildStatus(
    base: string,
    jobId: string,
    allowMissing = false,
    signal?: AbortSignal
  ): Promise<MapRegionBuildStatus | undefined> {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(base + '/build/' + jobId, {
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
            : AbortSignal.timeout(60000),
        })
        if (allowMissing && response.status === 404) return undefined
        if (!response.ok) throw new MapRegionError('Map preparation job is unavailable', 503)
        const value = (await response.json()) as MapRegionBuildStatus
        if (
          !['queued', 'preparing', 'completed', 'failed', 'cancelling', 'cancelled'].includes(
            value.status || ''
          )
        )
          throw new MapRegionError('Invalid preparation status', 502)
        return value
      } catch (error) {
        if (signal?.aborted) throw error
        // Heavy disk work may briefly delay this optional sidecar. Keep the same
        // job identity and tolerate transient failures before requiring a retry.
        if (attempt >= 3) throw error
        await new Promise((r) => setTimeout(r, 2000))
      }
    }
  }
  async install(id: string, component: MapRegionComponent, expectedOperationId?: string) {
    mapRegionComponents([component])
    const region = await this.region(id)
    assertInstallableTerritory(region)
    let original = await this.record(id, component)
    if (expectedOperationId && expectedOperationId !== original.operationId)
      throw new MapRegionCancelled()
    let base = this.builderBase(original.preparation)
    if (original.status === 'cancelling' && original.operationId) {
      await this.acknowledgeCancellation(
        id,
        component,
        original.operationId,
        base,
        original.preparation
      )
      throw new MapRegionCancelled()
    }
    if (original.installed && !original.updating) return original.installed
    if (['cancelled', 'cancelling'].includes(original.status)) throw new MapRegionCancelled()
    // Old persisted jobs have no operation token. Adopt one before doing work;
    // new queue requests already carry their generation across process restarts.
    const operationId = original.operationId || randomUUID()
    try {
      await this.componentMutation(id, component, async () => {
        const current = await this.record(id, component)
        if (
          ['cancelled', 'cancelling'].includes(current.status) ||
          (current.operationId && current.operationId !== operationId)
        )
          throw new MapRegionCancelled()
        original = {
          ...current,
          operationId,
          searchUpgrade: undefined,
          requiredSearchSchema: undefined,
          workflow: current.workflow
            ? { id: current.workflow.id, components: ['routing'] }
            : undefined,
          operation: current.operation
            ? {
                ...current.operation,
                workflowComponents: current.workflow ? ['routing'] : undefined,
              }
            : undefined,
        }
        await this.save(id, component, original)
      })
    } catch (error) {
      const current = await this.record(id, component)
      if (
        error instanceof MapRegionCancelled &&
        current.status === 'cancelling' &&
        current.operationId &&
        (!expectedOperationId || expectedOperationId === current.operationId)
      )
        await this.acknowledgeCancellation(
          id,
          component,
          current.operationId,
          base,
          current.preparation
        )
      throw error
    }
    const controller = new AbortController()
    let checking = false
    const monitor = setInterval(() => {
      if (checking) return
      checking = true
      void this.assertOperation(id, component, operationId)
        .catch((error) => controller.abort(error))
        .finally(() => {
          checking = false
        })
    }, 400)
    const control = {
      operationId,
      signal: controller.signal,
      assert: () => this.assertOperation(id, component, operationId),
    }
    let preparation = original.preparation
    let retrySource = original.cachedSource
    const sourceDefinition =
      original.cachedSourceDefinition ||
      (original.preparation
        ? original.region?.sources.routing || region.sources.routing
        : region.sources.routing)
    const sourceCoverage = original.cachedCoverage || original.region?.coverage || region.coverage
    let sharedDataDate: string | undefined
    const sourceDate = (source: PreparedSource) =>
      sharedDataDate || original.cachedDataDate || sourceDefinition?.dataDate || source.lastModified
    try {
      if (!base || !sourceDefinition)
        throw new MapRegionError('Map preparation or this component is not configured', 503)
      const filename = 'routing.tar'
      if (sourceDefinition.format !== 'osm-pbf' || sourceDefinition.sourceId !== 'geofabrik')
        throw new MapRegionError(
          'Routing requires a published OSM source for one country or subregion.',
          409
        )
      if (preparation) {
        const previous = await this.buildStatus(base, preparation.jobId, true, controller.signal)
        if (!previous || ['failed', 'cancelled'].includes(previous.status)) {
          retrySource ||= preparation.source
          preparation = undefined
        }
      }
      if (!preparation) {
        base = this.builderBase()
        // Another independent component may have completed the same source while
        // this installation was waiting. Recheck locally before any public HEAD.
        if (!retrySource && original.workflow && operationType(original) === 'install') {
          retrySource = await this.cachedRegionSource(
            original.region || region,
            component,
            sourceDefinition
          )
          if (retrySource) sharedDataDate = retrySource.lastModified
        }
        await this.saveOperation(id, component, operationId, {
          ...original,
          region,
          status: 'downloading',
          progress: 0,
          operation: {
            ...(original.operation || { id: operationId, type: operationType(original) }),
            phase: retrySource ? 'verifying_source' : 'connecting',
            sourceMode: retrySource ? 'cached' : 'download',
            sourceFormat: sourceDefinition.format,
            sourceBytes: retrySource?.size || original.installed?.source.sizeBytes,
          },
        })
        const update = original.installed ? await this.updateState(original.installed) : undefined
        const source = retrySource
          ? await this.validatePreparedSource(id, retrySource, sourceDefinition.format)
          : await this.download(region, component, original, update?.remoteChecksum, control)
        await control.assert()
        if (original.installed && source.sha256 === original.installed.source.sha256) {
          await this.saveOperation(id, component, operationId, {
            region,
            status: 'installed',
            installed: original.installed,
            installedVersion: original.installed.version,
            installedBytes: original.installed.sizeBytes,
            records: original.installed.records,
            progress: 100,
          })
          await regionAtomicJson(join(this.root, 'updates', id, component + '.json'), {
            sourceSha256: source.sha256,
            update: {
              status: 'up_to_date',
              checkedAt: new Date().toISOString(),
              sourceDate: source.lastModified,
              evidence: update?.remoteChecksum ? 'checksum' : 'metadata',
              remoteChecksum: update?.remoteChecksum,
            },
          })
          return original.installed
        }
        if (retrySource) await this.ensurePreparationCapacity(source)
        const jobId = randomUUID(),
          relativePath = join('staging', jobId, filename)
        preparation = {
          jobId,
          relativePath,
          source,
          builderKind: process.env.MAP_REGION_PREPARATION_BUILDER_URL ? 'progress' : undefined,
        }
        // Persist identity before POST: retries can resume the same idempotent build.
        await this.saveOperation(id, component, operationId, {
          ...original,
          region,
          status: 'preparing',
          progress: 0,
          preparation,
          cachedSource: source,
          cachedSourceDefinition: { ...sourceDefinition, url: source.url },
          cachedCoverage: sourceCoverage,
          cachedDataDate: sourceDate(source),
        })
        const request = {
          jobId,
          regionId: id,
          component,
          source: {
            relativePath: source.path.slice(this.root.length + 1),
            format: sourceDefinition.format,
            sourceId: sourceDefinition.sourceId,
            sha256: source.sha256,
            dataDate: sourceDate(source),
          },
          outputRelativePath: relativePath,
          coverage: { bbox: sourceCoverage.bbox },
          operationKind: operationType(original),
        }
        const started = await fetch(base + '/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
        })
        if (!started.ok)
          throw new MapRegionError('Could not start the local map preparation service', 503)
      }
      const { jobId, relativePath, source } = preparation
      let build: MapRegionBuildStatus | undefined
      const deadline = Date.now() + 24 * 3600 * 1000
      while (Date.now() < deadline) {
        await control.assert()
        build = await this.buildStatus(base, jobId, false, controller.signal)
        if (!build) throw new MapRegionError('Map preparation job is unavailable', 503)
        await this.saveOperation(id, component, operationId, {
          ...original,
          region,
          status: 'preparing',
          progress: build.progress || 0,
          totalBytes: source.size,
          bytesDownloaded: source.size,
          preparation,
          cachedSource: source,
          cachedSourceDefinition: { ...sourceDefinition, url: source.url },
          cachedCoverage: sourceCoverage,
          cachedDataDate: sourceDate(source),
          operation: applyBuilderProgress(
            {
              ...((await this.record(id, component)).operation || {
                id: operationId,
                type: operationType(original),
              }),
              phase: build.status === 'queued' ? 'queued' : 'building_routing',
              sourceMode: retrySource ? 'cached' : 'download',
              transferComplete: true,
            },
            build
          ),
        })
        if (build.status === 'failed')
          throw new MapRegionError(build.error || 'Map preparation failed', 422)
        if (['cancelled', 'cancelling'].includes(build.status)) throw new MapRegionCancelled()
        if (build.status === 'completed') break
        await new Promise((r) => setTimeout(r, 2000))
      }
      if (
        build?.status !== 'completed' ||
        !build.artifact ||
        build.artifact.relativePath !== relativePath
      )
        throw new MapRegionError('Map preparation did not finish with the expected artifact', 503)
      if (
        !/^[a-f0-9]{64}$/.test(build.artifact.sha256) ||
        !Number.isSafeInteger(build.artifact.sizeBytes) ||
        build.artifact.sizeBytes <= 0
      )
        throw new MapRegionError('Invalid prepared artifact metadata', 422)
      const version = source.sha256.slice(0, 16) + '-' + build.artifact.sha256.slice(0, 12)
      const destination = join(this.root, 'installed', id, component, version)
      await this.saveOperation(id, component, operationId, {
        ...(await this.record(id, component)),
        operation: {
          ...((await this.record(id, component)).operation || {
            id: operationId,
            type: operationType(original),
          }),
          phase: 'validating',
        },
      })
      const staged = join(this.root, relativePath)
      // Recover a shutdown after moving the immutable artifact but before the
      // installed state was committed. Reverify bytes before completing publish.
      const artifact = await stat(staged)
        .then(() => staged)
        .catch((error) => {
          if (!missing(error)) throw error
          return join(destination, filename)
        })
      const info = await stat(artifact)
      if (
        info.size !== build.artifact.sizeBytes ||
        (await fileSha256(artifact, controller.signal)) !== build.artifact.sha256
      )
        throw new MapRegionError('Prepared component checksum mismatch', 422)
      const installed: MapRegionInstalledComponent = {
        schema_version: 2,
        regionId: id,
        name: region.name,
        component,
        version,
        coverage: sourceCoverage,
        artifactPath: join(destination, filename),
        relativePath: join('installed', id, component, version, filename),
        sizeBytes: info.size,
        sha256: build.artifact.sha256,
        source: {
          ...sourceDefinition,
          sha256: source.sha256,
          downloadedAt: source.downloadedAt,
          lastModified: source.lastModified,
          sizeBytes: source.size,
          etag: source.etag,
        },
        records: build.records,
        dataDate: sourceDate(source),
        engineVersion: build.engineVersion,
        createdAt: new Date().toISOString(),
        attribution: region.attribution,
        ...mapRegionTerritory(region),
      }
      // Check and commit under the same cross-process lock as cancellation.
      // A late builder success can never publish after cancellation wins it.
      await this.componentMutation(id, component, async () => {
        await control.assert()
        await mkdir(destination, { recursive: true })
        if (artifact === staged) await rename(artifact, join(destination, filename))
        await regionAtomicJson(join(destination, 'manifest.json'), installed)
        await this.save(id, component, {
          ...(await this.record(id, component)),
          region,
          status: 'installed',
          installedVersion: version,
          installedBytes: info.size,
          records: build.records,
          installed,
          progress: 100,
          operationId,
          updating: undefined,
          searchUpgrade: undefined,
          searchRebuilding: undefined,
          cancelRequestedAt: undefined,
          error: undefined,
          preparation: undefined,
          workflow: original.workflow,
          requiredSearchSchema: original.requiredSearchSchema,
          operation: persistRegionProgress(
            original,
            {
              status: 'installed',
              operation: {
                ...((await this.record(id, component)).operation || {
                  id: operationId,
                  type: operationType(original),
                }),
                phase: 'ready',
              },
            },
            operationId,
            component
          ),
        })
      })
      return installed
    } catch (error) {
      const current = await this.record(id, component)
      const cancelled =
        error instanceof MapRegionCancelled ||
        controller.signal.reason instanceof MapRegionCancelled ||
        current.operationId !== operationId ||
        ['cancelling', 'cancelled'].includes(current.status)
      if (cancelled) {
        await this.acknowledgeCancellation(id, component, operationId, base, preparation)
        throw new MapRegionCancelled()
      }
      try {
        await this.saveOperation(id, component, operationId, {
          ...original,
          region,
          preparation,
          status: 'failed',
          error: (error as Error).message,
        })
      } catch (late) {
        if (late instanceof MapRegionCancelled)
          await this.acknowledgeCancellation(id, component, operationId, base, preparation)
        throw late
      }
      throw error
    } finally {
      clearInterval(monitor)
    }
  }
}
