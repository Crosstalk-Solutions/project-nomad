import type {
  MapRegionComponent,
  MapRegionComponentState,
  MapRegionState,
} from '../../types/map_regions.js'

export const operationPhaseLabel = (phase: string) =>
  (
    ({
      queued: 'Waiting in queue',
      connecting: 'Connecting to the public source',
      downloading: 'Downloading source',
      verifying_source: 'Verifying source files',
      reading_source: 'Reading map data',
      building_search: 'Building postal lookup indexes',
      building_routing: 'Building routes',
      validating: 'Verifying offline data',
      publishing: 'Publishing verified data',
      ready: 'Ready offline',
      failed: 'Needs attention',
      cancelled: 'Cancelled',
      cancelling: 'Waiting for work to stop',
      waiting_retry: 'Waiting to retry',
      status_unavailable: 'Operation status unavailable',
    }) as Record<string, string>
  )[phase] || 'Preparing local data'

/** Describe the actual reported substep without exposing internal identifiers. */
export function operationWorkLabel(phase: string, detail?: string) {
  const labels: Record<string, Record<string, string>> = {
    reading_source: {
      starting_search: 'Starting postal data preparation',
      source_features: 'Reading addresses and places',
      osm_two_pass_geometry_and_features: 'Reading map geometry and places',
      cnefe_rows: 'Reading addresses and postal codes',
      cnefe_postal_rows: 'Reading postal codes from the IBGE source',
      osm_postal_features: 'Reading postal codes from the map source',
    },
    building_search: {
      secondary_indexes: 'Building address lookup indexes',
      postal_groups: 'Grouping and indexing complete postal codes',
      rtree: 'Indexing places for nearby searches',
      fts: 'Building text search',
    },
    building_routing: {
      routing_admins: 'Preparing administrative boundaries for routes',
      routing_tiles: 'Building the road network for routes',
      routing_extract: 'Packaging the offline route graph',
    },
    verifying_source: { source_checksum: 'Checking source file integrity' },
    validating: {
      search_integrity: 'Checking search database integrity',
      postal_integrity: 'Checking postal lookup integrity',
      artifact_checksum: 'Verifying prepared files',
    },
  }
  return labels[phase]?.[detail || ''] || operationPhaseLabel(phase)
}

export function operationIntentLabel(state: MapRegionComponentState) {
  const type = state.operation?.type
  return type === 'index_upgrade' || (!type && state.searchRebuilding)
    ? 'Updating postal data'
    : type === 'source_update' || (!type && state.updating)
      ? 'Updating offline data'
      : 'Preparing offline data'
}

export function operationWaitingLabel(state: MapRegionComponentState) {
  const operation = state.operation
  if (operation?.queueReason === 'workflow_dependency')
    return 'Postal preparation will finish before route preparation starts.'
  if (operation?.queueReason === 'workflow_dependency_failed')
    return 'Postal preparation needs attention before route preparation can continue.'
  if (operation?.waitingFor) return `Waiting for ${operation.waitingFor}.`
  return (
    (
      {
        retry_delay: 'Waiting for the next retry.',
        another_operation: 'Another local operation is running.',
        preparer_busy: 'Waiting for the local preparation service.',
        queue_unavailable:
          'The local queue is unavailable. Refresh status or check the preparation service.',
      } as Record<string, string>
    )[operation?.queueReason || ''] || 'Waiting for the local preparation worker.'
  )
}

type Components = Partial<Record<MapRegionComponent, MapRegionComponentState>>
export type RegionOperationEntry = {
  component: MapRegionComponent
  state: MapRegionComponentState
}
export type RegionOperationStage = {
  id: 'download' | 'verify' | 'search' | 'routing' | 'publish'
  label: string
  status: 'pending' | 'current' | 'complete' | 'failed' | 'cancelled'
}
const componentOrder = ['search', 'routing'] as const
const active = (state: MapRegionComponentState) =>
  ['queued', 'downloading', 'preparing', 'cancelling'].includes(state.status)
const terminal = (state: MapRegionComponentState) => ['failed', 'cancelled'].includes(state.status)
const phaseOf = (state: MapRegionComponentState) =>
  state.operation?.phase || (state.status === 'preparing' ? 'reading_source' : state.status)
const sourcePhases = ['connecting', 'downloading', 'verifying_source']
const installed = (state: MapRegionComponentState) =>
  state.status === 'installed' && !state.updating && !state.searchRebuilding
