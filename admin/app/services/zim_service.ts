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
import { join, resolve, sep } from 'path'
import { WikipediaOption, WikipediaOptionsFile, WikipediaState } from '../../types/downloads.js'
import WikipediaSelection from '#models/wikipedia_selection'
import InstalledResource from '#models/installed_resource'
import KVStore from '#models/kv_store'
import { RunDownloadJob } from '#jobs/run_download_job'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import { CollectionManifestService } from './collection_manifest_service.js'
import { KiwixLibraryService } from './kiwix_library_service.js'
import type { CategoryWithStatus, SpecResource, ZimCategoriesSpec } from '../../types/collections.js'

const ZIM_MIME_TYPES = ['application/x-zim', 'application/x-openzim', 'application/octet-stream']

// In-memory cache for Kiwix API URL resolution (5-minute TTL)
const kiwixUrlCache = new Map<string, { url: string; timestamp: number }>()
const KIWIX_CACHE_TTL = 5 * 60 * 1000

@inject()
export class ZimService {
  constructor(private dockerService: DockerService) { }

  // ---- Language preference methods ----

  async getContentLanguage(): Promise<string> {
    const lang = await KVStore.getValue('content.language')
    return lang || 'en'
  }

  async setContentLanguage(iso1: string): Promise<void> {
    await KVStore.setValue('content.language', iso1)
  }

  // ---- Kiwix API URL resolution ----

  /**
   * Resolves the latest download URL for a ZIM file from the Kiwix catalog API.
   * @param zimName - The ZIM name (e.g. "ifixit_es_all", "wikipedia_es_all")
   * @param flavour - Optional flavour filter (e.g. "maxi", "nopic", "mini")
   * @returns The direct download URL (without .meta4 suffix)
   */
  async resolveKiwixUrl(zimName: string, flavour?: string): Promise<string> {
    const cacheKey = `${zimName}:${flavour || ''}`
    const cached = kiwixUrlCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < KIWIX_CACHE_TTL) {
      return cached.url
    }

