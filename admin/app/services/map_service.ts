import { BaseStylesFile, MapLayer } from '../../types/maps.js'
import {
  DownloadRemoteSuccessCallback,
  FileEntry,
} from '../../types/files.js'
import { doResumableDownloadWithRetry } from '../utils/downloads.js'
import { extract } from 'tar'
import env from '#start/env'
import {
  listDirectoryContentsRecursive,
  getFileStatsIfExists,
  deleteFileIfExists,
  getFile,
  ensureDirectoryExists,
} from '../utils/fs.js'
import { join, resolve, sep } from 'path'
import urlJoin from 'url-join'
import { RunDownloadJob } from '#jobs/run_download_job'
import { RunExtractPmtilesJob } from '#jobs/run_extract_pmtiles_job'
import logger from '@adonisjs/core/services/logger'
import { assertNotPrivateUrl } from '#validators/common'
import InstalledResource from '#models/installed_resource'
import { CollectionManifestService } from './collection_manifest_service.js'
import type { CollectionWithStatus, MapsSpec } from '../../types/collections.js'
import type { Country, CountryCode, CountryGroup, MapExtractPreflight } from '../../types/maps.js'
import {
  EXTRACT_DEFAULT_MAX_ZOOM,
  EXTRACT_MAX_ZOOM,
  EXTRACT_MIN_ZOOM,
  PMTILES_BINARY_PATH,
  WORLD_BASEMAP_FILENAME,
  WORLD_BASEMAP_MAX_ZOOM,
  WORLD_BASEMAP_SOURCE_NAME,
  buildPmtilesExtractArgs,
} from '../../constants/map_regions.js'
import { CountriesService } from './countries_service.js'
import { execFile } from 'child_process'
import { createHash, randomBytes } from 'crypto'
import { tmpdir } from 'os'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const DRY_RUN_TIMEOUT_MS = 60_000
const DRY_RUN_MAX_BUFFER = 256 * 1024
// Real extract of z0-5 world tiles; generous to tolerate slow/metered links
// since a failure leaves the map grey for uncovered regions.
const WORLD_BASEMAP_EXTRACT_TIMEOUT_MS = 5 * 60_000

const PROTOMAPS_BUILDS_METADATA_URL = 'https://build-metadata.protomaps.dev/builds.json'
const PROTOMAPS_BUILD_BASE_URL = 'https://build.protomaps.com'

export interface ProtomapsBuildInfo {
  url: string
  date: string
  size: number
  key: string
}

const BASE_ASSETS_MIME_TYPES = [
  'application/gzip',
  'application/x-gzip',
  'application/octet-stream',
]

const PMTILES_ATTRIBUTION =
  '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>'
const PMTILES_MIME_TYPES = ['application/vnd.pmtiles', 'application/octet-stream']

interface IMapService {
  downloadRemoteSuccessCallback: DownloadRemoteSuccessCallback
}

export class MapService implements IMapService {
  private readonly mapStoragePath = '/storage/maps'
  private readonly baseStylesFile = 'nomad-base-styles.json'
  private readonly basemapsAssetsDir = 'basemaps-assets'
  private readonly baseAssetsTarFile = 'base-assets.tar.gz'
  private readonly baseDirPath = join(process.cwd(), this.mapStoragePath)
  private baseAssetsExistCache: boolean | null = null
  private worldBasemapReady = false
  private worldBasemapInFlight: Promise<void> | null = null

  async listRegions() {
    const files = (await this.listAllMapStorageItems()).filter(
      (item) =>
        item.type === 'file' &&
        item.name.endsWith('.pmtiles') &&
        item.name !== WORLD_BASEMAP_FILENAME
    )

    return {
      files,
    }
  }

