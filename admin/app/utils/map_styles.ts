import urlJoin from 'url-join'
import { open } from 'node:fs/promises'
import { bytesToHeader } from 'pmtiles'

import type { FileEntry } from '../../types/files.js'
import type {
  BaseStylesFile,
  MapArchiveMetadata,
  MapLayer,
  MapSource,
  MapSourceDefinition,
  ParsedMapArchiveManifest,
} from '../../types/maps.js'

export const DEFAULT_VECTOR_MAP_ATTRIBUTION =
  '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>'
export const MAP_ARCHIVE_MANIFEST_FILENAME = 'map-archive-manifest.json'

const MAP_ARCHIVE_KINDS = new Set(['vector', 'raster'])
const MAP_ARCHIVE_ROLES = new Set(['street', 'aerial', 'topographic'])
const MAP_TILE_FORMATS = new Set(['mvt', 'jpeg', 'png', 'webp'])
const RASTER_TILE_FORMATS = new Set(['jpeg', 'png', 'webp'])
const SAFE_RESOURCE_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/
const SAFE_REGION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/
const SHA256_DIGEST = /^[a-f0-9]{64}$/i
const HTTPS_URL = /^https:\/\//i
const RESERVED_RASTER_FILENAME = /^raster[-_]/i
const PMTILES_HEADER_LENGTH = 127
const MAX_CACHED_HEADERS = 256
const legacyHeaderCache = new Map<string, { identity: string; zoom: Promise<number | null> }>()

async function readLegacyMaxZoom(filepath: string): Promise<number | null> {
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(filepath, 'r')
    const info = await handle.stat({ bigint: true })
    if (!info.isFile() || info.size < BigInt(PMTILES_HEADER_LENGTH)) return null
    const identity = `${info.dev}/${info.ino}/${info.size}/${info.mtimeNs}/${info.ctimeNs}`
    const cached = legacyHeaderCache.get(filepath)
    if (cached?.identity === identity) {
      legacyHeaderCache.delete(filepath)
      legacyHeaderCache.set(filepath, cached)
      return await cached.zoom
    }
    const file = handle
    const zoom = (async () => {
      const buffer = Buffer.alloc(PMTILES_HEADER_LENGTH)
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      if (bytesRead !== PMTILES_HEADER_LENGTH || buffer.toString('ascii', 0, 7) !== 'PMTiles' || buffer[7] !== 3) return null
      const header = bytesToHeader(Uint8Array.from(buffer).buffer)
      // Only a readable vector v3 header can refine legacy vector metadata.
      if (header.tileType !== 1 || !validZoom(header.minZoom) || !validZoom(header.maxZoom) || header.minZoom > header.maxZoom) return null
      return header.maxZoom
    })().catch(() => null)
    legacyHeaderCache.delete(filepath)
    legacyHeaderCache.set(filepath, { identity, zoom })
    while (legacyHeaderCache.size > MAX_CACHED_HEADERS) legacyHeaderCache.delete(legacyHeaderCache.keys().next().value!)
    return await zoom
  } catch {
    // Missing, replaced or unreadable files keep the legacy unknown-zoom fallback.
    return null
  } finally {
    await handle?.close().catch(() => {})
  }
}

/** Read just the fixed headers of selected legacy vectors, never raster or rejected files.
 * Cache identity follows the opened inode and timestamps, not a filename/version guess.
 */
export async function readLegacyMapMaxZooms(
  regions: FileEntry[], parsedManifest?: ParsedMapArchiveManifest,
): Promise<ReadonlyMap<string, number | null>> {
  const explicit = new Set(parsedManifest?.archives.map((archive) => archive.filename) ?? [])
  const paths = new Map(regions.filter((entry): entry is Extract<FileEntry, { type: 'file' }> => entry.type === 'file')
    .map((entry) => [entry.name, entry.key]))
  const selected = buildMapSourceDefinitions('', regions, parsedManifest)
    .filter(({ archive }) => archive.kind === 'vector' && !explicit.has(archive.filename))
  const zooms = new Map<string, number | null>()
  for (let offset = 0; offset < selected.length; offset += 8) {
    const batch = selected.slice(offset, offset + 8)
    const values = await Promise.all(batch.map(({ archive }) => readLegacyMaxZoom(paths.get(archive.filename)!)))
    batch.forEach(({ archive }, index) => zooms.set(archive.filename, values[index]))
  }
  return zooms
}

function optionalNonNegativeNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
}

function validZoom(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 30)
  )
}

function validBounds(value: unknown): value is [number, number, number, number] | undefined {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length !== 4) return false
  if (!value.every((item) => typeof item === 'number' && Number.isFinite(item))) return false
  const [west, south, east, north] = value
  return (
    west >= -180 &&
    west <= 180 &&
    east >= -180 &&
    east <= 180 &&
    south >= -90 &&
    south <= 90 &&
    north >= -90 &&
    north <= 90 &&
    west < east &&
    south < north
  )
}

function validTimestamp(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && Number.isFinite(Date.parse(value)))
}

function isMapArchiveMetadata(value: unknown): value is MapArchiveMetadata {
  if (!value || typeof value !== 'object') return false
  const archive = value as Record<string, unknown>

  if (
    typeof archive.filename !== 'string' ||
    !archive.filename.endsWith('.pmtiles') ||
    archive.filename.includes('/') ||
    archive.filename.includes('\\') ||
    typeof archive.resourceId !== 'string' ||
    !SAFE_RESOURCE_ID.test(archive.resourceId) ||
    typeof archive.kind !== 'string' ||
    !MAP_ARCHIVE_KINDS.has(archive.kind)
  ) {
    return false
  }

  if (
    archive.role !== undefined &&
    (typeof archive.role !== 'string' || !MAP_ARCHIVE_ROLES.has(archive.role))
  ) {
    return false
  }
  if (
    archive.regionId !== undefined &&
    (typeof archive.regionId !== 'string' || !SAFE_REGION_ID.test(archive.regionId))
  ) {
    return false
  }
  if (
    archive.tileFormat !== undefined &&
    (typeof archive.tileFormat !== 'string' || !MAP_TILE_FORMATS.has(archive.tileFormat))
  ) {
    return false
  }
  if (
    archive.tileSize !== undefined &&
    ![128, 256, 512, 1024].includes(archive.tileSize as number)
  ) {
    return false
  }
  if (
    !validZoom(archive.minzoom) ||
    !validZoom(archive.maxzoom) ||
    !optionalNonNegativeNumber(archive.installedBytes) ||
    !validBounds(archive.bounds)
  ) {
    return false
  }
  if (
    typeof archive.minzoom === 'number' &&
    typeof archive.maxzoom === 'number' &&
    archive.minzoom > archive.maxzoom
  ) {
    return false
  }
  if (
    archive.sha256 !== undefined &&
    (typeof archive.sha256 !== 'string' || !SHA256_DIGEST.test(archive.sha256))
  ) {
    return false
  }
  if (!validTimestamp(archive.verifiedAt)) return false
  if (
    archive.sourceUrl !== undefined &&
    (typeof archive.sourceUrl !== 'string' || !HTTPS_URL.test(archive.sourceUrl))
  ) {
    return false
  }
  for (const field of ['attribution', 'sourceVersion'] as const) {
    if (
      archive[field] !== undefined &&
      (typeof archive[field] !== 'string' || archive[field].trim().length === 0)
    ) {
      return false
    }
  }

  if (archive.kind === 'vector' && (archive.role !== 'street' || archive.tileFormat !== 'mvt')) {
    return false
  }

  if (archive.kind === 'raster') {
    if (
      (archive.role !== 'aerial' && archive.role !== 'topographic') ||
      typeof archive.regionId !== 'string' ||
      typeof archive.tileFormat !== 'string' ||
      !RASTER_TILE_FORMATS.has(archive.tileFormat) ||
      typeof archive.tileSize !== 'number' ||
      typeof archive.minzoom !== 'number' ||
      typeof archive.maxzoom !== 'number' ||
      !archive.bounds ||
      typeof archive.attribution !== 'string' ||
      typeof archive.sourceUrl !== 'string' ||
      typeof archive.sourceVersion !== 'string' ||
      typeof archive.sha256 !== 'string' ||
      typeof archive.installedBytes !== 'number' ||
      typeof archive.verifiedAt !== 'string'
    ) {
      return false
    }
  }

  return true
}

