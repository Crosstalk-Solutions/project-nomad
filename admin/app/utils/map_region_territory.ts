import type {
  MapRegionCatalog,
  MapRegionDefinition,
  MapRegionTerritoryScope,
} from '../../types/map_regions.js'
import type { MapPackManifest } from '../../types/map_packs.js'
import { mapRegionTerritoryRegistry } from '../data/map_region_territories.js'
import { MapRegionError } from './map_region_catalog.js'

export type TerritoryScope = MapRegionTerritoryScope
export type MapRegionTerritory = { territoryScope: TerritoryScope; countryCodes: string[] }
type TerritoryInput = {
  id?: string
  regionId?: string
  namespace?: 'packs' | 'regions'
  territoryScope?: unknown
  countryCodes?: unknown
}
const registry = mapRegionTerritoryRegistry as Record<
  string,
  { territoryScope: TerritoryScope; countryCodes: readonly string[] }
>

export function parseTerritoryMetadata(
  scope: unknown,
  countries: unknown
): MapRegionTerritory | undefined {
  if (scope === undefined && countries === undefined) return undefined
  if (
    !['collection', 'country', 'subregion', 'multi_country'].includes(String(scope)) ||
    !Array.isArray(countries) ||
    countries.length > 250 ||
    countries.some((country) => typeof country !== 'string' || !/^[A-Z]{2}$/.test(country))
  )
    throw new MapRegionError('Invalid territory classification')
  const countryCodes = [...new Set(countries as string[])].sort()
  if (
    (['country', 'subregion'].includes(String(scope)) && countryCodes.length !== 1) ||
    (scope === 'multi_country' && countryCodes.length < 2) ||
    (scope === 'collection' && countryCodes.length !== 0)
  )
    throw new MapRegionError('Territory classification does not match its country codes')
  return { territoryScope: scope as TerritoryScope, countryCodes }
}

/** Provider ISO metadata and reviewed source-unit exceptions are authoritative.
 * Neither a root-level position nor a bounding box establishes a country. */
export function mapRegionTerritory(region: TerritoryInput): MapRegionTerritory {
  const key = String(region.id || region.regionId || '')
  const known =
    region.namespace !== 'packs' && !key.startsWith('packs:')
      ? registry[key.replace(/^regions:/, '')]
      : undefined
  if (known) return { territoryScope: known.territoryScope, countryCodes: [...known.countryCodes] }
  try {
    return (
      parseTerritoryMetadata(region.territoryScope, region.countryCodes) || {
        territoryScope: 'collection',
        countryCodes: [],
      }
    )
  } catch {
    return { territoryScope: 'collection', countryCodes: [] }
  }
}

export function isInstallableTerritory(region: TerritoryInput) {
  const territory = mapRegionTerritory(region)
  return (
    ['country', 'subregion'].includes(territory.territoryScope) &&
    territory.countryCodes.length === 1
  )
}

export function mapPackTerritory(pack: MapPackManifest) {
  return mapRegionTerritory({
    territoryScope: pack.coverage.territory_scope,
    countryCodes: pack.coverage.country_codes,
  })
}

export function assertInstallableTerritory(region: TerritoryInput) {
  if (!isInstallableTerritory(region))
    throw new MapRegionError(
      'Collections are navigation only. Choose one country or an official subregion; continental and multi-country routing packages cannot be prepared.',
      409
    )
}

/** New provider units need their own ISO metadata or a verified single-country
 * provider ancestor. Existing units use the bundled, reviewed offline registry. */
export function publicMapRegionTerritory(
  properties: Record<string, any>,
  all: Map<string, Record<string, any>>,
  seen = new Set<string>()
): MapRegionTerritory {
  const id = typeof properties.id === 'string' ? properties.id : ''
  const normalized = id.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  if (registry[normalized]) return mapRegionTerritory({ id: normalized })
  if (seen.has(id)) throw new MapRegionError('Public territory hierarchy contains a cycle', 502)
  seen.add(id)
  const countries = properties['iso3166-1:alpha2']
  if (
    Array.isArray(countries) &&
    countries.length &&
    countries.every((value) => typeof value === 'string' && /^[A-Z]{2}$/.test(value))
  ) {
    const codes = [...new Set(countries as string[])].sort()
    return { territoryScope: codes.length === 1 ? 'country' : 'multi_country', countryCodes: codes }
  }
  const subdivisions = properties['iso3166-2']
  if (
    Array.isArray(subdivisions) &&
    subdivisions.length &&
    subdivisions.every((value) => typeof value === 'string' && /^[A-Z]{2}-.+$/.test(value))
  ) {
    const codes = [...new Set(subdivisions.map((value) => value.slice(0, 2)))].sort() as string[]
    return {
      territoryScope: codes.length === 1 ? 'subregion' : 'multi_country',
      countryCodes: codes,
    }
  }
  const parent = all.get(properties.parent)
  if (parent) {
    const territory = publicMapRegionTerritory(parent, all, seen)
    if (
      ['country', 'subregion'].includes(territory.territoryScope) &&
      territory.countryCodes.length === 1
    )
      return { territoryScope: 'subregion', countryCodes: territory.countryCodes }
  }
  return { territoryScope: 'collection', countryCodes: [] }
}

/** Keep only genuine published routing units. Old source/catalog bytes may
 * remain on disk for legacy management, without enabling new preparation. */
export function applyRoutingTerritoryPolicy(catalog: MapRegionCatalog): MapRegionCatalog {
  const regions: MapRegionDefinition[] = catalog.regions
    .filter(
      (region) =>
        !region.id.startsWith('br-addresses-') && region.sources.search?.sourceId !== 'ibge-cnefe'
    )
    .map((region) => ({
      ...region,
      name: region.id === 'world' ? 'World' : region.id === 'brazil' ? 'Brazil' : region.name,
      ...mapRegionTerritory(region),
      sources:
        isInstallableTerritory(region) && region.sources.routing
          ? { routing: region.sources.routing }
          : {},
    }))
  const ids = new Set(regions.map((region) => region.id))
  for (const region of regions) {
    if (region.collectionChildren)
      region.collectionChildren = region.collectionChildren.filter((id) => ids.has(id))
    if (region.parentId && !ids.has(region.parentId)) delete region.parentId
  }
  return { ...catalog, regions }
}