    const apiUrl = 'https://library.kiwix.org/catalog/v2/entries'
    const res = await axios.get(apiUrl, {
      params: { name: zimName, count: 10 },
      responseType: 'text',
    })

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      textNodeName: '#text',
    })
    const result = parser.parse(res.data)

    const entries = result?.feed?.entry
      ? Array.isArray(result.feed.entry)
        ? result.feed.entry
        : [result.feed.entry]
      : []

    // Find the entry matching the exact name and optionally the flavour
    const match = entries.find((entry: any) => {
      const nameMatch = entry.name === zimName
      if (!nameMatch) return false
      if (!flavour) return true
      return entry.flavour === flavour
    })

    if (!match) {
      throw new Error(`No Kiwix entry found for name="${zimName}" flavour="${flavour || 'any'}"`)
    }

    const links = Array.isArray(match.link) ? match.link : [match.link]
    const downloadLink = links.find((link: any) =>
      typeof link === 'object' &&
      link.rel === 'http://opds-spec.org/acquisition/open-access' &&
      typeof link.href === 'string'
    )

    if (!downloadLink) {
      throw new Error(`No download link found for ${zimName}`)
    }

    // Remove .meta4 suffix to get direct download URL
    let url = downloadLink.href
    if (url.endsWith('.meta4')) {
      url = url.substring(0, url.length - 6)
    }

    kiwixUrlCache.set(cacheKey, { url, timestamp: Date.now() })
    return url
  }

  /**
   * Resolves the download URL for a SpecResource in a given language.
   * For multi-language resources (with zim_name template), resolves via Kiwix API.
   * For English-only resources (with url), returns the static URL.
   */
  async resolveResourceUrl(
    resource: SpecResource,
    language: string
  ): Promise<{ url: string; resourceId: string; sizeMb: number }> {
    if (resource.zim_name) {
      // Multi-language resource: resolve via Kiwix API
      const effectiveLang = resource.available_languages?.includes(language) ? language : 'en'
      const resolvedName = resource.zim_name.replace('{lang}', effectiveLang)
      const url = await this.resolveKiwixUrl(resolvedName, resource.zim_flavour)
      const sizeMb = resource.size_mb_by_lang?.[effectiveLang] ?? resource.size_mb
      return { url, resourceId: resolvedName, sizeMb }
    }

    // English-only resource: use static URL
    if (!resource.url) {
      throw new Error(`Resource ${resource.id} has no URL and no zim_name template`)
    }
    return { url: resource.url, resourceId: resource.id, sizeMb: resource.size_mb }
  }

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

  async downloadRemote(url: string, metadata?: { title?: string; summary?: string; author?: string; size_bytes?: number }): Promise<{ filename: string; jobId?: string }> {
    const parsed = new URL(url)
    if (!parsed.pathname.endsWith('.zim')) {
      throw new Error(`Invalid ZIM file URL: ${url}. URL must end with .zim`)
    }

    const existing = await RunDownloadJob.getActiveByUrl(url)
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
      title: metadata?.title,
      totalBytes: metadata?.size_bytes,
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

  async downloadCategoryTier(categorySlug: string, tierSlug: string, language?: string): Promise<string[] | null> {
    const manifestService = new CollectionManifestService()
    const spec = await manifestService.getSpecWithFallback<ZimCategoriesSpec>('zim_categories')
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

    const effectiveLanguage = language || await this.getContentLanguage()
    const allResources = CollectionManifestService.resolveTierResources(tier, category.tiers)

    // Filter out already installed (using language-resolved resource IDs)
    const installed = await InstalledResource.query().where('resource_type', 'zim')
    const installedIds = new Set(installed.map((r) => r.resource_id))

    const toDownload: Array<{ resource: SpecResource; url: string; resourceId: string; sizeMb: number }> = []

    for (const resource of allResources) {
      try {
        const resolved = await this.resolveResourceUrl(resource, effectiveLanguage)
        if (!installedIds.has(resolved.resourceId)) {
          toDownload.push({ resource, ...resolved })
        }
      } catch (error) {
        logger.error(`[ZimService] Failed to resolve URL for resource ${resource.id}:`, error)
      }
    }

    if (toDownload.length === 0) return null

    const downloadFilenames: string[] = []

    for (const { resource, url, resourceId, sizeMb } of toDownload) {
      const existingJob = await RunDownloadJob.getActiveByUrl(url)
      if (existingJob) {
        logger.warn(`[ZimService] Download already in progress for ${url}, skipping.`)
        continue
      }

      const filename = url.split('/').pop()
      if (!filename) continue

      downloadFilenames.push(filename)
      const filepath = join(process.cwd(), ZIM_STORAGE_PATH, filename)

      await RunDownloadJob.dispatch({
        url,
        filepath,
        timeout: 30000,
        allowedMimeTypes: ZIM_MIME_TYPES,
        forceNew: true,
        filetype: 'zim',
        title: resource.title || undefined,
        totalBytes: sizeMb ? sizeMb * 1024 * 1024 : undefined,
        resourceMetadata: {
          resource_id: resourceId,
          version: resource.version || '',
          collection_ref: categorySlug,
        },
      })
    }

    return downloadFilenames.length > 0 ? downloadFilenames : null
  }

  async downloadRemoteSuccessCallback(urls: string[], restart = true) {
    // Check if any URL is a Wikipedia download and handle it
    for (const url of urls) {
      if (/wikipedia_[a-z]{2,3}_/.test(url)) {
        await this.onWikipediaDownloadComplete(url, true)
      }
    }
    
    // Update the kiwix library XML after all downloaded ZIM files are in place.
    // This covers all ZIM types including Wikipedia. Rebuilding once from disk
    // avoids repeated XML parse/write cycles and reduces the chance of write races
    // when multiple download jobs complete concurrently.
    const kiwixLibraryService = new KiwixLibraryService()
    try {
      await kiwixLibraryService.rebuildFromDisk()
    } catch (err) {
      logger.error('[ZimService] Failed to rebuild kiwix library from disk:', err)
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
        const progress = typeof job.progress === 'object' && job.progress !== null
          ? (job.progress as any).percent
          : typeof job.progress === 'number' ? job.progress : 0
        return progress < 100
      })

      // Check if any remaining incomplete jobs are ZIM downloads
      const allJobs = [...activeIncompleteJobs, ...waitingJobs]
      const hasRemainingZimJobs = allJobs.some((job) => job.data.filetype === 'zim')

      if (hasRemainingZimJobs) {
        logger.info('[ZimService] Skipping container restart - more ZIM downloads pending')
      } else {
        // If kiwix is already running in library mode, --monitorLibrary will pick up
        // the XML change automatically — no restart needed.
        const isLegacy = await this.dockerService.isKiwixOnLegacyConfig()
        if (!isLegacy) {
          logger.info('[ZimService] Kiwix is in library mode — XML updated, no container restart needed.')
        } else {
          // Legacy config: restart (affectContainer will trigger migration instead)
          logger.info('[ZimService] No more ZIM downloads pending - restarting KIWIX container')
          await this.dockerService
            .affectContainer(SERVICE_NAMES.KIWIX, 'restart')
            .catch((error) => {
              logger.error(`[ZimService] Failed to restart KIWIX container:`, error)
            })
        }
      }
    }

    // Create InstalledResource entries for downloaded files
    const currentLanguage = await this.getContentLanguage()
    for (const url of urls) {
      // Skip Wikipedia files (managed separately)
      if (/wikipedia_[a-z]{2,3}_/.test(url)) continue

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
            language: currentLanguage,
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

    const basePath = resolve(join(process.cwd(), ZIM_STORAGE_PATH))
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

    // Remove from kiwix library XML so --monitorLibrary stops serving the deleted file
    const kiwixLibraryService = new KiwixLibraryService()
    await kiwixLibraryService.removeBook(fileName).catch((err) => {
      logger.error(`[ZimService] Failed to remove ${fileName} from kiwix library:`, err)
    })

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

  async getWikipediaSpec(): Promise<WikipediaOptionsFile> {
    // Use the manifest service for fetch + cache fallback (consistent with category specs)
    const manifestService = new CollectionManifestService()
    const spec = await manifestService.getSpecWithFallback<WikipediaOptionsFile>('wikipedia')

    if (!spec) {
      logger.error(`[ZimService] Failed to fetch Wikipedia spec (no cache available)`)
      throw new Error('Failed to fetch Wikipedia spec')
    }

    return spec
  }

  async getWikipediaOptions(): Promise<WikipediaOption[]> {
    const spec = await this.getWikipediaSpec()
    return spec.options
  }

  async getWikipediaSelection(): Promise<WikipediaSelection | null> {
    // Get the single row from wikipedia_selections (there should only ever be one)
    return WikipediaSelection.query().first()
  }

  async getWikipediaState(): Promise<WikipediaState> {
    const spec = await this.getWikipediaSpec()
    const selection = await this.getWikipediaSelection()
    const selectedLanguage = await this.getContentLanguage()

    return {
      options: spec.options,
      languages: spec.languages,
      selectedLanguage,
      currentSelection: selection
        ? {
          optionId: selection.option_id,
          status: selection.status,
          filename: selection.filename,
          url: selection.url,
          language: selection.language,
        }
        : null,
    }
  }

  async selectWikipedia(optionId: string, language?: string): Promise<{ success: boolean; jobId?: string; message?: string }> {
    const spec = await this.getWikipediaSpec()
    const selectedOption = spec.options.find((opt) => opt.id === optionId)

    if (!selectedOption) {
      throw new Error(`Invalid Wikipedia option: ${optionId}`)
    }

    // Resolve the effective language
    const effectiveLanguage = language || await this.getContentLanguage()

    // Persist the language preference if provided
    if (language) {
      await this.setContentLanguage(language)
    }

    const currentSelection = await this.getWikipediaSelection()

    // If same option AND same language as currently installed, no action needed
    if (
      currentSelection?.option_id === optionId &&
      currentSelection.language === effectiveLanguage &&
      currentSelection.status === 'installed'
    ) {
      return { success: true, message: 'Already installed' }
    }

    // Handle "none" option - delete current Wikipedia file and update DB
    if (optionId === 'none') {
      if (currentSelection?.filename) {
        try {
          await this.delete(currentSelection.filename)
          logger.info(`[ZimService] Deleted Wikipedia file: ${currentSelection.filename}`)
        } catch (error) {
          logger.warn(`[ZimService] Could not delete Wikipedia file (may already be gone): ${currentSelection.filename}`)
        }
      }

      if (currentSelection) {
        currentSelection.option_id = 'none'
        currentSelection.url = null
        currentSelection.filename = null
        currentSelection.status = 'none'
        currentSelection.language = effectiveLanguage
        await currentSelection.save()
      } else {
        await WikipediaSelection.create({
          option_id: 'none',
          url: null,
          filename: null,
          status: 'none',
          language: effectiveLanguage,
        })
      }

      await this.dockerService
        .affectContainer(SERVICE_NAMES.KIWIX, 'restart')
        .catch((error) => {
          logger.error(`[ZimService] Failed to restart Kiwix after Wikipedia removal:`, error)
        })

      return { success: true, message: 'Wikipedia removed' }
    }

    // Resolve the download URL dynamically via Kiwix API if the option has a zim_name template
    let downloadUrl: string
    let sizeMb = selectedOption.size_mb

    if (selectedOption.zim_name) {
      const resolvedName = selectedOption.zim_name.replace('{lang}', effectiveLanguage)
      try {
        downloadUrl = await this.resolveKiwixUrl(resolvedName, selectedOption.zim_flavour)
      } catch (error) {
        logger.error(`[ZimService] Failed to resolve Kiwix URL for ${resolvedName}:`, error)
        throw new Error(`Could not resolve download URL for Wikipedia ${optionId} in ${effectiveLanguage}`)
      }
      sizeMb = selectedOption.size_mb_by_lang?.[effectiveLanguage] ?? selectedOption.size_mb
    } else if (selectedOption.url) {
      downloadUrl = selectedOption.url
    } else {
      throw new Error('Selected Wikipedia option has no download URL or zim_name template')
    }

    // Check if already downloading
    const existingJob = await RunDownloadJob.getActiveByUrl(downloadUrl)
    if (existingJob) {
      return { success: false, message: 'Download already in progress' }
    }

    const filename = downloadUrl.split('/').pop()
    if (!filename) {
      throw new Error('Could not determine filename from URL')
    }

    const filepath = join(process.cwd(), ZIM_STORAGE_PATH, filename)

    // Update or create selection record to show downloading status
    let selection: WikipediaSelection
    if (currentSelection) {
      currentSelection.option_id = optionId
      currentSelection.url = downloadUrl
      currentSelection.filename = filename
      currentSelection.status = 'downloading'
      currentSelection.language = effectiveLanguage
      await currentSelection.save()
      selection = currentSelection
    } else {
      selection = await WikipediaSelection.create({
        option_id: optionId,
        url: downloadUrl,
        filename: filename,
        status: 'downloading',
        language: effectiveLanguage,
      })
    }

    // Dispatch download job
    const result = await RunDownloadJob.dispatch({
      url: downloadUrl,
      filepath,
      timeout: 30000,
      allowedMimeTypes: ZIM_MIME_TYPES,
      forceNew: true,
      filetype: 'zim',
      title: selectedOption.name,
      totalBytes: sizeMb ? sizeMb * 1024 * 1024 : undefined,
    })

    if (!result || !result.job) {
      selection.option_id = currentSelection?.option_id || 'none'
      selection.url = currentSelection?.url || null
      selection.filename = currentSelection?.filename || null
      selection.status = currentSelection?.status || 'none'
      selection.language = currentSelection?.language || 'en'
      await selection.save()
      throw new Error('Failed to dispatch download job')
    }

    logger.info(`[ZimService] Started Wikipedia download for ${optionId} (${effectiveLanguage}): ${filename}`)

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
      selection.status = 'installed'
      await selection.save()

      logger.info(`[ZimService] Wikipedia download completed successfully: ${selection.filename}`)

      // Delete old Wikipedia files (any language) that are different from the newly installed one
      const existingFiles = await this.list()
      const wikipediaFiles = existingFiles.files.filter((f) =>
        /^wikipedia_[a-z]{2,3}_/.test(f.name) && f.name !== selection.filename
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
      selection.status = 'failed'
      await selection.save()
      logger.error(`[ZimService] Wikipedia download failed for: ${selection.filename}`)
    }
  }
}