function candidateFilename(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const filename = (value as { filename?: unknown }).filename
  return typeof filename === 'string' && filename.endsWith('.pmtiles') ? filename : null
}

/**
 * Parse the sidecar manifest defensively. Invalid records are isolated, while
 * their filenames remain blocked from legacy-vector fallback.
 */
export function parseMapArchiveManifest(value: unknown): ParsedMapArchiveManifest {
  const invalid: ParsedMapArchiveManifest = {
    status: 'invalid',
    archives: [],
    rejectedFilenames: [],
  }
  if (!value || typeof value !== 'object') return invalid
  const manifest = value as { schemaVersion?: unknown; archives?: unknown }
  if (
    manifest.schemaVersion !== 1 ||
    !manifest.archives ||
    typeof manifest.archives !== 'object' ||
    Array.isArray(manifest.archives)
  ) {
    return invalid
  }

  const entries = Object.entries(manifest.archives)
  const archives: MapArchiveMetadata[] = []
  const rejectedFilenames = new Set<string>()
  const filenames = new Set<string>()
  const resourceIds = new Set<string>()

  for (const [key, candidate] of entries) {
    const keyFilename = typeof key === 'string' && key.endsWith('.pmtiles') ? key : null
    const embeddedFilename = candidateFilename(candidate)
    const reject = () => {
      if (keyFilename) rejectedFilenames.add(keyFilename)
      if (embeddedFilename) rejectedFilenames.add(embeddedFilename)
    }

    if (
      !keyFilename ||
      !isMapArchiveMetadata(candidate) ||
      candidate.filename !== keyFilename ||
      filenames.has(candidate.filename) ||
      resourceIds.has(candidate.resourceId)
    ) {
      reject()
      continue
    }

    filenames.add(candidate.filename)
    resourceIds.add(candidate.resourceId)
    archives.push({ ...candidate })
  }

  return { status: 'valid', archives, rejectedFilenames: [...rejectedFilenames] }
}

export function parseMapArchiveManifestJson(value: string): ParsedMapArchiveManifest {
  try {
    return parseMapArchiveManifest(JSON.parse(value))
  } catch {
    return { status: 'invalid', archives: [], rejectedFilenames: [] }
  }
}

function compareMapArchiveVersions(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a < b ? -1 : 1
}

function parseLegacyMapFilename(filename: string): { resourceId: string; version: string } | null {
  const name = filename.replace(/\.pmtiles$/, '')
  const match = name.match(/^(.+)_(\d{4}-\d{2})$/)
  if (!match) return null
  return { resourceId: match[1], version: match[2] }
}

export function sourceFromArchive(baseUrl: string, archive: MapArchiveMetadata): MapSource {
  const source: MapSource = {
    type: archive.kind,
    url: `pmtiles://${urlJoin(baseUrl, archive.filename)}`,
  }
  if (archive.attribution) source.attribution = archive.attribution
  if (archive.tileSize !== undefined) source.tileSize = archive.tileSize
  if (archive.minzoom !== undefined) source.minzoom = archive.minzoom
  if (archive.maxzoom !== undefined) source.maxzoom = archive.maxzoom
  if (archive.bounds !== undefined) source.bounds = [...archive.bounds]
  return source
}

/**
 * Build collision-free style sources from exact archive filenames.
 *
 * Existing archives without a manifest entry retain legacy vector behavior.
 * Files rejected from an explicit manifest never receive that fallback.
 */
