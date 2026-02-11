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
import { join } from 'path'
import urlJoin from 'url-join'
import { RunDownloadJob } from '#jobs/run_download_job'
import logger from '@adonisjs/core/services/logger'
import InstalledResource from '#models/installed_resource'
import { CollectionManifestService } from './collection_manifest_service.js'
import type { CollectionWithStatus, MapsSpec } from '../../types/collections.js'

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

  async listRegions() {
    const files = (await this.listAllMapStorageItems()).filter(
      (item) => item.type === 'file' && item.name.endsWith('.pmtiles')
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
      const existing = await RunDownloadJob.getByUrl(resource.url)
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

    const existing = await RunDownloadJob.getByUrl(url)
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
      return { message: `Preflight check failed: ${error.message}` }
    }
  }

  async generateStylesJSON(host: string | null = null): Promise<BaseStylesFile> {
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
    const sources = this.generateSourcesArray(host, regions)
    const baseUrl = this.getPublicFileBaseUrl(host, this.basemapsAssetsDir)

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
    if (exists) {
      return true
    }

    return await this.downloadBaseAssets()
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

  private generateSourcesArray(host: string | null, regions: FileEntry[]): BaseStylesFile['sources'][] {
    const sources: BaseStylesFile['sources'][] = []
    const baseUrl = this.getPublicFileBaseUrl(host, 'pmtiles')

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

  async delete(file: string): Promise<void> {
    let fileName = file
    if (!fileName.endsWith('.pmtiles')) {
      fileName += '.pmtiles'
    }

    const fullPath = join(this.baseDirPath, 'pmtiles', fileName)

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

  /*
   * Gets the appropriate public URL for a map asset depending on environment
   */
  private getPublicFileBaseUrl(specifiedHost: string | null, childPath: string): string {
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

    const host = specifiedHost || getHost()
    const withProtocol = host.startsWith('http') ? host : `http://${host}`
    const baseUrlPath =
      process.env.NODE_ENV === 'production' ? childPath : urlJoin(this.mapStoragePath, childPath)

    const baseUrl = new URL(baseUrlPath, withProtocol).toString()
    return baseUrl
  }
}