  async downloadBaseAssets(url?: string) {
    const tempTarPath = join(this.baseDirPath, this.baseAssetsTarFile)

    const defaultTarFileURL = new URL(
      this.baseAssetsTarFile,
      'https://github.com/Crosstalk-Solutions/project-nomad-maps/raw/refs/heads/master/'
    )

    const resolvedURL = url ? new URL(url) : defaultTarFileURL
    await doResumableDownloadWithRetry({
      url: resolvedURL.toString(),
      filepath: tempTarPath,
      timeout: 30000,
      max_retries: 2,
      allowedMimeTypes: BASE_ASSETS_MIME_TYPES,
      onAttemptError(error, attempt) {
        console.error(`Attempt ${attempt} to download tar file failed: ${error.message}`)
      },
    })
    const tarFileBuffer = await getFileStatsIfExists(tempTarPath)
    if (!tarFileBuffer) {
      throw new Error(`Failed to download tar file`)
    }

    await extract({
      cwd: join(process.cwd(), this.mapStoragePath),
      file: tempTarPath,
      strip: 1,
    })

    await deleteFileIfExists(tempTarPath)

    // Invalidate cache since we just downloaded new assets
    this.baseAssetsExistCache = true

    return true
  }

  async downloadCollection(slug: string): Promise<string[] | null> {
    const manifestService = new CollectionManifestService()
    const spec = await manifestService.getSpecWithFallback<MapsSpec>('maps')
    if (!spec) return null

    const collection = spec.collections.find((c) => c.slug === slug)
    if (!collection) return null

    // Filter out already installed
    const installed = await InstalledResource.query().where('resource_type', 'map')
    const installedIds = new Set(installed.map((r) => r.resource_id))
    const toDownload = collection.resources.filter((r) => !installedIds.has(r.id))

    if (toDownload.length === 0) return null

    const downloadFilenames: string[] = []

    for (const resource of toDownload) {
      try {
        assertNotPrivateUrl(resource.url)
      } catch {
        logger.warn(`[MapService] Blocked download from private/loopback URL: ${resource.url}`)
        continue
      }

      const existing = await RunDownloadJob.getActiveByUrl(resource.url)
      if (existing) {
        logger.warn(`[MapService] Download already in progress for URL ${resource.url}, skipping.`)
        continue
      }

      const filename = resource.url.split('/').pop()
      if (!filename) {
        logger.warn(`[MapService] Could not determine filename from URL ${resource.url}, skipping.`)
        continue
      }

      downloadFilenames.push(filename)
      const filepath = join(process.cwd(), this.mapStoragePath, 'pmtiles', filename)

      await RunDownloadJob.dispatch({
        url: resource.url,
        filepath,
        timeout: 30000,
        allowedMimeTypes: PMTILES_MIME_TYPES,
        forceNew: true,
        filetype: 'map',
        title: (resource as any).title || undefined,
        resourceMetadata: {
          resource_id: resource.id,
          version: resource.version,
          collection_ref: slug,
        },
      })
    }

    return downloadFilenames.length > 0 ? downloadFilenames : null
  }

  async downloadRemoteSuccessCallback(urls: string[], _: boolean) {
    // Create InstalledResource entries for downloaded map files
    for (const url of urls) {
      const filename = url.split('/').pop()
      if (!filename) continue

      const parsed = CollectionManifestService.parseMapFilename(filename)
      if (!parsed) continue

      const filepath = join(process.cwd(), this.mapStoragePath, 'pmtiles', filename)
      const stats = await getFileStatsIfExists(filepath)

      try {
        const { DateTime } = await import('luxon')
        await InstalledResource.updateOrCreate(
          { resource_id: parsed.resource_id, resource_type: 'map' },
          {
            version: parsed.version,
            url: url,
            file_path: filepath,
            file_size_bytes: stats ? Number(stats.size) : null,
            installed_at: DateTime.now(),
          }
        )
        logger.info(`[MapService] Created InstalledResource entry for: ${parsed.resource_id}`)
      } catch (error) {
        logger.error(`[MapService] Failed to create InstalledResource for ${filename}:`, error)
      }
    }
  }