export function buildMapSourceDefinitions(
  baseUrl: string,
  regions: FileEntry[],
  parsedManifest: ParsedMapArchiveManifest = {
    status: 'absent',
    archives: [],
    rejectedFilenames: [],
  },
  legacyMaxZooms: ReadonlyMap<string, number | null> = new Map()
): MapSourceDefinition[] {
  const metadataByFilename = new Map(
    parsedManifest.archives.map((archive) => [archive.filename, archive])
  )
  const rejectedFilenames = new Set(parsedManifest.rejectedFilenames)
  const definitions: MapSourceDefinition[] = []
  const usedSourceIds = new Set<string>()
  const bestLegacyByRegion = new Map<
    string,
    { region: Extract<FileEntry, { type: 'file' }>; version: string | null }
  >()

  for (const region of regions) {
    if (region.type !== 'file' || !region.name.endsWith('.pmtiles')) continue
    const archive = metadataByFilename.get(region.name)
    if (archive) {
      if (usedSourceIds.has(archive.resourceId)) continue
      usedSourceIds.add(archive.resourceId)
      definitions.push({
        id: archive.resourceId,
        source: sourceFromArchive(baseUrl, archive),
        archive,
      })
      continue
    }
    if (
      parsedManifest.status === 'invalid' ||
      rejectedFilenames.has(region.name) ||
      RESERVED_RASTER_FILENAME.test(region.name)
    ) {
      continue
    }

    const parsed = parseLegacyMapFilename(region.name)
    const regionName = parsed ? parsed.resourceId : region.name.replace('.pmtiles', '')
    const version = parsed?.version ?? null
    const existing = bestLegacyByRegion.get(regionName)
    if (!existing || compareMapArchiveVersions(version, existing.version) > 0) {
      bestLegacyByRegion.set(regionName, { region, version })
    }
  }

  for (const [resourceId, { region }] of bestLegacyByRegion) {
    if (usedSourceIds.has(resourceId)) continue
    usedSourceIds.add(resourceId)
    const archive: MapArchiveMetadata = {
      filename: region.name,
      resourceId,
      kind: 'vector',
      role: 'street',
      tileFormat: 'mvt',
      attribution: DEFAULT_VECTOR_MAP_ATTRIBUTION,
    }
    const maxzoom = legacyMaxZooms.get(region.name)
    if (typeof maxzoom === 'number' && validZoom(maxzoom)) archive.maxzoom = maxzoom
    definitions.push({
      id: resourceId,
      source: sourceFromArchive(baseUrl, archive),
      archive,
    })
  }

  // Vector groups draw back-to-front. Keep explicit raster ordering intact, while
  // ensuring a coarse vector extract cannot overzoom-paint a finer one.
  const vectors = definitions.filter(({ archive }) => archive.kind === 'vector').sort((a, b) => {
    const az = a.archive.maxzoom ?? Number.POSITIVE_INFINITY
    const bz = b.archive.maxzoom ?? Number.POSITIVE_INFINITY
    if (az !== bz) return az < bz ? -1 : 1
    const an = a.archive.filename, bn = b.archive.filename
    if (an !== bn) return an < bn ? -1 : 1
    return a.id === b.id ? 0 : a.id < b.id ? -1 : 1
  })
  let vectorIndex = 0
  return definitions.map((definition) => definition.archive.kind === 'vector' ? vectors[vectorIndex++] : definition)
}

/**
 * Compose raster and vector sources without mutating the base style template.
 * Raster layers are emitted below cloned vector layers and hidden until a map
 * presentation control explicitly activates them.
 */
export function composeMapStyle(
  template: BaseStylesFile,
  sources: MapSourceDefinition[],
  sprites: string,
  glyphs: string
): BaseStylesFile {
  const vectorTemplates = template.layers.filter((layer) => layer.source)
  const sourceIndependentLayers = template.layers
    .filter((layer) => !layer.source)
    .map((layer) => ({ ...layer }))
  const rasterLayers: MapLayer[] = []
  const vectorLayers: MapLayer[] = []
  const styleSources: BaseStylesFile['sources'] = {}

  for (const definition of sources) {
    styleSources[definition.id] = { ...definition.source }

    if (definition.archive.kind === 'raster') {
      rasterLayers.push({
        id: `raster-${definition.id}`,
        type: 'raster',
        source: definition.id,
        layout: { visibility: 'none' },
        metadata: {
          'nomad:role': definition.archive.role,
          'nomad:regionId': definition.archive.regionId,
        },
      })
      continue
    }
    if (definition.archive.kind !== 'vector') continue

    for (const layerTemplate of vectorTemplates) {
      vectorLayers.push({
        ...layerTemplate,
        id: `${layerTemplate.id}-${definition.id}`,
        type: layerTemplate.type,
        source: definition.id,
      })
    }
  }

  return {
    ...template,
    sources: styleSources,
    layers: [...sourceIndependentLayers, ...rasterLayers, ...vectorLayers],
    sprite: sprites,
    glyphs,
  }
}
