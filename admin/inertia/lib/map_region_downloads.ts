import type {
  MapRegionComponent,
  MapRegionComponentState,
  MapRegionState,
} from '../../types/map_regions.js'

export const regionOperationBusy = (status?: string) =>
  ['queued', 'downloading', 'preparing', 'cancelling'].includes(status || '')

export const regionOperationLabel = (status?: string) => {
  switch (status) {
    case 'queued':
      return 'Waiting in queue'
    case 'downloading':
      return 'Downloading source'
    case 'preparing':
      return 'Preparing and validating local data'
    case 'cancelling':
      return 'Cancelling…'
    case 'installed':
      return 'Ready'
    case 'cancelled':
      return 'Cancelled'
    case 'failed':
      return 'Failed'
    default:
      return 'Available to download'
  }
}

export function regionOperationComponents(region: MapRegionState) {
  return (['routing', 'search'] as const).filter((component) =>
    regionOperationBusy(region.components[component]?.status)
  )
}

/** Source transfer is shared by routing/search. Never add the same PBF twice. */
export function regionTransfer(
  region: MapRegionState,
  components = regionOperationComponents(region)
) {
  const sources = new Map<string, { bytes: number; total?: number }>()
  for (const component of components) {
    const source = region.sources[component]
    const state = region.components[component]
    if (!source || !state) continue
    const previous = sources.get(source.url)
    // A queued replacement can still carry progress fields from a previous
    // version. Only running work is evidence of this operation's transfer.
    const total =
      (state.status === 'queued' ? undefined : state.totalBytes) ??
      source.sizeBytes ??
      previous?.total
    sources.set(source.url, {
      bytes: Math.max(
        previous?.bytes ?? 0,
        state.status === 'queued' ? 0 : (state.bytesDownloaded ?? 0)
      ),
      total,
    })
  }
  const values = [...sources.values()]
  const complete = !!values.length && values.every((source) => source.total !== undefined)
  return {
    bytes: values.reduce(
      (sum, source) => sum + Math.min(source.bytes, source.total ?? source.bytes),
      0
    ),
    total: complete ? values.reduce((sum, source) => sum + source.total!, 0) : undefined,
    shared: components.length > sources.size,
    sourceCount: sources.size,
  }
}

export function activeRegionOperations(regions: MapRegionState[]) {
  return regions.filter((region) => regionOperationComponents(region).length > 0)
}

export function failedRegionComponents(region: MapRegionState) {
  return (['routing', 'search'] as const).filter((component) => {
    const state = region.components[component]
    return (
      state?.status === 'failed' && !state.pendingProvider && state.availability !== 'inherited'
    )
  })
}

export function regionOperationsNeedingAttention(regions: MapRegionState[]) {
  return regions.filter((region) => failedRegionComponents(region).length > 0)
}

export function pendingRegionMessage(state?: MapRegionComponentState) {
  const provider = state?.pendingProvider
  return provider
    ? `Included in ${provider.name} — ${regionOperationLabel(provider.status).toLowerCase()}`
    : null
}

export function downloadableRegionComponents(
  region: MapRegionState,
  selected: MapRegionComponent[]
) {
  return selected.filter((component) => {
    const state = region.components[component]
    const ready = state?.availability
      ? ['direct', 'inherited'].includes(state.availability)
      : !!state?.installedVersion
    return (
      !!region.sources[component] &&
      !state?.pendingProvider &&
      !regionOperationBusy(state?.status) &&
      !ready
    )
  })
}
