import { BaseStylesFile, MapLayer } from '../../types/maps.js'
import { FileEntry } from '../../types/files.js'
import { doBackgroundDownload, doResumableDownloadWithRetry } from '../utils/downloads.js'
import { extract } from 'tar'
import env from '#start/env'
import {
  listDirectoryContentsRecursive,
  listDirectoryContents,
  getFileStatsIfExists,
  deleteFileIfExists,
  getFile,
  ensureDirectoryExists,
} from '../utils/fs.js'
import { join } from 'path'
import urlJoin from 'url-join'
import axios from 'axios'
import { BROADCAST_CHANNELS } from '../../util/broadcast_channels.js'

const BASE_ASSETS_MIME_TYPES = [
  'application/gzip',
  'application/x-gzip',
  'application/octet-stream',
]

const PMTILES_ATTRIBUTION =
  '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>'
const PMTILES_MIME_TYPES = ['application/vnd.pmtiles', 'application/octet-stream']

export class MapService {
  private readonly mapStoragePath = '/storage/maps'
  private readonly baseStylesFile = 'nomad-base-styles.json'
  private readonly basemapsAssetsDir = 'basemaps-assets'
  private readonly baseAssetsTarFile = 'base-assets.tar.gz'
  private readonly baseDirPath = join(process.cwd(), this.mapStoragePath)
  private activeDownloads = new Map<string, AbortController>()

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
      'https://github.com/Crosstalk-Solutions/project-nomad-maps/blob/master'
    )
    defaultTarFileURL.searchParams.append('raw', 'true')

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

    return true
  }

  async downloadRemote(url: string): Promise<string> {
    const parsed = new URL(url)
    if (!parsed.pathname.endsWith('.pmtiles')) {
      throw new Error(`Invalid PMTiles file URL: ${url}. URL must end with .pmtiles`)
    }

    const existing = this.activeDownloads.get(url)
    if (existing) {
      throw new Error(`Download already in progress for URL ${url}`)
    }

    const filename = url.split('/').pop()
    if (!filename) {
      throw new Error('Could not determine filename from URL')
    }

    const filepath = join(process.cwd(), this.mapStoragePath, 'pmtiles', filename)

    // Don't await the download, run it in the background
    doBackgroundDownload({
      url,
      filepath,
      timeout: 30000,
      allowedMimeTypes: PMTILES_MIME_TYPES,
      forceNew: true,
      channel: BROADCAST_CHANNELS.MAP,
      activeDownloads: this.activeDownloads,
    })

    return filename
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
      const response = await axios.head(url)

      if (response.status !== 200) {
        throw new Error(`Failed to fetch file info: ${response.status} ${response.statusText}`)
      }

      const contentLength = response.headers['content-length']
      const size = contentLength ? parseInt(contentLength, 10) : 0

      return { filename, size }
    } catch (error) {
      return { message: `Preflight check failed: ${error.message}` }
    }
  }

  async generateStylesJSON() {
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
    const sources = this.generateSourcesArray(regions)

    const localUrl = env.get('URL')
    const withProtocol = localUrl.startsWith('http') ? localUrl : `http://${localUrl}`
    const baseUrlPath = urlJoin(this.mapStoragePath, this.basemapsAssetsDir)
    const baseUrl = new URL(baseUrlPath, withProtocol).toString()

    const styles = await this.generateStylesFile(
      rawStyles,
      sources,
      urlJoin(baseUrl, 'sprites/v4/light'),
      urlJoin(baseUrl, 'fonts/{fontstack}/{range}.pbf')
    )

    return styles
  }

  async checkBaseAssetsExist() {
    const storageContents = await this.listMapStorageItems()
    const baseStyleItem = storageContents.find(
      (item) => item.type === 'file' && item.name === this.baseStylesFile
    )
    const basemapsAssetsItem = storageContents.find(
      (item) => item.type === 'directory' && item.name === this.basemapsAssetsDir
    )

    return !!baseStyleItem && !!basemapsAssetsItem
  }

  private async listMapStorageItems(): Promise<FileEntry[]> {
    await ensureDirectoryExists(this.baseDirPath)
    return await listDirectoryContents(this.baseDirPath)
  }

  private async listAllMapStorageItems(): Promise<FileEntry[]> {
    await ensureDirectoryExists(this.baseDirPath)
    return await listDirectoryContentsRecursive(this.baseDirPath)
  }

  private generateSourcesArray(regions: FileEntry[]): BaseStylesFile['sources'][] {
    const localUrl = env.get('URL')
    const sources: BaseStylesFile['sources'][] = []

    for (const region of regions) {
      if (region.type === 'file' && region.name.endsWith('.pmtiles')) {
        const regionName = region.name.replace('.pmtiles', '')
        const source: BaseStylesFile['sources'] = {}
        const sourceUrl = new URL(
          urlJoin(this.mapStoragePath, 'pmtiles', region.name),
          localUrl.startsWith('http') ? localUrl : `http://${localUrl}`
        ).toString()

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
    if (!fileName.endsWith('.zim')) {
      fileName += '.zim'
    }

    const fullPath = join(this.baseDirPath, fileName)

    const exists = await getFileStatsIfExists(fullPath)
    if (!exists) {
      throw new Error('not_found')
    }

    await deleteFileIfExists(fullPath)
  }
}