  async downloadRemote(url: string): Promise<{ filename: string; jobId?: string }> {
    const parsed = new URL(url)
    if (!parsed.pathname.endsWith('.pmtiles')) {
      throw new Error(`Invalid PMTiles file URL: ${url}. URL must end with .pmtiles`)
    }

    const existing = await RunDownloadJob.getActiveByUrl(url)
    if (existing) {
      throw new Error(`Download already in progress for URL ${url}`)
    }

    const filename = url.split('/').pop()
    if (!filename) {
      throw new Error('Could not determine filename from URL')
    }

    const filepath = join(process.cwd(), this.mapStoragePath, 'pmtiles', filename)


    // First, ensure base assets are present - regions depend on them
    const baseAssetsExist = await this.ensureBaseAssets()
    if (!baseAssetsExist) {
      throw new Error(
        'Base map assets are missing and could not be downloaded. Please check your connection and try again.'
      )
    }

    // Parse resource metadata
    const parsedFilename = CollectionManifestService.parseMapFilename(filename)
    const resourceMetadata = parsedFilename
      ? { resource_id: parsedFilename.resource_id, version: parsedFilename.version, collection_ref: null }
      : undefined

    // Dispatch background job
    const result = await RunDownloadJob.dispatch({
      url,
      filepath,
      timeout: 30000,
      allowedMimeTypes: PMTILES_MIME_TYPES,
      forceNew: true,
      filetype: 'map',
      resourceMetadata,
    })

    if (!result.job) {
      throw new Error('Failed to dispatch download job')
    }

    logger.info(`[MapService] Dispatched download job ${result.job.id} for URL ${url}`)

    return {
      filename,
      jobId: result.job?.id,
    }
  }

  async downloadRemotePreflight(
    url: string
  ): Promise<{ filename: string; size: number } | { message: string }> {
    try {
      assertNotPrivateUrl(url)
      const parsed = new URL(url)
      if (!parsed.pathname.endsWith('.pmtiles')) {
        throw new Error(`Invalid PMTiles file URL: ${url}. URL must end with .pmtiles`)
      }

      const filename = url.split('/').pop()
      if (!filename) {
        throw new Error('Could not determine filename from URL')
      }

      // Perform a HEAD request to get the content length
      const { default: axios } = await import('axios')
      const response = await axios.head(url)

      if (response.status !== 200) {
        throw new Error(`Failed to fetch file info: ${response.status} ${response.statusText}`)
      }

      const contentLength = response.headers['content-length']
      const size = contentLength ? parseInt(contentLength, 10) : 0

      return { filename, size }
    } catch (error: any) {
      logger.error({ err: error }, '[MapService] Preflight check failed for URL')
      return { message: 'Preflight check failed. Please verify the URL is valid and accessible.' }
    }
  }

  async generateStylesJSON(host: string | null = null, protocol: string = 'http'): Promise<BaseStylesFile> {
    if (!(await this.checkBaseAssetsExist())) {
      throw new Error('Base map assets are missing from storage/maps')
    }

    const baseStylePath = join(this.baseDirPath, this.baseStylesFile)
    const baseStyle = await getFile(baseStylePath, 'string')
    if (!baseStyle) {
      throw new Error('Base styles file not found in storage/maps')
    }

    const rawStyles = JSON.parse(baseStyle.toString()) as BaseStylesFile

    const regions = (await this.listRegions()).files

    /** If we have the host, use it to build public URLs, otherwise we'll fallback to defaults
    * This is mainly useful because we need to know what host the user is accessing from in order to
    * properly generate URLs in the styles file
    * e.g. user is accessing from "example.com", but we would by default generate "localhost:8080/..." so maps would
    * fail to load.
    */
    const sources = this.generateSourcesArray(host, regions, protocol)
    const baseUrl = this.getPublicFileBaseUrl(host, this.basemapsAssetsDir, protocol)

    const styles = await this.generateStylesFile(
      rawStyles,
      sources,
      urlJoin(baseUrl, 'sprites/v4/light'),
      urlJoin(baseUrl, 'fonts/{fontstack}/{range}.pbf')
    )

    return styles
  }

