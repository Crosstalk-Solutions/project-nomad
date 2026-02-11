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
import { WikipediaOption, WikipediaState } from '../../types/downloads.js'
import vine from '@vinejs/vine'
import { wikipediaOptionsFileSchema } from '#validators/curated_collections'
import WikipediaSelection from '#models/wikipedia_selection'
import InstalledResource from '#models/installed_resource'
import { RunDownloadJob } from '#jobs/run_download_job'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import { CollectionManifestService } from './collection_manifest_service.js'
import type { CategoryWithStatus } from '../../types/collections.js'

const ZIM_MIME_TYPES = ['application/x-zim', 'application/x-openzim', 'application/octet-stream']
const WIKIPEDIA_OPTIONS_URL = 'https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/master/collections/wikipedia.json'

@inject()
export class ZimService {
  constructor(private dockerService: DockerService) { }

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

    // Parse resource metadata for the download job
    const parsedFilename = CollectionManifestService.parseZimFilename(filename)
    const resourceMetadata = parsedFilename
      ? { resource_id: parsedFilename.resource_id, version: parsedFilename.version, collection_ref: null }
      : undefined

    // Dispatch a background download job
    const result = await RunDownloadJob.dispatch({
      url,
      filepath,
      timeout: 30000,
      allowedMimeTypes: ZIM_MIME_TYPES,
      forceNew: true,
      filetype: 'zim',
      resourceMetadata,
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

  async listCuratedCategories(): Promise<CategoryWithStatus[]> {
    const manifestService = new CollectionManifestService()
    return manifestService.getCategoriesWithStatus()
  }

  async downloadCategoryTier(categorySlug: string, tierSlug: string): Promise<string[] | null> {
    const manifestService = new CollectionManifestService()
    const spec = await manifestService.getSpecWithFallback<import('../../types/collections.js').ZimCategoriesSpec>('zim_categories')
    if (!spec) {
      throw new Error('Could not load ZIM categories spec')
    }

    const category = spec.categories.find((c) => c.slug === categorySlug)
    if (!category) {
      throw new Error(`Category not found: ${categorySlug}`)
    }

    const tier = category.tiers.find((t) => t.slug === tierSlug)
    if (!tier) {
      throw new Error(`Tier not found: ${tierSlug}`)
    }

    const allResources = CollectionManifestService.resolveTierResources(tier, category.tiers)

    // Filter out already installed
    const installed = await InstalledResource.query().where('resource_type', 'zim')
    const installedIds = new Set(installed.map((r) => r.resource_id))
    const toDownload = allResources.filter((r) => !installedIds.has(r.id))

    if (toDownload.length === 0) return null

    const downloadFilenames: string[] = []

    for (const resource of toDownload) {
      const existingJob = await RunDownloadJob.getByUrl(resource.url)
      if (existingJob) {
        logger.warn(`[ZimService] Download already in progress for ${resource.url}, skipping.`)
        continue
      }

      const filename = resource.url.split('/').pop()
      if (!filename) continue

      downloadFilenames.push(filename)
      const filepath = join(process.cwd(), ZIM_STORAGE_PATH, filename)

      await RunDownloadJob.dispatch({
        url: resource.url,
        filepath,
        timeout: 30000,
        allowedMimeTypes: ZIM_MIME_TYPES,
        forceNew: true,
        filetype: 'zim',
        resourceMetadata: {
          resource_id: resource.id,
          version: resource.version,
          collection_ref: categorySlug,
        },
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

    if (restart) {
      // Check if there are any remaining ZIM download jobs before restarting
      const { QueueService } = await import('./queue_service.js')
      const queueService = new QueueService()
      const queue = queueService.getQueue('downloads')

      // Get all active and waiting jobs
      const [activeJobs, waitingJobs] = await Promise.all([
        queue.getActive(),
        queue.getWaiting(),
      ])

      // Filter out completed jobs (progress === 100) to avoid race condition
      // where this job itself is still in the active queue
      const activeIncompleteJobs = activeJobs.filter((job) => {
        const progress = typeof job.progress === 'number' ? job.progress : 0
        return progress < 100
      })

      // Check if any remaining incomplete jobs are ZIM downloads
      const allJobs = [...activeIncompleteJobs, ...waitingJobs]
      const hasRemainingZimJobs = allJobs.some((job) => job.data.filetype === 'zim')

      if (hasRemainingZimJobs) {
        logger.info('[ZimService] Skipping container restart - more ZIM downloads pending')
      } else {
        // Restart KIWIX container to pick up new ZIM file
        logger.info('[ZimService] No more ZIM downloads pending - restarting KIWIX container')
        await this.dockerService
          .affectContainer(SERVICE_NAMES.KIWIX, 'restart')
          .catch((error) => {
            logger.error(`[ZimService] Failed to restart KIWIX container:`, error) // Don't stop the download completion, just log the error.
          })
      }
    }

    // Create InstalledResource entries for downloaded files
    for (const url of urls) {
      // Skip Wikipedia files (managed separately)
      if (url.includes('wikipedia_en_')) continue

      const filename = url.split('/').pop()
      if (!filename) continue

      const parsed = CollectionManifestService.parseZimFilename(filename)
      if (!parsed) continue

      const filepath = join(process.cwd(), ZIM_STORAGE_PATH, filename)
      const stats = await getFileStatsIfExists(filepath)

      try {
        const { DateTime } = await import('luxon')
        await InstalledResource.updateOrCreate(
          { resource_id: parsed.resource_id, resource_type: 'zim' },
          {
            version: parsed.version,
            url: url,
            file_path: filepath,
            file_size_bytes: stats ? Number(stats.size) : null,
            installed_at: DateTime.now(),
          }
        )
        logger.info(`[ZimService] Created InstalledResource entry for: ${parsed.resource_id}`)
      } catch (error) {
        logger.error(`[ZimService] Failed to create InstalledResource for ${filename}:`, error)
      }
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

    // Clean up InstalledResource entry
    const parsed = CollectionManifestService.parseZimFilename(fileName)
    if (parsed) {
      await InstalledResource.query()
        .where('resource_id', parsed.resource_id)
        .where('resource_type', 'zim')
        .delete()
      logger.info(`[ZimService] Deleted InstalledResource entry for: ${parsed.resource_id}`)
    }
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
