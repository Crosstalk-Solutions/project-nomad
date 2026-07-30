import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, link, mkdir, rm, stat } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

import { PMTILES_BINARY_PATH } from '../../constants/map_regions.js'
import type { RasterMapArchiveMetadata } from '../../types/maps.js'

const execFileAsync = promisify(execFile)
const SAFE_ARCHIVE_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}\.pmtiles$/
const SAFE_RESOURCE_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/
const SAFE_REGION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/
const HTTPS_URL = /^https:\/\//i
const TILE_FORMATS: Readonly<Record<string, RasterMapArchiveMetadata['tileFormat']>> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
}

export type RasterPmtilesConversionRequest = Pick<
  RasterMapArchiveMetadata,
  | 'filename'
  | 'resourceId'
  | 'role'
  | 'regionId'
  | 'tileSize'
  | 'attribution'
  | 'sourceUrl'
  | 'sourceVersion'
> & {
  sourceMbtilesPath: string
  outputDirectory: string
}

export type RasterPmtilesCommandResult = {
  stdout: string
  stderr: string
}

export type RasterPmtilesConversionDependencies = {
  runPmtiles?: (args: string[]) => Promise<RasterPmtilesCommandResult>
  now?: () => Date
}

export type RasterPmtilesConversionResult = {
  outputPath: string
  archive: RasterMapArchiveMetadata
}

type PmtilesHeader = Pick<RasterMapArchiveMetadata, 'tileFormat' | 'minzoom' | 'maxzoom' | 'bounds'>

async function defaultPmtilesRunner(args: string[]): Promise<RasterPmtilesCommandResult> {
  const result = await execFileAsync(PMTILES_BINARY_PATH, args, {
    maxBuffer: 1024 * 1024,
  })
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }
}

function parseRasterHeader(value: string): PmtilesHeader {
  let header: unknown
  try {
    header = JSON.parse(value)
  } catch {
    throw new Error('pmtiles show returned malformed header JSON')
  }
  if (!header || typeof header !== 'object') {
    throw new Error('pmtiles show returned an invalid header')
  }

  const candidate = header as Record<string, unknown>
  const tileFormat =
    typeof candidate.tile_type === 'string' ? TILE_FORMATS[candidate.tile_type] : undefined
  const bounds = candidate.bounds
  const minzoom = candidate.minzoom
  const maxzoom = candidate.maxzoom
  if (!tileFormat) throw new Error('Converted PMTiles archive is not a supported raster tile set')
  if (
    !Number.isInteger(minzoom) ||
    !Number.isInteger(maxzoom) ||
    (minzoom as number) < 0 ||
    (maxzoom as number) > 30 ||
    (minzoom as number) > (maxzoom as number)
  ) {
    throw new Error('Converted PMTiles archive has invalid zoom metadata')
  }
  if (
    !Array.isArray(bounds) ||
    bounds.length !== 4 ||
    !bounds.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
  ) {
    throw new Error('Converted PMTiles archive has invalid bounds metadata')
  }
  const [west, south, east, north] = bounds as number[]
  if (
    west < -180 ||
    west > 180 ||
    east < -180 ||
    east > 180 ||
    south < -90 ||
    south > 90 ||
    north < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    throw new Error('Converted PMTiles archive has invalid bounds metadata')
  }

  return {
    tileFormat,
    minzoom: minzoom as number,
    maxzoom: maxzoom as number,
    bounds: [west, south, east, north],
  }
}

async function sha256File(filepath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filepath)) hash.update(chunk)
  return hash.digest('hex')
}

function validateRequest(request: RasterPmtilesConversionRequest): void {
  if (
    !SAFE_ARCHIVE_FILENAME.test(request.filename) ||
    basename(request.filename) !== request.filename
  ) {
    throw new Error('Invalid PMTiles output filename')
  }
  if (extname(request.sourceMbtilesPath).toLowerCase() !== '.mbtiles') {
    throw new Error('Raster conversion input must be an MBTiles archive')
  }
  if (!SAFE_RESOURCE_ID.test(request.resourceId)) throw new Error('Invalid map resource ID')
  if (!SAFE_REGION_ID.test(request.regionId)) throw new Error('Invalid map region ID')
  if (request.role !== 'aerial' && request.role !== 'topographic') {
    throw new Error('Invalid raster map role')
  }
  if (![128, 256, 512, 1024].includes(request.tileSize)) {
    throw new Error('Invalid raster tile size')
  }
  if (!request.attribution.trim()) throw new Error('Raster attribution is required')
  if (!HTTPS_URL.test(request.sourceUrl)) throw new Error('Raster source URL must use HTTPS')
  if (!request.sourceVersion.trim()) throw new Error('Raster source version is required')
}

/**
 * Convert a provider-produced raster MBTiles archive into a verified PMTiles
 * archive. The converter owns format inspection, checksum generation, and
 * atomic activation; provider adapters only supply provenance and staging paths.
 */
export async function convertRasterMbtilesToPmtiles(
  request: RasterPmtilesConversionRequest,
  dependencies: RasterPmtilesConversionDependencies = {}
): Promise<RasterPmtilesConversionResult> {
  validateRequest(request)
  const outputDirectory = resolve(request.outputDirectory)
  const outputPath = resolve(join(outputDirectory, request.filename))
  if (!outputPath.startsWith(outputDirectory + sep)) throw new Error('Invalid PMTiles output path')

  await mkdir(outputDirectory, { recursive: true })
  try {
    await access(outputPath)
    throw new Error(`PMTiles output already exists: ${request.filename}`)
  } catch (error) {
    if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error
  }

  const stagingPath = join(
    outputDirectory,
    `.${request.filename}.${randomBytes(8).toString('hex')}.partial`
  )
  const runPmtiles = dependencies.runPmtiles ?? defaultPmtilesRunner
  const now = dependencies.now ?? (() => new Date())

  try {
    await runPmtiles(['convert', resolve(request.sourceMbtilesPath), stagingPath])
    await runPmtiles(['verify', stagingPath])
    const inspected = await runPmtiles(['show', stagingPath, '--header-json'])
    const header = parseRasterHeader(inspected.stdout)
    const [sha256, outputStats] = await Promise.all([sha256File(stagingPath), stat(stagingPath)])
    const archive: RasterMapArchiveMetadata = {
      filename: request.filename,
      resourceId: request.resourceId,
      kind: 'raster',
      role: request.role,
      regionId: request.regionId,
      tileFormat: header.tileFormat,
      tileSize: request.tileSize,
      minzoom: header.minzoom,
      maxzoom: header.maxzoom,
      bounds: header.bounds,
      attribution: request.attribution,
      sourceUrl: request.sourceUrl,
      sourceVersion: request.sourceVersion,
      sha256,
      installedBytes: outputStats.size,
      verifiedAt: now().toISOString(),
    }

    try {
      await link(stagingPath, outputPath)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
        throw new Error(`PMTiles output already exists: ${request.filename}`)
      }
      throw error
    }
    await rm(stagingPath)
    return { outputPath, archive }
  } catch (error) {
    await rm(stagingPath, { force: true })
    throw error
  }
}