const readySource = (state: MapRegionComponentState) =>
  installed(state) ||
  !!state.searchRebuilding ||
  state.operation?.sourceMode === 'cached' ||
  !!state.operation?.transferComplete ||
  [
    'reading_source',
    'building_search',
    'building_routing',
    'validating',
    'publishing',
    'ready',
  ].includes(phaseOf(state))

const workflowOwners = (entries: RegionOperationEntry[]) =>
  new Set(
    entries.map(({ component, state }) => state.operation?.workflowId || `legacy:${component}`)
  )
const workflowComponents = (entries: RegionOperationEntry[]) =>
  workflowOwners(entries).size > 1
    ? entries.map(({ component }) => component)
    : entries.find(({ state }) => state.operation?.workflowId)?.state.operation
        ?.workflowComponents || entries.map(({ component }) => component)

/** A workflow owns its selected components. Legacy independent jobs stay independent. */
export function regionOperationEntries(components: Components): RegionOperationEntry[] {
  const entries = componentOrder.flatMap((component) => {
    const state = components[component]
    return state && state.availability !== 'inherited' && !state.providedBy
      ? [{ component, state }]
      : []
  })
  // Separate requests can coexist in a modular region. One workflow's scope
  // must never hide the other component's unfinished task or its controls.
  const unfinished = entries.filter(({ state }) => active(state) || terminal(state))
  if (workflowOwners(unfinished).size > 1)
    return entries.filter(({ state }) => active(state) || terminal(state) || installed(state))
  const running = entries.find(({ state }) => active(state))
  const owner =
    running ||
    entries.find(({ state }) => terminal(state)) ||
    entries.find(({ state }) => state.operation)
  const selected = owner?.state.operation?.workflowComponents
  const workflowId = owner?.state.operation?.workflowId
  if (selected?.length && workflowId) {
    return entries.filter(
      ({ component, state }) =>
        selected.includes(component) && state.operation?.workflowId === workflowId
    )
  }
  if (owner?.state.operation?.type === 'index_upgrade' || owner?.state.searchRebuilding)
    return entries.filter(({ component }) => component === 'search')
  return entries.filter(({ state }) => active(state) || terminal(state) || installed(state))
}

function failedStage(entry: RegionOperationEntry): RegionOperationStage['id'] {
  const { state, component } = entry
  if (state.operation?.errorCode === 'SOURCE_INTEGRITY') return 'verify'
  return readySource(state) ? component : 'download'
}

export function regionOperationStages(entries: RegionOperationEntry[]): RegionOperationStage[] {
  if (!entries.length) return []
  const cacheOnly = entries.every(
    ({ state }) => state.searchRebuilding || state.operation?.type === 'index_upgrade'
  )
  const stages: RegionOperationStage[] = [
    ...(!cacheOnly
      ? [{ id: 'download' as const, label: 'Download source', status: 'pending' as const }]
      : []),
    { id: 'verify', label: 'Verify source', status: 'pending' },
    ...componentOrder
      .filter((component) => workflowComponents(entries).includes(component))
      .map((component) => ({
        id: component,
        label: component === 'search' ? 'Prepare postal lookup' : 'Prepare routes',
        status: 'pending' as const,
      })),
    { id: 'publish', label: 'Verify and publish', status: 'pending' },
  ]
  const sharedWorkflow =
    !!entries[0].state.operation?.workflowId &&
    entries.every(
      ({ state }) => state.operation?.workflowId === entries[0].state.operation?.workflowId
    )
  const sourcesReady = sharedWorkflow
    ? entries.some(({ state }) => readySource(state))
    : entries.every(({ state }) => readySource(state))
  const sourceVerified = (state: MapRegionComponentState) =>
    installed(state) ||
    [
      'reading_source',
      'building_search',
      'building_routing',
      'validating',
      'publishing',
      'ready',
    ].includes(phaseOf(state))
  const verified = sharedWorkflow
    ? entries.some(({ state }) => sourceVerified(state))
    : entries.every(({ state }) => sourceVerified(state))
  const allReady =
    entries.length === workflowComponents(entries).length &&
    entries.every(({ state }) => installed(state))
  const buildsFinished =
    entries.length === workflowComponents(entries).length &&
    entries.every(
      ({ state }) =>
        installed(state) || ['validating', 'publishing', 'ready'].includes(phaseOf(state))
    )
  for (const stage of stages) {
    if (stage.id === 'download') {
      if (sourcesReady) {
        stage.status = 'complete'
        if (entries.every(({ state }) => state.operation?.sourceMode === 'cached'))
          stage.label = 'Source available locally'
      } else if (
        entries.some(({ state }) => ['connecting', 'downloading'].includes(phaseOf(state)))
      )
        stage.status = 'current'
    } else if (stage.id === 'verify') {
      if (verified) stage.status = 'complete'
      else if (entries.some(({ state }) => phaseOf(state) === 'verifying_source'))
        stage.status = 'current'
    } else if (stage.id === 'publish') {
      if (allReady) stage.status = 'complete'
      else if (
        buildsFinished &&
        entries.some(({ state }) => ['validating', 'publishing'].includes(phaseOf(state)))
      )
        stage.status = 'current'
    } else {
      const state = entries.find(({ component }) => component === stage.id)?.state
      if (
        state &&
        (installed(state) || ['validating', 'publishing', 'ready'].includes(phaseOf(state)))
      )
        stage.status = 'complete'
      else if (
        state &&
        active(state) &&
        !['queued', 'cancelling'].includes(state.status) &&
        !sourcePhases.includes(phaseOf(state))
      )
        stage.status = 'current'
    }
    const stopped = entries.find(
      (entry) => terminal(entry.state) && failedStage(entry) === stage.id
    )
    if (stopped) stage.status = stopped.state.status === 'failed' ? 'failed' : 'cancelled'
  }
  return stages
}

