/** Presentation-only hierarchy. Availability remains the server's decision. */
import type { MapRegionState } from '../../types/map_regions.js'
import { mapRegionTerritory, isInstallableTerritory } from '../../app/utils/map_region_territory.js'
import { regionOperationBusy } from './map_region_downloads.js'
export interface RegionTreeItem {
  id: string
  name: string
  parentId?: string
}
export interface RegionTreeRow<T> {
  region: T
  depth: number
  expanded: boolean
  hasChildren: boolean
  matched: boolean
}

/** English UI labels do not change provider metadata or installed provenance. */
export function regionDisplayName(region: Pick<RegionTreeItem, 'id' | 'name'>) {
  if (region.id === 'brazil') return 'Brazil'
  if (region.id === 'world') return 'World'
  return region.id.startsWith('br-addresses-')
    ? region.name.replace(/\s*[—–-]\s*endereços e CEPs\s*\(IBGE\)$/iu, ' — postal codes (IBGE)')
    : region.name
}

export function normalizeRegionText(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim()
}

export function regionAncestorIds<T extends RegionTreeItem>(regions: T[], id: string) {
  const byId = new Map(regions.map((region) => [region.id, region]))
  const result: string[] = []
  const seen = new Set([id])
  let parent = byId.get(id)?.parentId
  while (parent && byId.has(parent) && !seen.has(parent)) {
    result.unshift(parent)
    seen.add(parent)
    parent = byId.get(parent)?.parentId
  }
  return result
}

export function regionBreadcrumb<T extends RegionTreeItem>(regions: T[], id: string) {
  const byId = new Map(regions.map((region) => [region.id, region]))
  return [...regionAncestorIds(regions, id), id]
    .map((key) => byId.get(key)?.name)
    .filter(Boolean)
    .join(' / ')
}

export function regionTreeRows<T extends RegionTreeItem>(
  regions: T[],
  expanded: ReadonlySet<string>,
  query = '',
  predicate?: (region: T) => boolean
): RegionTreeRow<T>[] {
  const byId = new Map(regions.map((region) => [region.id, region]))
  const children = new Map<string, T[]>()
  for (const region of regions) {
    const parent = region.parentId && byId.has(region.parentId) ? region.parentId : ''
    const group = children.get(parent) ?? []
    group.push(region)
    children.set(parent, group)
  }
  for (const group of children.values())
    group.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }))
  const text = normalizeRegionText(query)
  const filtered = !!text || !!predicate
  const matched = new Set(
    regions
      .filter(
        (region) =>
          (!predicate || predicate(region)) &&
          (!text ||
            normalizeRegionText(regionBreadcrumb(regions, region.id) + ' ' + region.id).includes(
              text
            ))
      )
      .map((region) => region.id)
  )
  const retained = new Set(matched)
  if (filtered)
    for (const id of matched)
      for (const parent of regionAncestorIds(regions, id)) retained.add(parent)
  const rows: RegionTreeRow<T>[] = []
  const visited = new Set<string>()
  const walk = (region: T, depth: number) => {
    if (visited.has(region.id) || (filtered && !retained.has(region.id))) return
    visited.add(region.id)
    const descendants = (children.get(region.id) ?? []).filter(
      (item) => !filtered || retained.has(item.id)
    )
    const open = filtered || expanded.has(region.id)
    rows.push({
      region,
      depth,
      hasChildren: descendants.length > 0,
      expanded: open,
      matched: matched.has(region.id),
    })
    if (open) for (const child of descendants) walk(child, depth + 1)
  }
  for (const root of children.get('') ?? []) walk(root, 0)
  return rows
}

/** Coverage and a pending parent are not child jobs. Count only owning attempts. */
export function regionHasOwnActivity(region: Pick<MapRegionState, 'components'>) {
  return Object.values(region.components).some((state) => {
    if (
      !state ||
      !['queued', 'downloading', 'preparing', 'cancelling', 'failed'].includes(state.status)
    )
      return false
    if ((state.pendingProvider || state.availability === 'inherited') && !state.operation?.id)
      return false
    return true
  })
}

/** Project each owning package once onto its deepest visible ancestor.
 * A filtered-out operation is counted separately instead of decorating an
 * unrelated retained ancestor. No percentages are averaged here.
 */
export function projectRegionActivities<T extends MapRegionState>(
  regions: T[],
  rows: RegionTreeRow<T>[],
  filtered = false
) {
  const byId = new Map(regions.map((region) => [region.id, region]))
  const visible = new Map(rows.map((row) => [row.region.id, row]))
  const byRow = new Map<string, T[]>()
  const outsideFilter: string[] = []
  for (const region of regions) {
    if (!regionHasOwnActivity(region)) continue
    if (filtered && !visible.get(region.id)?.matched) {
      outsideFilter.push(region.id)
      continue
    }
    let id: string | undefined = region.id
    const seen = new Set<string>()
    while (id && !seen.has(id)) {
      seen.add(id)
      if (visible.has(id)) {
        byRow.set(id, [...(byRow.get(id) || []), region])
        break
      }
      id = byId.get(id)?.parentId
    }
  }
  return { byRow, outsideFilter }
}

