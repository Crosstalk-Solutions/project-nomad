import type { MapPackCatalog, MapPackManifest, MapPackProfile } from '../../types/map_packs.js'
import { parseTerritoryMetadata } from './map_region_territory.js'

export class MapPackError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message)
    this.name = 'MapPackError'
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MapPackError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, label: string, max = 1000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new MapPackError(`${label} must be a nonempty string of at most ${max} characters`)
  }
  return value
}

export function mapPackId(value: unknown): string {
  const id = text(value, 'Package ID', 80)
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
    throw new MapPackError('Package ID must contain only lowercase letters, numbers, _ or -')
  }
  return id
}

function version(value: unknown): string {
  const result = text(value, 'Package version', 80)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(result)) {
    throw new MapPackError('Invalid package version')
  }
  return result
}

/** Parse the trusted, administrator-managed catalog, never a request-supplied manifest. */
export function parseMapPackManifest(value: unknown): MapPackManifest {
  const manifest = object(value, 'Manifest')
  if (manifest.schema_version !== 1) throw new MapPackError('Unsupported map package schema')
  const coverage = object(manifest.coverage, 'Coverage')
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
  ) {
    throw new MapPackError('Coverage bbox must be [west, south, east, north] within world bounds')
  }
  const routing = object(manifest.routing, 'Routing')
  if (routing.engine !== 'valhalla') throw new MapPackError('Unsupported routing engine')
  const profiles = routing.profiles
  if (
    !Array.isArray(profiles) ||
    profiles.length === 0 ||
    profiles.some((p) => p !== 'auto' && p !== 'pedestrian') ||
    new Set(profiles).size !== profiles.length
  ) {
    throw new MapPackError(
      'Routing profiles must contain auto and/or pedestrian without duplicates'
    )
  }
  const artifact = object(routing.artifact, 'Routing artifact')
  if (artifact.filename !== 'routing.tar') {
    throw new MapPackError('The routing artifact filename must be routing.tar')
  }
  const url = text(artifact.url, 'Artifact URL', 4096)
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new MapPackError('Invalid artifact URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new MapPackError('Artifact URL must use HTTP(S) without credentials')
  }
  if (!Number.isSafeInteger(artifact.size_bytes) || (artifact.size_bytes as number) <= 0) {
    throw new MapPackError('Artifact size_bytes must be a positive safe integer')
  }
  if (typeof artifact.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(artifact.sha256)) {
    throw new MapPackError('Artifact sha256 must be a SHA-256 digest')
  }
  const result: MapPackManifest = {
    schema_version: 1,
    id: mapPackId(manifest.id),
    name: text(manifest.name, 'Package name', 200),
    version: version(manifest.version),
    coverage: { bbox: bbox as [number, number, number, number] },
    routing: {
      engine: 'valhalla',
      profiles: profiles as MapPackProfile[],
      artifact: {
        url,
        filename: 'routing.tar',
        size_bytes: artifact.size_bytes as number,
        sha256: artifact.sha256.toLowerCase(),
      },
    },
  }
  for (const key of ['description', 'source', 'created_at', 'attribution'] as const) {
    if (manifest[key] !== undefined) result[key] = text(manifest[key], key, 2000)
  }
  if (coverage.description !== undefined) {
    result.coverage.description = text(coverage.description, 'Coverage description', 2000)
  }
  try {
    const territory = parseTerritoryMetadata(coverage.territory_scope, coverage.country_codes)
    if (territory) {
      result.coverage.territory_scope = territory.territoryScope
      result.coverage.country_codes = territory.countryCodes
    }
  } catch (error) {
    throw new MapPackError(`Invalid package coverage territory: ${(error as Error).message}`)
  }
  return result
}

export function parseMapPackCatalog(value: unknown): MapPackCatalog {
  const catalog = object(value, 'Catalog')
  if (catalog.schema_version !== 1 || !Array.isArray(catalog.packages)) {
    throw new MapPackError('Catalog must use schema_version 1 and contain packages')
  }
  const packages = catalog.packages.map(parseMapPackManifest)
  if (new Set(packages.map((p) => p.id)).size !== packages.length) {
    throw new MapPackError('Catalog contains duplicate package IDs')
  }
  return { schema_version: 1, packages }
}
