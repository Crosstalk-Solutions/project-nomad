import {
  ListRemoteZimFilesResponse,
  RawRemoteZimFileEntry,
  RemoteZimFileEntry,
} from '../../types/zim.js'
import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import { isRawListRemoteZimFilesResponse, isRawRemoteZimFileEntry } from '../../util/zim.js'
import transmit from '@adonisjs/transmit/services/main'
import logger from '@adonisjs/core/services/logger'
import { DockerService } from './docker_service.js'
import { inject } from '@adonisjs/core'
import { doBackgroundDownload } from '../utils/downloads.js'
import {
  deleteFileIfExists,
  ensureDirectoryExists,
  getFileStatsIfExists,
  listDirectoryContents,
} from '../utils/fs.js'
import { join } from 'path'
import { CuratedCollectionWithStatus, CuratedCollectionsFile } from '../../types/downloads.js'
import vine from '@vinejs/vine'
import { curatedCollectionsFileSchema } from '#validators/curated_collections'
import CuratedCollection from '#models/curated_collection'
import CuratedCollectionResource from '#models/curated_collection_resource'
import { BROADCAST_CHANNELS } from '../../util/broadcast_channels.js'

const ZIM_MIME_TYPES = ['application/x-zim', 'application/x-openzim', 'application/octet-stream']
const COLLECTIONS_URL =
  'https://github.com/Crosstalk-Solutions/project-nomad/raw/refs/heads/master/collections/kiwix.json'

@inject()
export class ZimService {
  private zimStoragePath = '/storage/zim'
  private activeDownloads = new Map<string, AbortController>()

  constructor(private dockerService: DockerService) {}

  async list() {
    const dirPath = join(process.cwd(), this.zimStoragePath)

    await ensureDirectoryExists(dirPath)

    const all = await listDirectoryContents(dirPath)
    const files = all.filter((item) => item.name.endsWith('.zim'))

    return {
      files,
    }
  }