  async listCuratedCollections(): Promise<CollectionWithStatus[]> {
    const manifestService = new CollectionManifestService()
    return manifestService.getMapCollectionsWithStatus()
  }

  async fetchLatestCollections(): Promise<boolean> {
    const manifestService = new CollectionManifestService()
    return manifestService.fetchAndCacheSpec('maps')
  }

  async ensureBaseAssets(): Promise<boolean> {
    const exists = await this.checkBaseAssetsExist()
    if (!exists) {
      const downloaded = await this.downloadBaseAssets()
      if (!downloaded) return false
    }

    try {
      await this.ensureWorldBasemap()
    } catch (err) {
      logger.warn(`[MapService] World basemap setup failed, continuing without it: ${err}`)
    }

    return true
  }

  /**
   * Extract a low-zoom global basemap once so the map isn't grey outside a
   * regional extract's polygon. Cheap (~15 MB, a handful of HTTP range
   * requests) and layered underneath regional sources at render time.
   *
   * Memoizes success in-process, and de-duplicates concurrent callers via a
   * shared in-flight promise so two simultaneous `/maps` requests on a cold
   * start don't both launch `pmtiles extract` against the same output path.
   */
  private async ensureWorldBasemap(): Promise<void> {
    if (this.worldBasemapReady) return
    if (this.worldBasemapInFlight) return this.worldBasemapInFlight
    this.worldBasemapInFlight = this._setupWorldBasemap().finally(() => {
      this.worldBasemapInFlight = null
    })
    return this.worldBasemapInFlight
  }

  private async _setupWorldBasemap(): Promise<void> {
    const basePath = resolve(join(this.baseDirPath, 'pmtiles'))
    const filepath = resolve(join(basePath, WORLD_BASEMAP_FILENAME))
    if (!filepath.startsWith(basePath + sep)) {
      throw new Error('Invalid world basemap path')
    }

    await ensureDirectoryExists(basePath)

    const existing = await getFileStatsIfExists(filepath)
    if (existing && Number(existing.size) > 0) {
      this.worldBasemapReady = true
      return
    }

    const info = await this.getGlobalMapInfo()
    const args = buildPmtilesExtractArgs({
      sourceUrl: info.url,
      outputFilepath: filepath,
      maxzoom: WORLD_BASEMAP_MAX_ZOOM,
      downloadThreads: 4,
    })

    logger.info(
      `[MapService] Extracting world basemap (z0-${WORLD_BASEMAP_MAX_ZOOM}) from ${info.url}`
    )
    try {
      await execFileAsync(PMTILES_BINARY_PATH, args, {
        timeout: WORLD_BASEMAP_EXTRACT_TIMEOUT_MS,
        maxBuffer: DRY_RUN_MAX_BUFFER,
      })
      this.worldBasemapReady = true
    } catch (err: any) {
      await deleteFileIfExists(filepath)
      throw new Error(
        `pmtiles extract for world basemap failed: ${err.message}. stderr: ${err.stderr ?? ''}`
      )
    }
  }

  private async checkBaseAssetsExist(useCache: boolean = true): Promise<boolean> {
    // Return cached result if available and caching is enabled
    if (useCache && this.baseAssetsExistCache !== null) {
      return this.baseAssetsExistCache
    }

    await ensureDirectoryExists(this.baseDirPath)

    const baseStylePath = join(this.baseDirPath, this.baseStylesFile)
    const basemapsAssetsPath = join(this.baseDirPath, this.basemapsAssetsDir)

    const [baseStyleExists, basemapsAssetsExists] = await Promise.all([
      getFileStatsIfExists(baseStylePath),
      getFileStatsIfExists(basemapsAssetsPath),
    ])

    const exists = !!baseStyleExists && !!basemapsAssetsExists

    // update cache
    this.baseAssetsExistCache = exists

    return exists
  }

