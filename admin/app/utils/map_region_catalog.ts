import type {
  MapRegionCatalog,
  MapRegionComponent,
  MapRegionCoverage,
  MapRegionDefinition,
  MapRegionSource,
} from '../../types/map_regions.js'
import {
  applyRoutingTerritoryPolicy,
  mapRegionTerritory,
  parseTerritoryMetadata,
} from './map_region_territory.js'

export class MapRegionError extends Error {
  constructor(
    message: string,
    public status = 400,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'MapRegionError'
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MapRegionError(`${label} must be an object`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new MapRegionError(`Invalid ${label}`)
  return value
}

export function mapRegionId(value: unknown): string {
  const id = text(value, 'region ID', 120)
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id))
    throw new MapRegionError('Region IDs use lowercase letters, digits, _ and -')
  return id
}

export function mapRegionComponent(value: unknown): MapRegionComponent {
  if (value !== 'routing') throw new MapRegionError('Choose routing')
  return value
}

export function mapRegionComponents(value: unknown): MapRegionComponent[] {
  if (!Array.isArray(value) || value.length !== 1)
    throw new MapRegionError('Choose the routing component')
  const components = value.map(mapRegionComponent)
  if (new Set(components).size !== components.length)
    throw new MapRegionError('Duplicate region components')
  return components
}

export function parseMapRegionCoverage(value: unknown): MapRegionCoverage {
  const coverage = object(value, 'Coverage')
  const bbox = coverage.bbox
  if (
    !Array.isArray(bbox) ||
    bbox.length !== 4 ||
    !bbox.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
    bbox[0] < -180 ||
    bbox[2] > 180 ||
    bbox[1] < -90 ||
    bbox[3] > 90 ||
    bbox[0] >= bbox[2] ||
    bbox[1] >= bbox[3]
  )
    throw new MapRegionError('Invalid region coverage')
  const result: MapRegionCoverage = { bbox: bbox as [number, number, number, number] }
  if (coverage.polygon !== undefined) {
    const polygon = object(coverage.polygon, 'Coverage polygon')
    if (
      !['Polygon', 'MultiPolygon'].includes(String(polygon.type)) ||
      !Array.isArray(polygon.coordinates)
    )
      throw new MapRegionError('Invalid coverage polygon')
    let numbers = 0
    const validate = (node: unknown, depth: number) => {
      if (depth > 5 || !Array.isArray(node)) throw new MapRegionError('Invalid polygon coordinates')
      for (const item of node) {
        if (Array.isArray(item)) validate(item, depth + 1)
        else if (typeof item !== 'number' || !Number.isFinite(item) || ++numbers > 2_000_000)
          throw new MapRegionError('Invalid polygon coordinates')
      }
    }
    validate(polygon.coordinates, 0)
    result.polygon = {
      type: polygon.type as 'Polygon' | 'MultiPolygon',
      coordinates: polygon.coordinates,
    }
  }
  return result
}

function publicSourceUrl(url: string) {
  // All supported provider paths are plain ASCII. Reject raw traversal before
  // URL() normalizes dot segments, and reject nested encodings as well.
  if (/%|\\|[\u0000-\u0020\u007f]/.test(url) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(url))
    throw new MapRegionError('Encoded or ambiguous public source paths are not supported')
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new MapRegionError('Invalid public data URL')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  )
    throw new MapRegionError(
      'Public region sources require an HTTPS URL without credentials or query parameters'
    )
  return parsed
}

function canonicalSourceUrl(parsed: URL, sourceId: MapRegionSource['sourceId']) {
  return (
    (sourceId === 'geofabrik' &&
      parsed.hostname === 'download.geofabrik.de' &&
      /^\/[a-z0-9/_-]+\.osm\.pbf$/.test(parsed.pathname)) ||
    (sourceId === 'ibge-cnefe' &&
      parsed.hostname === 'ftp.ibge.gov.br' &&
      parsed.pathname.startsWith(
        '/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/'
      ) &&
      parsed.pathname.endsWith('.zip'))
  )
}

/** Catalog entries retain the provider's canonical URL, never a mirror URL. */
export function assertMapRegionSourceUrl(url: string, sourceId: MapRegionSource['sourceId']) {
  if (canonicalSourceUrl(publicSourceUrl(url), sourceId)) return
  throw new MapRegionError('This public data source is not supported by the region catalog')
}

/** Explicitly supported HTTP destinations, checked again on every redirect.
 * The GWDG path is the Geofabrik mirror observed in the canonical download's
 * redirect. Other GWDG directories, hosts and URL suffixes remain disallowed. */
export function assertMapRegionRequestUrl(
  url: string,
  sourceId: MapRegionSource['sourceId'],
  kind: 'data' | 'checksum' = 'data'
) {
  if (kind === 'checksum') {
    if (sourceId !== 'geofabrik' || !url.endsWith('.osm.pbf.md5'))
      throw new MapRegionError('Unsupported public checksum source')
    url = url.slice(0, -4)
  }
  const parsed = publicSourceUrl(url)
  if (canonicalSourceUrl(parsed, sourceId)) return
  if (
    sourceId === 'geofabrik' &&
    parsed.hostname === 'ftp5.gwdg.de' &&
    /^\/pub\/misc\/openstreetmap\/download\.geofabrik\.de\/[a-z0-9/_-]+\.osm\.pbf$/.test(
      parsed.pathname
    )
  )
    return
  throw new MapRegionError('The public data source redirected to an unsupported address')
}

