import type { MapRegionCatalog, MapRegionDefinition } from '../../types/map_regions.js'
import { MapRegionError, parseMapRegionCatalog } from './map_region_catalog.js'
import { publicMapRegionTerritory } from './map_region_territory.js'

const INDEX = 'https://download.geofabrik.de/index-v1.json'
async function boundedText(url: string, max: number) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new MapRegionError('Public catalog returned HTTP ' + response.status, 502)
  if (Number(response.headers.get('content-length')) > max)
    throw new MapRegionError('Public catalog exceeds the size limit', 502)
  let result = ''
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    result += Buffer.from(chunk).toString('latin1')
    if (Buffer.byteLength(result, 'latin1') > max)
      throw new MapRegionError('Public catalog exceeds the size limit', 502)
  }
  return Buffer.from(result, 'latin1').toString('utf8')
}
export function buildPublicRegionCatalog(
  index: unknown,
  _previous: MapRegionCatalog,
  _ibgeListing = ''
): MapRegionCatalog {
  const data = index as { type?: unknown; features?: unknown[] }
  if (
    data?.type !== 'FeatureCollection' ||
    !Array.isArray(data.features) ||
    data.features.length > 10000
  )
    throw new MapRegionError('Invalid public Geofabrik index', 502)
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  const regions: MapRegionDefinition[] = [
    {
      id: 'world',
      name: 'World',
      coverage: { bbox: [-180, -90, 180, 90] },
      sources: {},
      collectionChildren: [],
    },
  ]
  const propertiesById = new Map<string, Record<string, any>>()
  for (const feature of data.features as any[])
    if (typeof feature?.properties?.id === 'string')
      propertiesById.set(feature.properties.id, feature.properties)
  for (const raw of data.features) {
    const feature = raw as any,
      properties = feature?.properties,
      geometry = feature?.geometry
    if (!properties || typeof properties.id !== 'string' || !geometry || !properties.urls?.pbf)
      continue
    let west = Infinity,
      south = Infinity,
      east = -Infinity,
      north = -Infinity,
      count = 0
    const scan = (node: unknown, depth = 0) => {
      if (depth > 6 || !Array.isArray(node))
        throw new MapRegionError('Invalid public region geometry', 502)
      if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
        if (++count > 2_000_000)
          throw new MapRegionError('Public region geometry is too large', 502)
        west = Math.min(west, node[0])
        south = Math.min(south, node[1])
        east = Math.max(east, node[0])
        north = Math.max(north, node[1])
        return
      }
      for (const child of node) scan(child, depth + 1)
    }
    scan(geometry.coordinates)
    const source = {
      url: properties.urls.pbf,
      format: 'osm-pbf' as const,
      sourceId: 'geofabrik' as const,
    }
    regions.push({
      id: normalize(properties.id),
      name: properties.id === 'brazil' ? 'Brazil' : String(properties.name || properties.id),
      ...publicMapRegionTerritory(properties, propertiesById),
      parentId: normalize(properties.parent || 'world'),
      coverage: { bbox: [west, south, east, north], polygon: geometry },
      sources: { routing: source },
      attribution: '© OpenStreetMap contributors, ODbL 1.0. Extracts by Geofabrik.',
    })
  }
  const ids = new Set(regions.map((region) => region.id))
  for (const region of regions.slice(1)) if (!ids.has(region.parentId!)) region.parentId = 'world'
  if (!ids.has('brazil'))
    throw new MapRegionError(
      'Public catalog did not contain Brazil; existing catalog was preserved',
      502
    )
  regions[0].collectionChildren = regions
    .filter((region) => region.parentId === 'world')
    .map((region) => region.id)
  return parseMapRegionCatalog({
    schema_version: 2,
    regions,
    sourceUrl: INDEX,
    updatedAt: new Date().toISOString(),
  })
}
export async function refreshPublicRegionCatalog(previous: MapRegionCatalog) {
  const index = await boundedText(INDEX, 16 * 1024 ** 2)
  return buildPublicRegionCatalog(JSON.parse(index), previous)
}
