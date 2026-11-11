import type {
  MapRegionDefinition,
  MapRegionComponent,
  MapRegionInstalledComponent,
  MapRegionProvider,
  MapRegionLocalAsset,
  MapRegionPendingProvider,
} from '../../types/map_regions.js'
import type { MapPackState } from '../../types/map_packs.js'
import {
  isInstallableTerritory,
  mapPackTerritory,
  mapRegionTerritory,
} from './map_region_territory.js'

export function regionAncestors(region: MapRegionDefinition, regions: MapRegionDefinition[]) {
  const byId = new Map(regions.map((item) => [item.id, item]))
  const result: MapRegionDefinition[] = []
  const seen = new Set([region.id])
  let next = region.parentId
  while (next && !seen.has(next)) {
    seen.add(next)
    const parent = byId.get(next)
    if (!parent) break
    result.push(parent)
    next = parent.parentId
  }
  return result
}

export function containingBox(outer: number[], inner: number[]) {
  return (
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]
  )
}

/** Inheritance needs trusted catalog ancestry AND a compatible official source,
 * never just overlapping rectangles. Legacy/custom graphs are not proof of it. */
export function regionProvider(
  region: MapRegionDefinition,
  component: MapRegionComponent,
  regions: MapRegionDefinition[],
  installed: MapRegionInstalledComponent[]
): MapRegionProvider | undefined {
  if (component === 'routing' && !isInstallableTerritory(region)) return undefined
  const direct = installed.find(
    (item) => item.regionId === region.id && item.component === component
  )
  const provider = (item: MapRegionInstalledComponent): MapRegionProvider => ({
    regionId: item.regionId,
    name: item.name,
    component,
    version: item.version,
    sourceId: item.source.sourceId,
    namespace: 'regions',
    dataDate: item.dataDate,
  })
  if (direct) return provider(direct)
  const family = region.sources[component]?.sourceId
  // A CNEFE search archive is an independent supplement, not interchangeable
  // with an OSM address index, even when both cover the same country.
  if (family === 'ibge-cnefe') return undefined
  if (!family && component === 'search') return undefined
  for (const ancestor of regionAncestors(region, regions)) {
    if (component === 'routing' && !isInstallableTerritory(ancestor)) continue
    if (ancestor.sources[component]?.sourceId !== 'geofabrik') continue
    const item = installed.find(
      (value) =>
        value.regionId === ancestor.id &&
        value.component === component &&
        value.source.sourceId === 'geofabrik'
    )
    const officialBrazilState =
      component === 'routing' &&
      region.sources.search?.sourceId === 'ibge-cnefe' &&
      region.parentId === 'brazil' &&
      ancestor.id === 'brazil'
    if (item && (officialBrazilState || containingBox(item.coverage.bbox, region.coverage.bbox)))
      return provider(item)
  }
  return undefined
}

/** A pending ancestor is a reservation, never proof of installed coverage. */
export function pendingRegionProvider(
  region: MapRegionDefinition,
  component: MapRegionComponent,
  regions: MapRegionDefinition[],
  pending: MapRegionPendingProvider[]
): MapRegionPendingProvider | undefined {
  if (component === 'routing' && !isInstallableTerritory(region)) return undefined
  if (region.sources[component]?.sourceId === 'ibge-cnefe') return undefined
  if (!region.sources[component] && component === 'search') return undefined
  for (const ancestor of regionAncestors(region, regions)) {
    if (component === 'routing' && !isInstallableTerritory(ancestor)) continue
    if (ancestor.sources[component]?.sourceId !== 'geofabrik') continue
    const owner = pending.find(
      (item) => item.regionId === ancestor.id && item.component === component
    )
    const brazilState =
      component === 'routing' &&
      region.sources.search?.sourceId === 'ibge-cnefe' &&
      region.parentId === 'brazil' &&
      ancestor.id === 'brazil'
    if (owner && (brazilState || containingBox(ancestor.coverage.bbox, region.coverage.bbox)))
      return owner
  }
  return undefined
}

/** Attach imported bytes to existing official nodes; do not create downloadable
 * geographical regions or silently certify an import as complete coverage. */
export function attachLocalAssets(regions: MapRegionDefinition[], packs: MapPackState[]) {
  const result = new Map<string, MapRegionLocalAsset[]>()
  for (const pack of packs) {
    if (!['installed', 'active'].includes(pack.status)) continue
    const territory = mapPackTerritory(pack)
    if (!isInstallableTerritory(territory)) continue
    const candidates = regions.filter(
      (item) =>
        item.sources.routing?.sourceId === 'geofabrik' &&
        isInstallableTerritory(item) &&
        mapRegionTerritory(item).countryCodes[0] === territory.countryCodes[0] &&
        containingBox(item.coverage.bbox, pack.coverage.bbox)
    )
    candidates.sort(
      (a, b) =>
        (a.coverage.bbox[2] - a.coverage.bbox[0]) * (a.coverage.bbox[3] - a.coverage.bbox[1]) -
        (b.coverage.bbox[2] - b.coverage.bbox[0]) * (b.coverage.bbox[3] - b.coverage.bbox[1])
    )
    const region = candidates[0]
    if (!region) continue
    const assets = result.get(region.id) || []
    assets.push({
      id: pack.id,
      name: pack.name,
      component: 'routing',
      version: pack.version,
      sizeBytes: pack.routing.artifact.size_bytes,
      namespace: 'packs',
      partial: true,
      coverageLabel: 'Imported coverage; does not make the whole official region available.',
    })
    result.set(region.id, assets)
  }
  return result
}
