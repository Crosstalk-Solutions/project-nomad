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
import { CuratedCategory, CuratedCollectionWithStatus, CuratedCollectionsFile, WikipediaOption, WikipediaState } from '../../types/downloads.js'
import vine from '@vinejs/vine'
import { curatedCategoriesFileSchema, curatedCollectionsFileSchema, wikipediaOptionsFileSchema } from '#validators/curated_collections'
import CuratedCollection from '#models/curated_collection'
import CuratedCollectionResource from '#models/curated_collection_resource'
import InstalledTier from '#models/installed_tier'
import WikipediaSelection from '#models/wikipedia_selection'
import { RunDownloadJob } from '#jobs/run_download_job'
import { DownloadCollectionOperation, DownloadRemoteSuccessCallback } from '../../types/files.js'
import { SERVICE_NAMES } from '../../constants/service_names.js'

const ZIM_MIME_TYPES = ['application/x-zim', 'application/x-openzim', 'application/octet-stream']
const CATEGORIES_URL = 'https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/master/collections/kiwix-categories.json'
const COLLECTIONS_URL =
  'https://github.com/Crosstalk-Solutions/project-nomad/raw/refs/heads/master/collections/kiwix.json'
const WIKIPEDIA_OPTIONS_URL = 'https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/master/collections/wikipedia.json'



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
    // Check if any URL is a Wikipedia download and handle it
    for (const url of urls) {
      if (url.includes('wikipedia_en_')) {
        await this.onWikipediaDownloadComplete(url, true)
      }
    }

    // Restart KIWIX container to pick up new ZIM file
    if (restart) {
      await this.dockerService
        .affectContainer(SERVICE_NAMES.KIWIX, 'restart')
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

      // Look up installed tiers for all categories
      const installedTiers = await InstalledTier.all()
      const installedTierMap = new Map(
        installedTiers.map((t) => [t.category_slug, t.tier_slug])
      )

      // Add installedTierSlug to each category
      return validated.categories.map((category) => ({
        ...category,
        installedTierSlug: installedTierMap.get(category.slug),
      }))
    } catch (error) {
      logger.error(`[ZimService] Failed to fetch curated categories:`, error)
      throw new Error('Failed to fetch curated categories or invalid format was received')
    }
  }

  async saveInstalledTier(categorySlug: string, tierSlug: string): Promise<void> {
    await InstalledTier.updateOrCreate(
      { category_slug: categorySlug },
      { tier_slug: tierSlug }
    )
    logger.info(`[ZimService] Saved installed tier: ${categorySlug} -> ${tierSlug}`)
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

  // Wikipedia selector methods

  async getWikipediaOptions(): Promise<WikipediaOption[]> {
    try {
      const response = await axios.get(WIKIPEDIA_OPTIONS_URL)
      const data = response.data

      const validated = await vine.validate({
        schema: wikipediaOptionsFileSchema,
        data,
      })

      return validated.options
    } catch (error) {
      logger.error(`[ZimService] Failed to fetch Wikipedia options:`, error)
      throw new Error('Failed to fetch Wikipedia options')
    }
  }

  async getWikipediaSelection(): Promise<WikipediaSelection | null> {
    // Get the single row from wikipedia_selections (there should only ever be one)
    return WikipediaSelection.query().first()
  }

  async getWikipediaState(): Promise<WikipediaState> {
    const options = await this.getWikipediaOptions()
    const selection = await this.getWikipediaSelection()

    return {
      options,
      currentSelection: selection
        ? {
            optionId: selection.option_id,
            status: selection.status,
            filename: selection.filename,
            url: selection.url,
          }
        : null,
    }
  }

  async selectWikipedia(optionId: string): Promise<{ success: boolean; jobId?: string; message?: string }> {
    const options = await this.getWikipediaOptions()
    const selectedOption = options.find((opt) => opt.id === optionId)

    if (!selectedOption) {
      throw new Error(`Invalid Wikipedia option: ${optionId}`)
    }

    const currentSelection = await this.getWikipediaSelection()

    // If same as currently installed, no action needed
    if (currentSelection?.option_id === optionId && currentSelection.status === 'installed') {
      return { success: true, message: 'Already installed' }
    }

    // Handle "none" option - delete current Wikipedia file and update DB
    if (optionId === 'none') {
      if (currentSelection?.filename) {
        try {
          await this.delete(currentSelection.filename)
          logger.info(`[ZimService] Deleted Wikipedia file: ${currentSelection.filename}`)
        } catch (error) {
          // File might already be deleted, that's OK
          logger.warn(`[ZimService] Could not delete Wikipedia file (may already be gone): ${currentSelection.filename}`)
        }
      }

      // Update or create the selection record (always use first record)
      if (currentSelection) {
        currentSelection.option_id = 'none'
        currentSelection.url = null
        currentSelection.filename = null
        currentSelection.status = 'none'
        await currentSelection.save()
      } else {
        await WikipediaSelection.create({
          option_id: 'none',
          url: null,
          filename: null,
          status: 'none',
        })
      }

      // Restart Kiwix to reflect the change
      await this.dockerService
        .affectContainer(SERVICE_NAMES.KIWIX, 'restart')
        .catch((error) => {
          logger.error(`[ZimService] Failed to restart Kiwix after Wikipedia removal:`, error)
        })

      return { success: true, message: 'Wikipedia removed' }
    }

    // Start download for the new Wikipedia option
    if (!selectedOption.url) {
      throw new Error('Selected Wikipedia option has no download URL')
    }

    // Check if already downloading
    const existingJob = await RunDownloadJob.getByUrl(selectedOption.url)
    if (existingJob) {
      return { success: false, message: 'Download already in progress' }
    }

    // Extract filename from URL
    const filename = selectedOption.url.split('/').pop()
    if (!filename) {
      throw new Error('Could not determine filename from URL')
    }

    const filepath = join(process.cwd(), ZIM_STORAGE_PATH, filename)

    // Update or create selection record to show downloading status
    let selection: WikipediaSelection
    if (currentSelection) {
      currentSelection.option_id = optionId
      currentSelection.url = selectedOption.url
      currentSelection.filename = filename
      currentSelection.status = 'downloading'
      await currentSelection.save()
      selection = currentSelection
    } else {
      selection = await WikipediaSelection.create({
        option_id: optionId,
        url: selectedOption.url,
        filename: filename,
        status: 'downloading',
      })
    }

    // Dispatch download job
    const result = await RunDownloadJob.dispatch({
      url: selectedOption.url,
      filepath,
      timeout: 30000,
      allowedMimeTypes: ZIM_MIME_TYPES,
      forceNew: true,
      filetype: 'zim',
    })

    if (!result || !result.job) {
      // Revert status on failure to dispatch
      selection.option_id = currentSelection?.option_id || 'none'
      selection.url = currentSelection?.url || null
      selection.filename = currentSelection?.filename || null
      selection.status = currentSelection?.status || 'none'
      await selection.save()
      throw new Error('Failed to dispatch download job')
    }

    logger.info(`[ZimService] Started Wikipedia download for ${optionId}: ${filename}`)

    return {
      success: true,
      jobId: result.job.id,
      message: 'Download started',
    }
  }

  async onWikipediaDownloadComplete(url: string, success: boolean): Promise<void> {
    const selection = await this.getWikipediaSelection()

    if (!selection || selection.url !== url) {
      logger.warn(`[ZimService] Wikipedia download complete callback for unknown URL: ${url}`)
      return
    }

    if (success) {
      // Update status to installed
      selection.status = 'installed'
      await selection.save()

      logger.info(`[ZimService] Wikipedia download completed successfully: ${selection.filename}`)

      // Delete the old Wikipedia file if it exists and is different
      // We need to find what was previously installed
      const existingFiles = await this.list()
      const wikipediaFiles = existingFiles.files.filter((f) =>
        f.name.startsWith('wikipedia_en_') && f.name !== selection.filename
      )

      for (const oldFile of wikipediaFiles) {
        try {
          await this.delete(oldFile.name)
          logger.info(`[ZimService] Deleted old Wikipedia file: ${oldFile.name}`)
        } catch (error) {
          logger.warn(`[ZimService] Could not delete old Wikipedia file: ${oldFile.name}`, error)
        }
      }
    } else {
      // Download failed - keep the selection record but mark as failed
      selection.status = 'failed'
      await selection.save()
      logger.error(`[ZimService] Wikipedia download failed for: ${selection.filename}`)
    }
  }
}
