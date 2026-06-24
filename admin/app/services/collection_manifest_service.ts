import axios from 'axios'
import vine from '@vinejs/vine'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import { join } from 'path'
import CollectionManifest from '#models/collection_manifest'
import InstalledResource from '#models/installed_resource'
import WikipediaSelection from '#models/wikipedia_selection'
import { QueueService } from './queue_service.js'
import { RunDownloadJob } from '#jobs/run_download_job'
import { zimCategoriesSpecSchema, mapsSpecSchema, wikipediaSpecSchema } from '#validators/curated_collections'
import {
  ensureDirectoryExists,
  listDirectoryContents,
  getFileStatsIfExists,
  ZIM_STORAGE_PATH,
} from '../utils/fs.js'
import type {
  ManifestType,
  ZimCategoriesSpec,
  MapsSpec,
  CategoryWithStatus,
  CollectionWithStatus,
  SpecResource,
  SpecTier,
} from '../../types/collections.js'

const SPEC_URLS: Record<ManifestType, string> = {
  zim_categories: 'https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/collections/kiwix-categories.json',
  maps: 'https://github.com/Crosstalk-Solutions/project-nomad/raw/refs/heads/main/collections/maps.json',
  wikipedia: 'https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/collections/wikipedia.json',
}

const VALIDATORS: Record<ManifestType, any> = {
  zim_categories: zimCategoriesSpecSchema,
  maps: mapsSpecSchema,
  wikipedia: wikipediaSpecSchema,
}

export class CollectionManifestService {
  private readonly mapStoragePath = '/storage/maps'

  // ---- Spec management ----

  async fetchAndCacheSpec(type: ManifestType): Promise<boolean> {
    try {
      const response = await axios.get(SPEC_URLS[type], { timeout: 15000 })

      const validated = await vine.validate({
        schema: VALIDATORS[type],
        data: response.data,
      })

      const existing = await CollectionManifest.find(type)
      const specVersion = validated.spec_version

      if (existing) {
        const changed = existing.spec_version !== specVersion
        existing.spec_version = specVersion
        existing.spec_data = validated
        existing.fetched_at = DateTime.now()
        await existing.save()
        return changed
      }

      await CollectionManifest.create({
        type,
        spec_version: specVersion,
        spec_data: validated,
        fetched_at: DateTime.now(),
      })

      return true
    } catch (error) {
      logger.error(`[CollectionManifestService] Failed to fetch spec for ${type}:`, error?.message || error)
      return false
    }
  }

  async getCachedSpec<T>(type: ManifestType): Promise<T | null> {
    const manifest = await CollectionManifest.find(type)
    if (!manifest) return null
    return manifest.spec_data as T
  }

  async getSpecWithFallback<T>(type: ManifestType): Promise<T | null> {
    try {
      await this.fetchAndCacheSpec(type)
    } catch {
      // Fetch failed, will fall back to cache
    }
    return this.getCachedSpec<T>(type)
  }

  // ---- Status computation ----

  async getCategoriesWithStatus(): Promise<CategoryWithStatus[]> {
    const spec = await this.getSpecWithFallback<ZimCategoriesSpec>('zim_categories')
    if (!spec) return []

    // Include 'dataset' rows alongside 'zim' so a curated tier carrying the FDA
    // drug dataset reads "installed" once the ingest writes its row (the tier-
    // status math below treats every resolved resource id uniformly — a dataset
    // resource is just another id to account for).
    const installedResources = await InstalledResource.query().whereIn('resource_type', [
      'zim',
      'dataset',
    ])
    const installedMap = new Map(installedResources.map((r) => [r.resource_id, r]))

    // In-flight ZIM + dataset download resource IDs from the BullMQ queues. Used
    // to surface the user's tier intent immediately on submit, before any single
    // file has finished downloading. Failed jobs are excluded so a stuck queue
    // entry doesn't keep claiming the user's pick forever.
    const inFlightIds = await this.getInFlightZimResourceIds()

    // Whether the in-flight drug dataset is in its INGEST (indexing) phase — the
    // download finished and the heavy ingest is running. Lets the wizard card
    // flip "(downloading)" → "(indexing)" at the handoff (Req 7) instead of
    // showing a stale "downloading" through the long index.
    const drugIndexing = await this.isDrugDatasetIndexing()

    return spec.categories.map((category) => {
      const installedTierSlug = this.getInstalledTierForCategory(category.tiers, installedMap)
      const downloadingTierSlug = this.getDownloadingTierForCategory(
        category.tiers,
        installedMap,
        inFlightIds,
        installedTierSlug
      )
      // Only mark "indexing" when this category's downloading tier actually
      // carries a dataset resource that is the one indexing.
      const downloadingTierIndexing =
        drugIndexing && downloadingTierSlug
          ? CollectionManifestService.resolveTierResources(
              category.tiers.find((t) => t.slug === downloadingTierSlug)!,
              category.tiers
            ).some((r) => r.type === 'dataset')
          : false
      return { ...category, installedTierSlug, downloadingTierSlug, downloadingTierIndexing }
    })
  }

