import axios from 'axios'
import vine from '@vinejs/vine'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import { join } from 'path'
import CollectionManifest from '#models/collection_manifest'
import InstalledResource from '#models/installed_resource'
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
  zim_categories: 'https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/master/collections/kiwix-categories.json',
  maps: 'https://github.com/Crosstalk-Solutions/project-nomad/raw/refs/heads/master/collections/maps.json',
  wikipedia: 'https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/master/collections/wikipedia.json',
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

    const installedResources = await InstalledResource.query().where('resource_type', 'zim')
    const installedMap = new Map(installedResources.map((r) => [r.resource_id, r]))

    return spec.categories.map((category) => ({
      ...category,
      installedTierSlug: this.getInstalledTierForCategory(category.tiers, installedMap),
    }))
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

      for (const file of zimFiles) {
        console.log(`Processing ZIM file: ${file.name}`)
        // Skip Wikipedia files (managed by WikipediaSelection model)
        if (file.name.startsWith('wikipedia_en_')) continue

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
