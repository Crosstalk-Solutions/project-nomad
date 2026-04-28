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
import { WikipediaOption, WikipediaState } from '../../types/downloads.js'
import vine from '@vinejs/vine'
import { wikipediaOptionsFileSchema } from '#validators/curated_collections'
import WikipediaSelection from '#models/wikipedia_selection'
import InstalledResource from '#models/installed_resource'
import { RunDownloadJob } from '#jobs/run_download_job'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import { CollectionManifestService } from './collection_manifest_service.js'
import { KiwixLibraryService } from './kiwix_library_service.js'
import type { CategoryWithStatus } from '../../types/collections.js'
import CustomLibrarySource from '#models/custom_library_source'
import { assertNotPrivateUrl } from '#validators/common'

const ZIM_MIME_TYPES = ['application/x-zim', 'application/x-openzim', 'application/octet-stream']
const WIKIPEDIA_OPTIONS_URL = 'https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/collections/wikipedia.json'

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
    // Kiwix returns pages of content unaware of what the user has installed locally. When
    // the installed set is large, a single 12-item Kiwix page can come back with everything
    // already installed → 0 post-filter items → frontend deadlock (#731). Accumulate across
    // upstream pages so we return a useful batch. Bounded by MAX_KIWIX_FETCHES so a heavily
    // saturated install doesn't hang a single request; the frontend scroll loop + auto-fetch
    // effect handle continuation.
    const KIWIX_PAGE_SIZE = 60
    const MAX_KIWIX_FETCHES = 5

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      textNodeName: '#text',
    })

    // Snapshot locally-installed files once — the filesystem won't change mid-request.
    const existing = await this.list()
    const existingKeys = new Set(existing.files.map((file) => file.name))

    const accumulated: RemoteZimFileEntry[] = []
    const seenIds = new Set<string>()
    let currentStart = start
    let totalResults = 0

    for (let i = 0; i < MAX_KIWIX_FETCHES; i++) {
      const res = await axios.get(LIBRARY_BASE_URL, {
        params: {
          start: currentStart,
          count: KIWIX_PAGE_SIZE,
          lang: 'eng',
          ...(query ? { q: query } : {}),
        },
        responseType: 'text',
      })

      const parsed = parser.parse(res.data)
      if (!isRawListRemoteZimFilesResponse(parsed)) {
        throw new Error('Invalid response format from remote library')
      }
      totalResults = parsed.feed.totalResults

      const rawEntries = parsed.feed.entry
        ? Array.isArray(parsed.feed.entry)
          ? parsed.feed.entry
          : [parsed.feed.entry]
        : []

      // Empty upstream response — bail even if totalResults suggests more (transient Kiwix
      // hiccup or totalResults drift between pages). Prevents a pointless spin.
      if (rawEntries.length === 0) break

      // Advance by actual returned count, not requested count. Short pages at the tail
      // would otherwise cause us to skip entries on the next fetch.
      currentStart += rawEntries.length

      for (const raw of rawEntries) {
        if (!isRawRemoteZimFileEntry(raw)) continue
        const entry = raw as RawRemoteZimFileEntry

        const downloadLink = entry.link.find(
          (link: any) =>
            typeof link === 'object' &&
            'rel' in link &&
            'length' in link &&
            'href' in link &&
            'type' in link &&
            link.type === 'application/x-zim'
        )
        if (!downloadLink) continue

        // downloadLink['href'] ends with .meta4; strip that to get the actual .zim URL.
        const download_url = downloadLink['href'].substring(0, downloadLink['href'].length - 6)
        const file_name = download_url.split('/').pop() || `${entry.title}.zim`
        if (existingKeys.has(file_name)) continue
        if (seenIds.has(entry.id)) continue
        seenIds.add(entry.id)

        const sizeBytes = parseInt(downloadLink['length'], 10)
        accumulated.push({
          id: entry.id,
          title: entry.title,
          updated: entry.updated,
          summary: entry.summary,
          size_bytes: sizeBytes || 0,
          download_url,
          author: entry.author.name,
          file_name,
        })
      }

      if (accumulated.length >= count) break
      if (currentStart >= totalResults) break
    }

    return {
      items: accumulated,
      has_more: currentStart < totalResults,
      total_count: totalResults,
      next_start: currentStart,
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
      const existingJob = await RunDownloadJob.getActiveByUrl(resource.url)
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
        title: (resource as any).title || undefined,
        totalBytes: (resource as any).size_mb ? (resource as any).size_mb * 1024 * 1024 : undefined,
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
    const existingJob = await RunDownloadJob.getActiveByUrl(selectedOption.url)
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
      title: selectedOption.name,
      totalBytes: selectedOption.size_mb ? selectedOption.size_mb * 1024 * 1024 : undefined,
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
    const filename = url.split('/').pop() || ''
    const selection = await this.getWikipediaSelection()

    // Determine which Wikipedia option this file belongs to by matching filename
    let matchedOptionId: string | null = null
    try {
      const options = await this.getWikipediaOptions()
      for (const opt of options) {
        if (opt.url && opt.url.split('/').pop() === filename) {
          matchedOptionId = opt.id
          break
        }
      }
    } catch {
      // If we can't fetch options, try to continue with existing selection
    }

    if (success) {
      // Update or create the selection record
      // Match by filename (not URL) so mirror downloads are recognized
      if (selection) {
        selection.option_id = matchedOptionId || selection.option_id
        selection.url = url
        selection.filename = filename
        selection.status = 'installed'
        await selection.save()
      } else {
        await WikipediaSelection.create({
          option_id: matchedOptionId || 'unknown',
          url: url,
          filename: filename,
          status: 'installed',
        })
      }

      logger.info(`[ZimService] Wikipedia download completed successfully: ${filename}`)

      // Delete old Wikipedia files (keep only the newly installed one)
      const existingFiles = await this.list()
      const wikipediaFiles = existingFiles.files.filter((f) =>
        f.name.startsWith('wikipedia_en_') && f.name !== filename
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
      // Download failed - update selection if it matches this file
      if (selection && (!selection.filename || selection.filename === filename)) {
        selection.status = 'failed'
        await selection.save()
        logger.error(`[ZimService] Wikipedia download failed for: ${filename}`)
      } else {
        logger.error(`[ZimService] Wikipedia download failed for: ${filename} (no matching selection)`)
      }
    }
  }

  // Custom library source management

  async listCustomLibraries(): Promise<CustomLibrarySource[]> {
    return CustomLibrarySource.all()
  }

  async addCustomLibrary(name: string, baseUrl: string): Promise<CustomLibrarySource> {
    const count = await CustomLibrarySource.query().count('* as total')
    const total = Number(count[0].$extras.total)
    if (total >= 10) {
      throw new Error('Maximum of 10 custom libraries allowed')
    }

    // Ensure URL ends with /
    const normalizedUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'

    return CustomLibrarySource.create({
      name,
      base_url: normalizedUrl,
    })
  }

  async removeCustomLibrary(id: number): Promise<void> {
    const source = await CustomLibrarySource.find(id)
    if (!source) {
      throw new Error('Custom library not found')
    }
    if (source.is_default) {
      throw new Error('Cannot remove a built-in mirror')
    }
    await source.delete()
  }

  async browseLibraryUrl(url: string): Promise<{
    directories: { name: string; url: string }[]
    files: { name: string; url: string; size_bytes: number | null }[]
  }> {
    assertNotPrivateUrl(url)

    const normalizedUrl = url.endsWith('/') ? url : url + '/'

    const res = await axios.get(normalizedUrl, {
      responseType: 'text',
      timeout: 15000,
      headers: {
        'Accept': 'text/html',
      },
    })

    const html: string = res.data
    const directories: { name: string; url: string }[] = []
    const files: { name: string; url: string; size_bytes: number | null }[] = []

    // Parse <a href="..."> links from HTML directory listings
    // Works with Apache, Nginx, and most HTTP directory indexes
    const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi
    let match: RegExpExecArray | null

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1]

      // Skip parent directory, self, sorting links, absolute paths, and absolute URLs
      if (!href || href === '../' || href === './' || href === '/' || href.startsWith('?') || href.startsWith('#')) {
        continue
      }

      // Skip absolute paths (e.g., /mirror/kiwix.org/) and absolute URLs
      if (href.startsWith('/') || href.startsWith('http://') || href.startsWith('https://')) {
        continue
      }

      // Directory (ends with /)
      if (href.endsWith('/')) {
        const dirName = decodeURIComponent(href.replace(/\/$/, ''))
        directories.push({
          name: dirName,
          url: normalizedUrl + href,
        })
        continue
      }

      // ZIM file
      if (href.endsWith('.zim')) {
        const fileName = decodeURIComponent(href)
        const sizeBytes = this._extractSizeFromListing(html, href)

        files.push({
          name: fileName,
          url: normalizedUrl + href,
          size_bytes: sizeBytes,
        })
      }
    }

    // Sort directories alphabetically, files alphabetically
    directories.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))

    return { directories, files }
  }

  /**
   * Try to extract file size from HTML directory listing.
   * Apache and Nginx directory listings typically show size near the filename.
   * Returns bytes or null if not parseable.
   */
  private _extractSizeFromListing(html: string, href: string): number | null {
    // Apache style: <a href="file.zim">file.zim</a>   2024-01-15 10:30  5.1G
    // Nginx style:  <a href="file.zim">file.zim</a>    15-Jan-2024 10:30   5368709120
    const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const sizePattern = new RegExp(
      escapedHref + `"[^<]*</a>\\s+[\\d-]+\\s+[\\d:]+\\s+([\\d.]+[KMGT]?)\\b`,
      'i'
    )
    const sizeMatch = sizePattern.exec(html)
    if (!sizeMatch) return null

    const sizeStr = sizeMatch[1]
    const num = parseFloat(sizeStr)
    if (isNaN(num)) return null

    // If it's a plain number (Nginx shows raw bytes)
    if (/^\d+$/.test(sizeStr)) return num

    // Apache uses K, M, G, T suffixes
    const suffix = sizeStr.slice(-1).toUpperCase()
    const multipliers: Record<string, number> = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }
    return multipliers[suffix] ? Math.round(num * multipliers[suffix]) : null
  }
}