  /**
   * True when the FDA drug dataset's INGEST is in flight while its DOWNLOAD is
   * not — i.e. the handoff into the indexing phase. Drives the wizard card's
   * "(indexing)" label. Defensive: any queue read failure returns false (the card
   * just keeps showing "(downloading)") rather than breaking the categories list.
   */
  private async isDrugDatasetIndexing(): Promise<boolean> {
    try {
      const { DownloadDrugDataJob } = await import('#jobs/download_drug_data_job')
      const { IngestDrugDataJob } = await import('#jobs/ingest_drug_data_job')
      const queueService = QueueService.getInstance()

      const ingestQueue = queueService.getQueue(IngestDrugDataJob.queue)
      const ingestJobs = await ingestQueue.getJobs(['active', 'waiting', 'delayed'])
      if (ingestJobs.length === 0) return false

      const downloadQueue = queueService.getQueue(DownloadDrugDataJob.queue)
      const downloadJobs = await downloadQueue.getJobs(['active', 'waiting', 'delayed'])
      return downloadJobs.length === 0
    } catch (error: any) {
      logger.warn(
        '[CollectionManifestService] Could not determine drug indexing state:',
        error?.message || error
      )
      return false
    }
  }

  private async getInFlightZimResourceIds(): Promise<Set<string>> {
    const ids = new Set<string>()
    try {
      const queue = QueueService.getInstance().getQueue(RunDownloadJob.queue)
      const jobs = await queue.getJobs(['waiting', 'active', 'delayed'])
      for (const job of jobs) {
        if (job.data?.filetype !== 'zim') continue
        const resourceId = job.data?.resourceMetadata?.resource_id
        if (typeof resourceId === 'string') ids.add(resourceId)
      }
    } catch (error) {
      // Don't fail the whole categories endpoint if the queue is briefly
      // unreachable — just report no in-flight downloads.
      logger.warn('[CollectionManifestService] Could not read download queue:', error?.message || error)
    }

    // Also surface an in-flight curated-tier drug-dataset install. The drug
    // download/ingest run on their own queues (not RunDownloadJob), carrying the
    // dataset's resource id in resourceMeta — read it so the wizard shows the
    // Medicine tier as "downloading" the moment the user opts in, mirroring the
    // ZIM behaviour. Scanned independently so a missing drug queue can't blank
    // the ZIM in-flight set above.
    await this.addInFlightDrugDatasetId(ids)

    return ids
  }

  /**
   * Add the FDA drug dataset's manifest resource id to `ids` when its download or
   * ingest is in flight. The dataset only counts as "downloading" while no
   * install-state row exists yet — once ingest writes the row it is "installed"
   * (handled by the installedMap), so a still-running ingest correctly reads as
   * the in-flight tier intent here. resourceMeta is only present on a curated-tier
   * install, so a manual (non-tier) drug download never claims a tier slug.
   */
  private async addInFlightDrugDatasetId(ids: Set<string>): Promise<void> {
    try {
      const { DownloadDrugDataJob } = await import('#jobs/download_drug_data_job')
      const { IngestDrugDataJob } = await import('#jobs/ingest_drug_data_job')
      const queueService = QueueService.getInstance()
      for (const queueName of [DownloadDrugDataJob.queue, IngestDrugDataJob.queue]) {
        const queue = queueService.getQueue(queueName)
        const jobs = await queue.getJobs(['waiting', 'active', 'delayed'])
        for (const job of jobs) {
          const resourceId = job.data?.resourceMeta?.resourceId
          if (typeof resourceId === 'string') ids.add(resourceId)
        }
      }
    } catch (error: any) {
      logger.warn(
        '[CollectionManifestService] Could not read drug dataset queue:',
        error?.message || error
      )
    }
  }