export type TerritoryFilter = 'all' | 'installed' | 'progress' | 'attention'
export type CountryTerritoryGroup = {
  id: string
  countryCode: string
  name: string
  country?: MapRegionState
  regions: MapRegionState[]
}

/** A country group is presentation only: it never invents a downloadable source. */
export function countryTerritoryGroups(regions: MapRegionState[]): CountryTerritoryGroup[] {
  const grouped = new Map<string, CountryTerritoryGroup>()
  const names = new Intl.DisplayNames(['en'], { type: 'region' })
  for (const region of regions) {
    const territory = mapRegionTerritory(region)
    if (!['country', 'subregion'].includes(territory.territoryScope)) continue
    if (territory.countryCodes.length !== 1) continue
    const code = territory.countryCodes[0]
    const group = grouped.get(code) || {
      id: `country-${code.toLowerCase()}`,
      countryCode: code,
      name: names.of(code) || code,
      regions: [],
    }
    if (territory.territoryScope === 'country') {
      if (!group.country || (!group.country.sources.routing && !!region.sources.routing)) {
        group.country = region
        group.name = regionDisplayName(region)
      }
    } else if (isInstallableTerritory(region)) group.regions.push(region)
    grouped.set(code, group)
  }
  for (const group of grouped.values())
    group.regions.sort((a, b) =>
      regionBreadcrumb(regions, a.id).localeCompare(regionBreadcrumb(regions, b.id), 'en', {
        sensitivity: 'base',
      })
    )
  return [...grouped.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
  )
}

/** Provider metadata is also attached to directly installed data by the API. */
export function territoryRouteProvider(region: MapRegionState) {
  const provider = region.components.routing?.providedBy
  return provider && provider.regionId !== region.id ? provider : undefined
}

export function territoryRouteReady(region?: MapRegionState, regions: MapRegionState[] = []) {
  const state = region?.components.routing
  if (!region || !state) return false
  const provider = territoryRouteProvider(region)
  if (
    provider ||
    (state.availability === 'inherited' && state.providedBy?.regionId !== region.id)
  ) {
    const owner = regions.find((item) => item.id === provider?.regionId)
    return (
      !!owner &&
      isInstallableTerritory(owner) &&
      (mapRegionTerritory(owner).territoryScope === 'country' ||
        (mapRegionTerritory(owner).territoryScope === 'subregion' &&
          regionAncestorIds(regions, region.id).includes(owner.id))) &&
      mapRegionTerritory(region).countryCodes.some((code) =>
        mapRegionTerritory(owner).countryCodes.includes(code)
      ) &&
      !!owner.components.routing?.installedVersion
    )
  }
  return !!state.installedVersion && state.availability !== 'unavailable'
}

/** Strip removed components and legacy cross-border providers before rendering controls. */
export function routingTerritoryRegion(
  region: MapRegionState,
  regions: MapRegionState[]
): MapRegionState {
  let state = region.components.routing
  if (state) {
    state = {
      ...state,
      operation: state.operation
        ? { ...state.operation, workflowComponents: ['routing'] }
        : undefined,
    }
    if (state.providedBy?.regionId === region.id) {
      state.providedBy = undefined
      if (state.availability === 'inherited') state.availability = 'direct'
    } else if (state.providedBy) {
      state.providedBy = {
        ...state.providedBy,
        name: regionDisplayName({ id: state.providedBy.regionId, name: state.providedBy.name }),
      }
    }
    if (
      territoryRouteProvider(region) &&
      !territoryRouteReady(region, regions) &&
      !state.operation?.id
    )
      state = { status: 'available', availability: 'available' }
    if (state.pendingProvider) {
      const owner = regions.find((item) => item.id === state!.pendingProvider!.regionId)
      if (!owner || !isInstallableTerritory(owner)) state.pendingProvider = undefined
      else
        state.pendingProvider = {
          ...state.pendingProvider,
          name: regionDisplayName({
            id: state.pendingProvider.regionId,
            name: state.pendingProvider.name,
          }),
        }
    }
  }
  return {
    ...region,
    name: regionDisplayName(region),
    sources: { routing: region.sources.routing },
    components: state ? { routing: state } : {},
  }
}

export function territoryNeedsAttention(region: MapRegionState) {
  const state = region.components.routing
  return !!state && (state.status === 'failed' || state.operation?.activity === 'unavailable')
}

export function territoryRegionMatches(
  region: MapRegionState,
  regions: MapRegionState[],
  text: string,
  filter: TerritoryFilter
) {
  if (
    text &&
    !normalizeRegionText(regionBreadcrumb(regions, region.id) + ' ' + region.id).includes(text)
  )
    return false
  switch (filter) {
    case 'all':
      return true
    case 'installed':
      return territoryRouteReady(region, regions)
    case 'progress':
      return regionOperationBusy(region.components.routing?.status)
    case 'attention':
      return territoryNeedsAttention(region)
  }
}

export function territoryGroupMatches(
  group: CountryTerritoryGroup,
  regions: MapRegionState[],
  query: string,
  filter: TerritoryFilter
) {
  const text = normalizeRegionText(query)
  const regionText = normalizeRegionText(`${group.name} ${group.countryCode}`).includes(text)
    ? ''
    : text
  const entries = [...(group.country ? [group.country] : []), ...group.regions]
  return entries.some((region) => territoryRegionMatches(region, regions, regionText, filter))
}
