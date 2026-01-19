import {
  ListRemoteZimFilesResponse,
  RawRemoteZimFileEntry,
  RemoteZimFileEntry,
} from '../../types/zim.js'
import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import { isRawListRemoteZimFilesResponse, isRawRemoteZimFileEntry } from '../../util/zim.js'
import logger from '@adonisjs/core/services/logger'
import { DockerService } from './docker_service.js'
import { inject } from '@adonisjs/core'
import {
  deleteFileIfExists,
  ensureDirectoryExists,
  getFileStatsIfExists,
  listDirectoryContents,
  ZIM_STORAGE_PATH,
} from '../utils/fs.js'
import { join } from 'path'
import { CuratedCategory, CuratedCollectionWithStatus, CuratedCollectionsFile } from '../../types/downloads.js'
import vine from '@vinejs/vine'
import { curatedCategoriesFileSchema, curatedCollectionsFileSchema } from '#validators/curated_collections'
import CuratedCollection from '#models/curated_collection'
import CuratedCollectionResource from '#models/curated_collection_resource'
import { RunDownloadJob } from '#jobs/run_download_job'
import { DownloadCollectionOperation, DownloadRemoteSuccessCallback } from '../../types/files.js'

const ZIM_MIME_TYPES = ['application/x-zim', 'application/x-openzim', 'application/octet-stream']
const CATEGORIES_URL = 'https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/master/collections/kiwix-categories.json'
const COLLECTIONS_URL =
  'https://github.com/Crosstalk-Solutions/project-nomad/raw/refs/heads/master/collections/kiwix.json'



interface IZimService {
  downloadCollection: DownloadCollectionOperation
  downloadRemoteSuccessCallback: DownloadRemoteSuccessCallback
}

@inject()
export class ZimService implements IZimService {
  constructor(private dockerService: DockerService) {}

  async list() {
    const dirPath = join(process.cwd(), ZIM_STORAGE_PATH)
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

  async downloadRemote(url: string): Promise<{ filename: string; jobId?: string }> {
    const parsed = new URL(url)
    if (!parsed.pathname.endsWith('.zim')) {
      throw new Error(`Invalid ZIM file URL: ${url}. URL must end with .zim`)
    }

    const existing = await RunDownloadJob.getByUrl(url)
    if (existing) {
      throw new Error('A download for this URL is already in progress')
    }

    // Extract the filename from the URL
    const filename = url.split('/').pop()
    if (!filename) {
      throw new Error('Could not determine filename from URL')
    }

    const filepath = join(process.cwd(), ZIM_STORAGE_PATH, filename)

    // Dispatch a background download job
    const result = await RunDownloadJob.dispatch({
      url,
      filepath,
      timeout: 30000,
      allowedMimeTypes: ZIM_MIME_TYPES,
      forceNew: true,
      filetype: 'zim',
    })

    if (!result || !result.job) {
      throw new Error('Failed to dispatch download job')
    }

    logger.info(`[ZimService] Dispatched background download job for ZIM file: ${filename}`)

    return {
      filename,
      jobId: result.job.id,
    }
  }

  async downloadCollection(slug: string) {
    const collection = await CuratedCollection.query().where('slug', slug).andWhere('type', 'zim').first()
    if (!collection) {
      return null
    }

    const resources = await collection.related('resources').query().where('downloaded', false)
    if (resources.length === 0) {
      return null
    }

    const downloadUrls = resources.map((res) => res.url)
    const downloadFilenames: string[] = []

    for (const url of downloadUrls) {
      const existing = await RunDownloadJob.getByUrl(url)
      if (existing) {
        logger.warn(`[ZimService] Download already in progress for URL ${url}, skipping.`)
        continue
      }

      // Extract the filename from the URL
      const filename = url.split('/').pop()
      if (!filename) {
        logger.warn(`[ZimService] Could not determine filename from URL ${url}, skipping.`)
        continue
      }

      downloadFilenames.push(filename)
      const filepath = join(process.cwd(), ZIM_STORAGE_PATH, filename)

      await RunDownloadJob.dispatch({
        url,
        filepath,
        timeout: 30000,
        allowedMimeTypes: ZIM_MIME_TYPES,
        forceNew: true,
        filetype: 'zim',
      })
    }

    return downloadFilenames.length > 0 ? downloadFilenames : null
  } 

  async downloadRemoteSuccessCallback(urls: string[], restart = true) {
    // Restart KIWIX container to pick up new ZIM file
    if (restart) {
      await this.dockerService
        .affectContainer(DockerService.KIWIX_SERVICE_NAME, 'restart')
        .catch((error) => {
          logger.error(`[ZimService] Failed to restart KIWIX container:`, error) // Don't stop the download completion, just log the error.
        })
    }

    // Mark any curated collection resources with this download URL as downloaded
    const resources = await CuratedCollectionResource.query().whereIn('url', urls)
    for (const resource of resources) {
      resource.downloaded = true
      await resource.save()
    }
  }

  async listCuratedCategories(): Promise<CuratedCategory[]> {
    try {
      const response = await axios.get(CATEGORIES_URL)
      const data = response.data

      const validated = await vine.validate({
        schema: curatedCategoriesFileSchema,
        data,
      });

      return validated.categories
    } catch (error) {
      logger.error(`[ZimService] Failed to fetch curated categories:`, error)
      throw new Error('Failed to fetch curated categories or invalid format was received')
    }
  }

  async listCuratedCollections(): Promise<CuratedCollectionWithStatus[]> {
    const collections = await CuratedCollection.query().where('type', 'zim').preload('resources')
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
        logger.info(`[ZimService] Upserted curated collection: ${collection.slug}`)

        await collectionResult.related('resources').createMany(collection.resources)
        logger.info(
          `[ZimService] Upserted ${collection.resources.length} resources for collection: ${collection.slug}`
        )
      }

      return true
    } catch (error) {
      logger.error(`[ZimService] Failed to download latest Kiwix collections:`, error)
      return false
    }
  }

  async delete(file: string): Promise<void> {
    let fileName = file
    if (!fileName.endsWith('.zim')) {
      fileName += '.zim'
    }

    const fullPath = join(process.cwd(), ZIM_STORAGE_PATH, fileName)

    const exists = await getFileStatsIfExists(fullPath)
    if (!exists) {
      throw new Error('not_found')
    }

    await deleteFileIfExists(fullPath)
  }
}