  /**
   * Highest tier whose every resource is installed OR has an in-flight
   * download. Returns undefined when there are no in-flight downloads for this
   * category, or when the result would just duplicate installedTierSlug (i.e.
   * everything that's downloading is already installed — nothing new to show).
   */
  getDownloadingTierForCategory(
    tiers: SpecTier[],
    installedMap: Map<string, InstalledResource>,
    inFlightIds: Set<string>,
    installedTierSlug: string | undefined
  ): string | undefined {
    if (inFlightIds.size === 0) return undefined

    // Cheap pre-check: any of this category's resources actually in flight?
    const anyInFlight = tiers.some((tier) =>
      CollectionManifestService.resolveTierResources(tier, tiers).some((r) => inFlightIds.has(r.id))
    )
    if (!anyInFlight) return undefined

    const reversedTiers = [...tiers].reverse()
    for (const tier of reversedTiers) {
      const resolved = CollectionManifestService.resolveTierResources(tier, tiers)
      if (resolved.length === 0) continue
      const allAccountedFor = resolved.every(
        (r) => installedMap.has(r.id) || inFlightIds.has(r.id)
      )
      if (allAccountedFor) {
        return tier.slug === installedTierSlug ? undefined : tier.slug
      }
    }
    return undefined
  }

  async getMapCollectionsWithStatus(): Promise<CollectionWithStatus[]> {
    const spec = await this.getSpecWithFallback<MapsSpec>('maps')
    if (!spec) return []

    const installedResources = await InstalledResource.query().where('resource_type', 'map')
    const installedIds = new Set(installedResources.map((r) => r.resource_id))

    return spec.collections.map((collection) => {
      const installedCount = collection.resources.filter((r) => installedIds.has(r.id)).length
      return {
        ...collection,
        all_installed: installedCount === collection.resources.length,
        installed_count: installedCount,
        total_count: collection.resources.length,
      }
    })
  }

  // ---- Tier resolution ----

  static resolveTierResources(tier: SpecTier, allTiers: SpecTier[]): SpecResource[] {
    const visited = new Set<string>()
    return CollectionManifestService._resolveTierResourcesInner(tier, allTiers, visited)
  }

  private static _resolveTierResourcesInner(
    tier: SpecTier,
    allTiers: SpecTier[],
    visited: Set<string>
  ): SpecResource[] {
    if (visited.has(tier.slug)) return [] // cycle detection
    visited.add(tier.slug)

    const resources: SpecResource[] = []

    if (tier.includesTier) {
      const included = allTiers.find((t) => t.slug === tier.includesTier)
      if (included) {
        resources.push(...CollectionManifestService._resolveTierResourcesInner(included, allTiers, visited))
      }
    }

    resources.push(...tier.resources)
    return resources
  }

  getInstalledTierForCategory(
    tiers: SpecTier[],
    installedMap: Map<string, InstalledResource>
  ): string | undefined {
    // Check from highest tier to lowest (tiers are ordered low to high in spec)
    const reversedTiers = [...tiers].reverse()

    for (const tier of reversedTiers) {
      const resolved = CollectionManifestService.resolveTierResources(tier, tiers)
      if (resolved.length === 0) continue

      const allInstalled = resolved.every((r) => installedMap.has(r.id))
      if (allInstalled) {
        return tier.slug
      }
    }

    return undefined
  }

  // ---- Filename parsing ----

  static parseZimFilename(filename: string): { resource_id: string; version: string } | null {
    const name = filename.replace(/\.zim$/, '')
    const match = name.match(/^(.+)_(\d{4}-\d{2})$/)
    if (!match) return null
    return { resource_id: match[1], version: match[2] }
  }

  static parseMapFilename(filename: string): { resource_id: string; version: string } | null {
    const name = filename.replace(/\.pmtiles$/, '')
    const match = name.match(/^(.+)_(\d{4}-\d{2})$/)
    if (!match) return null
    return { resource_id: match[1], version: match[2] }
  }

  // ---- Filesystem reconciliation ----