  private async listAllMapStorageItems(): Promise<FileEntry[]> {
    await ensureDirectoryExists(this.baseDirPath)
    return await listDirectoryContentsRecursive(this.baseDirPath)
  }

  private generateSourcesArray(host: string | null, regions: FileEntry[], protocol: string = 'http'): BaseStylesFile['sources'][] {
    const sources: BaseStylesFile['sources'][] = []
    const baseUrl = this.getPublicFileBaseUrl(host, 'pmtiles', protocol)

    // World basemap goes first so its layers render underneath regional extracts
    const worldSource: BaseStylesFile['sources'] = {}
    worldSource[WORLD_BASEMAP_SOURCE_NAME] = {
      type: 'vector',
      attribution: PMTILES_ATTRIBUTION,
      url: `pmtiles://${urlJoin(baseUrl, WORLD_BASEMAP_FILENAME)}`,
    }
    sources.push(worldSource)

    for (const region of regions) {
      if (region.type === 'file' && region.name.endsWith('.pmtiles')) {
        // Strip .pmtiles and date suffix (e.g. "alaska_2025-12" -> "alaska") for stable source names
        const parsed = CollectionManifestService.parseMapFilename(region.name)
        const regionName = parsed ? parsed.resource_id : region.name.replace('.pmtiles', '')
        const source: BaseStylesFile['sources'] = {}
        const sourceUrl = urlJoin(baseUrl, region.name)

        source[regionName] = {
          type: 'vector',
          attribution: PMTILES_ATTRIBUTION,
          url: `pmtiles://${sourceUrl}`,
        }
        sources.push(source)
      }
    }

    return sources
  }

  private async generateStylesFile(
    template: BaseStylesFile,
    sources: BaseStylesFile['sources'][],
    sprites: string,
    glyphs: string
  ): Promise<BaseStylesFile> {
    const layersTemplates = template.layers.filter((layer) => layer.source)
    const withoutSources = template.layers.filter((layer) => !layer.source)

    template.sources = {} // Clear existing sources
    template.layers = [...withoutSources] // Start with layers that don't depend on sources

    for (const source of sources) {
      for (const layerTemplate of layersTemplates) {
        const layer: MapLayer = {
          ...layerTemplate,
          id: `${layerTemplate.id}-${Object.keys(source)[0]}`,
          type: layerTemplate.type,
          source: Object.keys(source)[0],
        }
        template.layers.push(layer)
      }

      template.sources = Object.assign(template.sources, source)
    }

    template.sprite = sprites
    template.glyphs = glyphs

    return template
  }