export function regionOperationPresentation(components: Components) {
  const entries = regionOperationEntries(components)
  const running = entries.filter(({ state }) => active(state))
  const focus =
    running.find(({ state }) => state.status === 'cancelling') ||
    running.find(
      ({ state }) =>
        state.status !== 'queued' &&
        phaseOf(state) !== 'queued' &&
        state.operation?.activity !== 'unavailable'
    ) ||
    entries.find(({ state }) => state.status === 'failed') ||
    running[0] ||
    entries.find(({ state }) => state.status === 'cancelled') ||
    entries[0]
  const stages = regionOperationStages(entries)
  const scopeIncomplete = entries.length < workflowComponents(entries).length
  const allReady =
    !!entries.length && !scopeIncomplete && entries.every(({ state }) => installed(state))
  const someReady = entries.some(({ state }) => installed(state))
  const phase = focus ? phaseOf(focus.state) : 'queued'
  const unknown =
    scopeIncomplete ||
    (!!focus &&
      (focus.state.operation?.activity === 'unavailable' || phase === 'status_unavailable'))
  const waiting = !!focus && !unknown && (phase === 'queued' || focus.state.status === 'queued')
  const title = allReady
    ? entries.length === 1 &&
      entries[0].component === 'search' &&
      entries[0].state.postalCoverage === 'empty'
      ? 'No postal codes in this source'
      : 'Ready offline'
    : unknown
      ? 'Status unavailable'
      : phase === 'cancelling' || focus?.state.status === 'cancelling'
        ? 'Cancelling…'
        : focus?.state.status === 'failed'
          ? 'Needs attention'
          : focus?.state.status === 'cancelled'
            ? 'Cancelled'
            : waiting
              ? 'Waiting in queue'
              : sourcePhases.includes(phase)
                ? operationPhaseLabel(phase)
                : ['validating', 'publishing'].includes(phase)
                  ? operationPhaseLabel(phase)
                  : focus?.component === 'search'
                    ? 'Preparing postal lookup'
                    : 'Preparing routes'
  const statusFor = ({ component, state }: RegionOperationEntry) => {
    const label = component === 'search' ? 'Postal data' : 'Routes'
    return `${label} ${installed(state) ? (component === 'search' && state.postalCoverage === 'empty' ? 'has no postal codes in this source' : 'ready') : state.status === 'failed' ? 'needs attention' : state.status === 'cancelled' ? 'cancelled' : state.status === 'queued' || phaseOf(state) === 'queued' ? 'queued' : 'preparing'}`
  }
  const stageIndex = stages.findIndex((stage) =>
    ['current', 'failed', 'cancelled'].includes(stage.status)
  )
  const completed = stages.filter((stage) => stage.status === 'complete').length
  return {
    entries,
    focus,
    stages,
    allReady,
    waiting,
    unknown,
    phase,
    title,
    readiness: someReady ? entries.map(statusFor).join(' · ') : undefined,
    step: allReady
      ? stages.length
      : stageIndex >= 0
        ? stageIndex + 1
        : Math.min(stages.length, completed + 1),
    completed,
    parallel: stages.filter((stage) => stage.status === 'current').length > 1,
    independent: workflowOwners(entries).size > 1,
  }
}