  async reconcileFromFilesystem(): Promise<{ zim: number; map: number }> {
    let zimCount = 0
    let mapCount = 0

    console.log("RECONCILING FILESYSTEM MANIFESTS...")

    // Reconcile ZIM files
    try {
      const zimDir = join(process.cwd(), ZIM_STORAGE_PATH)
      await ensureDirectoryExists(zimDir)
      const zimItems = await listDirectoryContents(zimDir)
      const zimFiles = zimItems.filter((f) => f.name.endsWith('.zim'))

      console.log(`Found ${zimFiles.length} ZIM files on disk. Reconciling with database...`)

      // Get spec for URL lookup
      const zimSpec = await this.getCachedSpec<ZimCategoriesSpec>('zim_categories')
      const specResourceMap = new Map<string, SpecResource>()
      if (zimSpec) {
        for (const cat of zimSpec.categories) {
          for (const tier of cat.tiers) {
            for (const res of tier.resources) {
              specResourceMap.set(res.id, res)
            }
          }
        }
      }

      const seenZimIds = new Set<string>()

      // Only skip the single Wikipedia file tracked by WikipediaSelection — not every file
      // starting with `wikipedia_en_`. Curated category tiers (e.g. Medicine → Comprehensive)
      // ship Wikipedia-themed ZIMs like `wikipedia_en_medicine_maxi` that must reconcile
      // normally; otherwise their InstalledResource row gets wiped on every restart and the
      // tier detection silently downgrades.
      const wikipediaSelection = await WikipediaSelection.query().first()
      const managedWikipediaFilename = wikipediaSelection?.filename ?? null

      for (const file of zimFiles) {
        console.log(`Processing ZIM file: ${file.name}`)
        if (managedWikipediaFilename && file.name === managedWikipediaFilename) continue

        const parsed = CollectionManifestService.parseZimFilename(file.name)
        console.log(`Parsed ZIM filename:`, parsed)
        if (!parsed) continue

        seenZimIds.add(parsed.resource_id)

        const specRes = specResourceMap.get(parsed.resource_id)
        const filePath = join(zimDir, file.name)
        const stats = await getFileStatsIfExists(filePath)

        await InstalledResource.updateOrCreate(
          { resource_id: parsed.resource_id, resource_type: 'zim' },
          {
            version: parsed.version,
            url: specRes?.url || '',
            file_path: filePath,
            file_size_bytes: stats ? Number(stats.size) : null,
            installed_at: DateTime.now(),
          }
        )
        zimCount++
      }

      // Remove entries for ZIM files no longer on disk
      const existingZim = await InstalledResource.query().where('resource_type', 'zim')
      for (const entry of existingZim) {
        if (!seenZimIds.has(entry.resource_id)) {
          await entry.delete()
        }
      }
    } catch (error) {
      logger.error('[CollectionManifestService] Error reconciling ZIM files:', error)
    }

    // Reconcile map files
    try {
      const mapDir = join(process.cwd(), this.mapStoragePath, 'pmtiles')
      await ensureDirectoryExists(mapDir)
      const mapItems = await listDirectoryContents(mapDir)
      const mapFiles = mapItems.filter((f) => f.name.endsWith('.pmtiles'))

      // Get spec for URL/version lookup
      const mapSpec = await this.getCachedSpec<MapsSpec>('maps')
      const mapResourceMap = new Map<string, SpecResource>()
      if (mapSpec) {
        for (const col of mapSpec.collections) {
          for (const res of col.resources) {
            mapResourceMap.set(res.id, res)
          }
        }
      }

      const seenMapIds = new Set<string>()

      for (const file of mapFiles) {
        const parsed = CollectionManifestService.parseMapFilename(file.name)
        if (!parsed) continue

        seenMapIds.add(parsed.resource_id)

        const specRes = mapResourceMap.get(parsed.resource_id)
        const filePath = join(mapDir, file.name)
        const stats = await getFileStatsIfExists(filePath)

        await InstalledResource.updateOrCreate(
          { resource_id: parsed.resource_id, resource_type: 'map' },
          {
            version: parsed.version,
            url: specRes?.url || '',
            file_path: filePath,
            file_size_bytes: stats ? Number(stats.size) : null,
            installed_at: DateTime.now(),
          }
        )
        mapCount++
      }

      // Remove entries for map files no longer on disk
      const existingMaps = await InstalledResource.query().where('resource_type', 'map')
      for (const entry of existingMaps) {
        if (!seenMapIds.has(entry.resource_id)) {
          await entry.delete()
        }
      }
    } catch (error) {
      logger.error('[CollectionManifestService] Error reconciling map files:', error)
    }

    logger.info(`[CollectionManifestService] Reconciled ${zimCount} ZIM files, ${mapCount} map files`)
    return { zim: zimCount, map: mapCount }
  }
}