  async listRemote({
    start,
    count,
    query,
  }: {
    start: number
    count: number
    query?: string
  }): Promise<ListRemoteZimFilesResponse> {
    const LIBRARY_BASE_URL = 'https://browse.library.kiwix.org/catalog/v2/entries'

    const res = await axios.get(LIBRARY_BASE_URL, {
      params: {
        start: start,
        count: count,
        lang: 'eng',
        ...(query ? { q: query } : {}),
      },
      responseType: 'text',
    })

    const data = res.data
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      textNodeName: '#text',
    })
    const result = parser.parse(data)

    if (!isRawListRemoteZimFilesResponse(result)) {
      throw new Error('Invalid response format from remote library')
    }

    const entries = result.feed.entry
      ? Array.isArray(result.feed.entry)
        ? result.feed.entry
        : [result.feed.entry]
      : []

    const filtered = entries.filter((entry: any) => {
      return isRawRemoteZimFileEntry(entry)
    })

    const mapped: (RemoteZimFileEntry | null)[] = filtered.map((entry: RawRemoteZimFileEntry) => {
      const downloadLink = entry.link.find((link: any) => {
        return (
          typeof link === 'object' &&
          'rel' in link &&
          'length' in link &&
          'href' in link &&
          'type' in link &&
          link.type === 'application/x-zim'
        )
      })

      if (!downloadLink) {
        return null
      }

      // downloadLink['href'] will end with .meta4, we need to remove that to get the actual download URL
      const download_url = downloadLink['href'].substring(0, downloadLink['href'].length - 6)
      const file_name = download_url.split('/').pop() || `${entry.title}.zim`
      const sizeBytes = parseInt(downloadLink['length'], 10)

      return {
        id: entry.id,
        title: entry.title,
        updated: entry.updated,
        summary: entry.summary,
        size_bytes: sizeBytes || 0,
        download_url: download_url,
        author: entry.author.name,
        file_name: file_name,
      }
    })

    // Filter out any null entries (those without a valid download link)
    // or files that already exist in the local storage
    const existing = await this.list()
    const existingKeys = new Set(existing.files.map((file) => file.name))
    const withoutExisting = mapped.filter(
      (entry): entry is RemoteZimFileEntry => entry !== null && !existingKeys.has(entry.file_name)
    )

    return {
      items: withoutExisting,
      has_more: result.feed.totalResults > start,
      total_count: result.feed.totalResults,
    }
  }

  async downloadRemote(url: string): Promise<string> {
    const parsed = new URL(url)
    if (!parsed.pathname.endsWith('.zim')) {
      throw new Error(`Invalid ZIM file URL: ${url}. URL must end with .zim`)
    }

    const existing = this.activeDownloads.get(url)
    if (existing) {
      throw new Error(`Download already in progress for URL ${url}`)
    }

    // Extract the filename from the URL
    const filename = url.split('/').pop()
    if (!filename) {
      throw new Error('Could not determine filename from URL')
    }

    const filepath = join(process.cwd(), this.zimStoragePath, filename)

    // Don't await the download, run it in the background
    doBackgroundDownload({
      url,
      filepath,
      channel: BROADCAST_CHANNELS.ZIM,
      activeDownloads: this.activeDownloads,
      allowedMimeTypes: ZIM_MIME_TYPES,
      timeout: 30000,
      forceNew: true,
      onComplete: (url, filepath) => this._downloadRemoteSuccessCallback([url], filepath),
    })

    return filename
  }

  async downloadCollection(slug: string): Promise<string[] | null> {
    const collection = await CuratedCollection.find(slug)
    if (!collection) {
      return null
    }

    const resources = await collection.related('resources').query().where('downloaded', false)
    if (resources.length === 0) {
      return null
    }

    const downloadUrls = resources.map((res) => res.url)
    const downloadFilenames: string[] = []

    for (const [idx, url] of downloadUrls.entries()) {
      const existing = this.activeDownloads.get(url)
      if (existing) {
        logger.warn(`Download already in progress for URL ${url}, skipping.`)
        continue
      }

      // Extract the filename from the URL
      const filename = url.split('/').pop()
      if (!filename) {
        logger.warn(`Could not determine filename from URL ${url}, skipping.`)
        continue
      }

      const filepath = join(process.cwd(), this.zimStoragePath, filename)
      downloadFilenames.push(filename)

      const isLastDownload = idx === downloadUrls.length - 1

      // Don't await the download, run it in the background
      doBackgroundDownload({
        url,
        filepath,
        channel: BROADCAST_CHANNELS.ZIM,
        activeDownloads: this.activeDownloads,
        allowedMimeTypes: ZIM_MIME_TYPES,
        timeout: 30000,
        forceNew: true,
        onComplete: (url, filepath) =>
          this._downloadRemoteSuccessCallback([url], filepath, isLastDownload),
      })
    }

    return downloadFilenames.length > 0 ? downloadFilenames : null
  }

  async _downloadRemoteSuccessCallback(urls: string[], filepath: string, restart = true) {
    // Restart KIWIX container to pick up new ZIM file
    if (restart) {
      await this.dockerService
        .affectContainer(DockerService.KIWIX_SERVICE_NAME, 'restart')
        .catch((error) => {
          logger.error(`Failed to restart KIWIX container:`, error) // Don't stop the download completion, just log the error.
        })
    }

    // Mark any curated collection resources with this download URL as downloaded
    const resources = await CuratedCollectionResource.query().whereIn('url', urls)
    for (const resource of resources) {
      resource.downloaded = true
      await resource.save()
    }
  }

  listActiveDownloads(): string[] {
    return Array.from(this.activeDownloads.keys())
  }

  cancelDownload(url: string): boolean {
    const entry = this.activeDownloads.get(url)
    if (entry) {
      entry.abort()
      this.activeDownloads.delete(url)
      transmit.broadcast(BROADCAST_CHANNELS.ZIM, { url, status: 'cancelled' })
      return true
    }
    return false
  }

  async listCuratedCollections(): Promise<CuratedCollectionWithStatus[]> {
    const collections = await CuratedCollection.query().preload('resources')
    return collections.map((collection) => ({
      ...(collection.serialize() as CuratedCollection),
      all_downloaded: collection.resources.every((res) => res.downloaded),
    }))
  }

  async fetchLatestCollections(): Promise<boolean> {
    try {
      const response = await axios.get<CuratedCollectionsFile>(COLLECTIONS_URL)

      const validated = await vine.validate({
        schema: curatedCollectionsFileSchema,
        data: response.data,
      })

      for (const collection of validated.collections) {
        const collectionResult = await CuratedCollection.updateOrCreate(
          { slug: collection.slug },
          {
            ...collection,
            type: 'zim',
          }
        )
        logger.info(`Upserted curated collection: ${collection.slug}`)

        await collectionResult.related('resources').createMany(collection.resources)
        logger.info(
          `Upserted ${collection.resources.length} resources for collection: ${collection.slug}`
        )
      }

      return true
    } catch (error) {
      logger.error('Failed to download latest Kiwix collections:', error)
      return false
    }
  }

  async delete(file: string): Promise<void> {
    let fileName = file
    if (!fileName.endsWith('.zim')) {
      fileName += '.zim'
    }

    const fullPath = join(process.cwd(), this.zimStoragePath, fileName)

    const exists = await getFileStatsIfExists(fullPath)
    if (!exists) {
      throw new Error('not_found')
    }

    await deleteFileIfExists(fullPath)
  }
}