export function operationStepProgress(state?: MapRegionComponentState) {
  const operation = state?.operation
  const phase = state ? phaseOf(state) : 'queued'
  const canQuantify =
    !!state &&
    active(state) &&
    !['queued', 'cancelling'].includes(state.status) &&
    !['queued', 'cancelling', 'status_unavailable'].includes(phase) &&
    operation?.activity !== 'unavailable'
  const fresh =
    canQuantify &&
    !['waiting', 'no_recent_progress', 'unavailable'].includes(operation?.activity || '')
  const downloading = canQuantify && phase === 'downloading' && operation?.sourceMode !== 'cached'
  const bytes = downloading
    ? (operation?.bytesTransferred ?? state?.bytesDownloaded)
    : operation?.stageBytesProcessed
  const total = downloading
    ? (operation?.totalBytes ?? state?.totalBytes)
    : operation?.stageTotalBytes
  const speed = fresh
    ? downloading
      ? operation?.rateBytesPerSecond
      : operation?.stageRateBytesPerSecond
    : undefined
  const finite = (value?: number) => value !== undefined && Number.isFinite(value) && value >= 0
  const percent = !canQuantify
    ? undefined
    : finite(bytes) && finite(total) && total! > 0
      ? Math.min(100, (bytes! / total!) * 100)
      : finite(operation?.recordsProcessed) &&
          finite(operation?.recordsTotal) &&
          operation!.recordsTotal! > 0
        ? Math.min(100, (operation!.recordsProcessed! / operation!.recordsTotal!) * 100)
        : undefined
  const measuredEta =
    fresh && finite(operation?.etaSeconds)
      ? operation!.etaSeconds
      : fresh && finite(bytes) && finite(total) && speed && speed > 0
        ? Math.max(0, (total! - bytes!) / speed)
        : undefined
  const minimum =
    fresh && finite(operation?.phaseEtaMinSeconds) ? operation!.phaseEtaMinSeconds : undefined
  const maximum =
    fresh && finite(operation?.phaseEtaMaxSeconds) ? operation!.phaseEtaMaxSeconds : undefined
  return {
    downloading,
    fresh,
    bytes,
    total,
    speed,
    percent,
    measuredEta,
    etaMinimum:
      minimum !== undefined && maximum !== undefined && maximum >= minimum ? minimum : undefined,
    etaMaximum:
      minimum !== undefined && maximum !== undefined && maximum >= minimum ? maximum : undefined,
    etaBasis: operation?.etaBasis,
  }
}

export function formatOperationDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'unknown'
  if (seconds < 60) return `${Math.floor(seconds)} sec`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`
  return `${Math.floor(seconds / 3600)} hr ${Math.floor((seconds % 3600) / 60)} min`
}

export function operationAge(timestamp?: string, now = Date.now()) {
  const time = timestamp ? Date.parse(timestamp) : NaN
  return Number.isFinite(time)
    ? formatOperationDuration(Math.max(0, (now - time) / 1000)) + ' ago'
    : null
}

/** Count owning packages once, even when many covered descendants can improve. */
export function searchImprovementOwners(regions: MapRegionState[]) {
  const owners = new Map<string, MapRegionState>()
  for (const region of regions) {
    const state = region.components.search
    if (!state?.searchUpgradeAvailable) continue
    const id = state.providedBy?.regionId || region.id
    const owner = regions.find((candidate) => candidate.id === id)
    if (owner) owners.set(id, owner)
  }
  return [...owners.values()]
}

export function regionNeedsAttention(region: Pick<MapRegionState, 'components'>) {
  return Object.values(region.components).some(
    (state) =>
      state &&
      state.status !== 'cancelled' &&
      (state.status === 'failed' ||
        state.operation?.activity === 'unavailable' ||
        (state.status !== 'queued' &&
          state.operation?.phase !== 'queued' &&
          state.operation?.activity === 'no_recent_progress'))
  )
}