export function parseMapRegionSource(value: unknown): MapRegionSource {
  const source = object(value, 'Source')
  if (source.sourceId !== 'geofabrik' && source.sourceId !== 'ibge-cnefe')
    throw new MapRegionError('Unknown public region source')
  if (source.format !== 'osm-pbf' && source.format !== 'cnefe-zip')
    throw new MapRegionError('Unsupported region source format')
  if (
    (source.sourceId === 'geofabrik' && source.format !== 'osm-pbf') ||
    (source.sourceId === 'ibge-cnefe' && source.format !== 'cnefe-zip')
  )
    throw new MapRegionError('Source format does not match its provider')
  const url = text(source.url, 'source URL', 4096)
  assertMapRegionSourceUrl(url, source.sourceId)
  const result: MapRegionSource = { url, sourceId: source.sourceId, format: source.format }
  if (source.sizeBytes !== undefined) {
    if (!Number.isSafeInteger(source.sizeBytes) || (source.sizeBytes as number) <= 0)
      throw new MapRegionError('Invalid source size')
    result.sizeBytes = source.sizeBytes as number
  }
  if (source.checksum !== undefined) {
    const checksum = object(source.checksum, 'Checksum')
    if (checksum.algorithm !== 'md5' && checksum.algorithm !== 'sha256')
      throw new MapRegionError('Unsupported source checksum')
    if (
      typeof checksum.value !== 'string' ||
      !(checksum.algorithm === 'md5' ? /^[a-f0-9]{32}$/i : /^[a-f0-9]{64}$/i).test(checksum.value)
    )
      throw new MapRegionError('Invalid source checksum')
    result.checksum = { algorithm: checksum.algorithm, value: checksum.value.toLowerCase() }
  }
  if (source.dataDate !== undefined) result.dataDate = text(source.dataDate, 'source date', 100)
  return result
}

export function parseMapRegionDefinition(value: unknown): MapRegionDefinition {
  const item = object(value, 'Region')
  const sources = object(item.sources ?? {}, 'Region sources')
  const region: MapRegionDefinition = {
    id: mapRegionId(item.id),
    name: text(item.name, 'region name'),
    coverage: parseMapRegionCoverage(item.coverage),
    sources: {},
  }
  if (item.parentId !== undefined) region.parentId = mapRegionId(item.parentId)
  const territory = parseTerritoryMetadata(item.territoryScope, item.countryCodes)
  if (territory) Object.assign(region, territory)
  Object.assign(region, mapRegionTerritory(region))
  for (const component of ['routing', 'search'] as const) {
    if (sources[component] !== undefined)
      region.sources[component] = parseMapRegionSource(sources[component])
  }
  if (region.sources.search?.sourceId === 'ibge-cnefe')
    region.name = region.name.replace(
      /\s+[�-]\s+endere�os e CEPs\s+\(IBGE\)$/i,
      ' � postal codes (IBGE)'
    )
  if (region.sources.routing?.format === 'cnefe-zip')
    throw new MapRegionError('CNEFE contains addresses, not a road routing graph')
  if (item.attribution !== undefined)
    region.attribution = text(item.attribution, 'attribution', 3000)
  if (item.dataDate !== undefined) region.dataDate = text(item.dataDate, 'data date', 100)
  if (item.collectionChildren !== undefined) {
    if (!Array.isArray(item.collectionChildren))
      throw new MapRegionError('Invalid region collection')
    region.collectionChildren = item.collectionChildren.map(mapRegionId)
  }
  return region
}

export function parseMapRegionCatalog(value: unknown): MapRegionCatalog {
  const data = object(value, 'Region catalog')
  if (data.schema_version !== 2 || !Array.isArray(data.regions))
    throw new MapRegionError('Expected a version 2 region catalog')
  const regions = data.regions.map(parseMapRegionDefinition)
  const ids = new Set(regions.map((r) => r.id))
  if (ids.size !== regions.length) throw new MapRegionError('Duplicate regions in catalog')
  for (const region of regions) {
    if (region.parentId && !ids.has(region.parentId))
      throw new MapRegionError(`Missing parent for region ${region.id}`)
    if (region.collectionChildren?.some((id) => !ids.has(id)))
      throw new MapRegionError(`Missing collection member for region ${region.id}`)
    const ancestors = new Set([region.id])
    let parent = region.parentId
    while (parent) {
      if (ancestors.has(parent)) throw new MapRegionError('Region hierarchy contains a cycle')
      ancestors.add(parent)
      parent = regions.find((candidate) => candidate.id === parent)?.parentId
    }
  }
  return applyRoutingTerritoryPolicy({
    schema_version: 2,
    regions,
    ...(typeof data.updatedAt === 'string' ? { updatedAt: data.updatedAt } : {}),
    ...(typeof data.sourceUrl === 'string' ? { sourceUrl: data.sourceUrl } : {}),
  })
}