  async getGlobalMapInfo(): Promise<ProtomapsBuildInfo> {
    const { default: axios } = await import('axios')
    const response = await axios.get(PROTOMAPS_BUILDS_METADATA_URL, { timeout: 15000 })
    const builds = response.data as Array<{ key: string; size: number }>

    if (!builds || builds.length === 0) {
      throw new Error('No protomaps builds found')
    }

    // Latest build first
    const sorted = builds.sort((a, b) => b.key.localeCompare(a.key))
    const latest = sorted[0]

    const dateStr = latest.key.replace('.pmtiles', '')
    const date = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`

    return {
      url: `${PROTOMAPS_BUILD_BASE_URL}/${latest.key}`,
      date,
      size: latest.size,
      key: latest.key,
    }
  }

  async downloadGlobalMap(): Promise<{ filename: string; jobId?: string }> {
    const info = await this.getGlobalMapInfo()

    const existing = await RunDownloadJob.getByUrl(info.url)
    if (existing) {
      throw new Error(`Download already in progress for URL ${info.url}`)
    }

    const basePath = resolve(join(this.baseDirPath, 'pmtiles'))
    const filepath = resolve(join(basePath, info.key))

    // Prevent path traversal — resolved path must stay within the storage directory
    if (!filepath.startsWith(basePath + sep)) {
      throw new Error('Invalid filename')
    }

    // First, ensure base assets are present - the global map depends on them
    const baseAssetsExist = await this.ensureBaseAssets()
    if (!baseAssetsExist) {
      throw new Error(
        'Base map assets are missing and could not be downloaded. Please check your connection and try again.'
      )
    }

    // forceNew: false so retries resume partial downloads
    const result = await RunDownloadJob.dispatch({
      url: info.url,
      filepath,
      timeout: 30000,
      allowedMimeTypes: PMTILES_MIME_TYPES,
      forceNew: false,
      filetype: 'map',
    })

    if (!result.job) {
      throw new Error('Failed to dispatch download job')
    }

    logger.info(`[MapService] Dispatched global map download job ${result.job.id}`)

    return {
      filename: info.key,
      jobId: result.job?.id,
    }
  }

  async listCountries(): Promise<Country[]> {
    return CountriesService.getInstance().list()
  }

  async listCountryGroups(): Promise<CountryGroup[]> {
    return CountriesService.getInstance().listGroups()
  }

  async extractPreflight(params: {
    countries: CountryCode[]
    maxzoom?: number
  }): Promise<MapExtractPreflight> {
    this.validateMaxzoom(params.maxzoom)
    const countries = await CountriesService.getInstance().resolveCodes(params.countries)
    const regionFilepath = await CountriesService.getInstance().writeRegionFile(countries)
    const info = await this.getGlobalMapInfo()
    return this.runDryRun(info, regionFilepath, params.maxzoom)
  }

  private async runDryRun(
    info: { url: string; date: string; key: string },
    regionFilepath: string,
    maxzoom?: number
  ): Promise<MapExtractPreflight> {
    const dryRunOutput = join(tmpdir(), `pmtiles-dry-run-${randomBytes(6).toString('hex')}.pmtiles`)
    const args = buildPmtilesExtractArgs({
      sourceUrl: info.url,
      outputFilepath: dryRunOutput,
      regionFilepath,
      maxzoom,
      dryRun: true,
    })

    let stdout = ''
    let stderr = ''
    try {
      const result = await execFileAsync(PMTILES_BINARY_PATH, args, {
        timeout: DRY_RUN_TIMEOUT_MS,
        maxBuffer: DRY_RUN_MAX_BUFFER,
      })
      stdout = result.stdout
      stderr = result.stderr
    } catch (err: any) {
      throw new Error(
        `pmtiles extract --dry-run failed: ${err.message}. stderr: ${err.stderr ?? ''}`
      )
    }

    const parsed = this.parseDryRunOutput(stdout + '\n' + stderr)

    return {
      tiles: parsed.tiles,
      bytes: parsed.bytes,
      source: { url: info.url, date: info.date, key: info.key },
    }
  }

  async extractRegion(params: {
    countries: CountryCode[]
    maxzoom?: number
    label?: string
    estimatedBytes?: number
  }): Promise<{ filename: string; jobId?: string }> {
    this.validateMaxzoom(params.maxzoom)
    const countriesService = CountriesService.getInstance()
    const countries = await countriesService.resolveCodes(params.countries)
    const regionFilepath = await countriesService.writeRegionFile(countries)
    const maxzoom = params.maxzoom ?? EXTRACT_DEFAULT_MAX_ZOOM

    const [baseAssetsExist, info, groups] = await Promise.all([
      this.ensureBaseAssets(),
      this.getGlobalMapInfo(),
      countriesService.listGroups(),
    ])
    if (!baseAssetsExist) {
      throw new Error(
        'Base map assets are missing and could not be downloaded. Please check your connection and try again.'
      )
    }

    const groupMatch = findExactGroupMatch(countries, groups)
    const slug = this.buildRegionSlug(countries, groupMatch)
    const dateSlug = info.key.replace('.pmtiles', '')
    const filename = `${slug}_${dateSlug}_z${maxzoom}.pmtiles`
    const basePath = resolve(join(this.baseDirPath, 'pmtiles'))
    const filepath = resolve(join(basePath, filename))

    if (!filepath.startsWith(basePath + sep)) {
      throw new Error('Invalid filename')
    }

    let estimatedBytes = params.estimatedBytes ?? 0
    if (estimatedBytes === 0) {
      try {
        const preflight = await this.runDryRun(info, regionFilepath, maxzoom)
        estimatedBytes = preflight.bytes
      } catch (err) {
        logger.warn(`[MapService] extractRegion preflight failed, proceeding without estimate: ${err}`)
      }
    }

    const title = params.label ?? this.buildRegionTitle(countries, groupMatch)

    const result = await RunExtractPmtilesJob.dispatch({
      sourceUrl: info.url,
      outputFilepath: filepath,
      regionFilepath,
      maxzoom,
      estimatedBytes,
      filetype: 'map',
      title,
      resourceMetadata: {
        resource_id: slug,
        version: dateSlug,
        collection_ref: null,
      },
    })

    if (!result.job) {
      throw new Error('Failed to dispatch extract job')
    }

    logger.info(
      `[MapService] Dispatched extract job ${result.job.id} for ${filename} ` +
        `(countries=[${countries.join(',')}] maxzoom=${maxzoom} est=${estimatedBytes} bytes)`
    )

    return {
      filename,
      jobId: result.job.id,
    }
  }

  private buildRegionSlug(countries: CountryCode[], groupMatch: CountryGroup | null): string {
    if (groupMatch) return groupMatch.id
    if (countries.length === 1) return countries[0].toLowerCase()
    const hash = createHash('sha1').update(countries.join(',')).digest('hex').slice(0, 8)
    return `custom-${hash}`
  }

  private buildRegionTitle(countries: CountryCode[], groupMatch: CountryGroup | null): string {
    if (groupMatch) return groupMatch.name
    if (countries.length === 1) return countries[0]
    if (countries.length <= 3) return countries.join(', ')
    return `${countries.slice(0, 2).join(', ')} +${countries.length - 2} more`
  }

  private validateMaxzoom(maxzoom: number | undefined): void {
    if (typeof maxzoom !== 'number') return
    if (
      !Number.isInteger(maxzoom) ||
      maxzoom < EXTRACT_MIN_ZOOM ||
      maxzoom > EXTRACT_MAX_ZOOM
    ) {
      throw new Error(
        `maxzoom must be an integer in [${EXTRACT_MIN_ZOOM}, ${EXTRACT_MAX_ZOOM}]`
      )
    }
  }

  // go-pmtiles output format isn't stable across versions — parse loosely and
  // fall back to zeros. The extract can still proceed without an estimate.
  private parseDryRunOutput(output: string): { tiles: number; bytes: number } {
    let bytes = 0
    let tiles = 0

    const byteLine = output.match(/archive\s+size\s+of\s+([\d,.]+)\s*(B|KB|MB|GB|TB|bytes?)?/i)
    if (byteLine) {
      const raw = parseFloat(byteLine[1].replace(/,/g, ''))
      const unit = (byteLine[2] ?? 'B').toUpperCase()
      const multipliers: Record<string, number> = {
        B: 1,
        BYTE: 1,
        BYTES: 1,
        KB: 1_000,
        MB: 1_000_000,
        GB: 1_000_000_000,
        TB: 1_000_000_000_000,
      }
      bytes = Math.round(raw * (multipliers[unit] ?? 1))
    }

    const tileLine = output.match(/(?:tiles\s+to\s+extract|tiles)[^\d]*([\d,]+)/i)
    if (tileLine) {
      tiles = parseInt(tileLine[1].replace(/,/g, ''), 10) || 0
    }

    return { tiles, bytes }
  }

  async delete(file: string): Promise<void> {
    let fileName = file
    if (!fileName.endsWith('.pmtiles')) {
      fileName += '.pmtiles'
    }

    if (fileName === WORLD_BASEMAP_FILENAME) {
      throw new Error('The world basemap cannot be deleted')
    }

    const basePath = resolve(join(this.baseDirPath, 'pmtiles'))
    const fullPath = resolve(join(basePath, fileName))

    // Prevent path traversal — resolved path must stay within the storage directory
    if (!fullPath.startsWith(basePath + sep)) {
      throw new Error('Invalid filename')
    }

    const exists = await getFileStatsIfExists(fullPath)
    if (!exists) {
      throw new Error('not_found')
    }

    await deleteFileIfExists(fullPath)

    // Clean up InstalledResource entry
    const parsed = CollectionManifestService.parseMapFilename(fileName)
    if (parsed) {
      await InstalledResource.query()
        .where('resource_id', parsed.resource_id)
        .where('resource_type', 'map')
        .delete()
      logger.info(`[MapService] Deleted InstalledResource entry for: ${parsed.resource_id}`)
    }
  }

  /**
   * Gets the appropriate public URL for a map asset depending on environment. The host and protocol that the user
   * is accessing the maps from must match the host and protocol used in the generated URLs, otherwise maps will fail to load.
   * If you make changes to this function, you need to ensure it handles all the following cases correctly:
   * - No host provided (should default to localhost or env URL)
   * - Host provided as full URL (e.g. "http://example.com:8080")
   * - Host provided as host:port (e.g. "example.com:8080")
   * - Host provided as bare hostname (e.g. "example.com")
   * @param specifiedHost - the host as provided by the user/request, can be null or in various formats (full URL, host:port, bare hostname)
   * @param childPath - the path to append to the base URL (e.g. "basemaps-assets", "pmtiles")
   * @param protocol - the protocol to use in the generated URL (e.g. "http", "https"), defaults to "http"
   * @returns the public URL for the map asset
   */
  private getPublicFileBaseUrl(specifiedHost: string | null, childPath: string, protocol: string = 'http'): string {
    function getHost() {
      try {
        const localUrlRaw = env.get('URL')
        if (!localUrlRaw) return 'localhost'

        const localUrl = new URL(localUrlRaw)
        return localUrl.host
      } catch (error) {
        return 'localhost'
      }
    }

    function specifiedHostOrDefault() {
      if (specifiedHost === null) {
        return getHost()
      }
      // Try as a full URL first (e.g. "http://example.com:8080")
      try {
        const specifiedUrl = new URL(specifiedHost)
        if (specifiedUrl.host) return specifiedUrl.host
      } catch {}
      // Try as a bare host or host:port (e.g. "nomad-box:8080", "192.168.1.1:8080", "example.com")
      try {
        const specifiedUrl = new URL(`http://${specifiedHost}`)
        if (specifiedUrl.host) return specifiedUrl.host
      } catch {}
      return getHost()
    }

    const host = specifiedHostOrDefault();
    const withProtocol = `${protocol}://${host}`
    const baseUrlPath =
      process.env.NODE_ENV === 'production' ? childPath : urlJoin(this.mapStoragePath, childPath)

    const baseUrl = new URL(baseUrlPath, withProtocol).toString()
    return baseUrl
  }
}

function findExactGroupMatch(
  countries: CountryCode[],
  groups: CountryGroup[]
): CountryGroup | null {
  return (
    groups.find(
      (g) =>
        g.countries.length === countries.length &&
        g.countries.every((c, i) => c === countries[i])
    ) ?? null
  )
}
