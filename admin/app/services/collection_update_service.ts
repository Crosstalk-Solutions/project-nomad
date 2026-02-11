import logger from '@adonisjs/core/services/logger'
import InstalledResource from '#models/installed_resource'
import { CollectionManifestService } from './collection_manifest_service.js'
import type {
  ZimCategoriesSpec,
  MapsSpec,
  CollectionResourceUpdateInfo,
  CollectionUpdateCheckResult,
  SpecResource,
} from '../../types/collections.js'

export class CollectionUpdateService {
  private manifestService = new CollectionManifestService()

  async checkForUpdates(): Promise<CollectionUpdateCheckResult> {
    const resourceUpdates: CollectionResourceUpdateInfo[] = []
    let specChanged = false

    // Check if specs have changed
    try {
      const [zimChanged, mapsChanged] = await Promise.all([
        this.manifestService.fetchAndCacheSpec('zim_categories'),
        this.manifestService.fetchAndCacheSpec('maps'),
      ])
      specChanged = zimChanged || mapsChanged
    } catch (error) {
      logger.error('[CollectionUpdateService] Failed to fetch latest specs:', error)
    }

    // Check for ZIM resource version updates
    const zimUpdates = await this.checkZimUpdates()
    resourceUpdates.push(...zimUpdates)

    // Check for map resource version updates
    const mapUpdates = await this.checkMapUpdates()
    resourceUpdates.push(...mapUpdates)

    logger.info(
      `[CollectionUpdateService] Update check complete: spec_changed=${specChanged}, resource_updates=${resourceUpdates.length}`
    )

    return { spec_changed: specChanged, resource_updates: resourceUpdates }
  }

  private async checkZimUpdates(): Promise<CollectionResourceUpdateInfo[]> {
    const updates: CollectionResourceUpdateInfo[] = []

    try {
      const spec = await this.manifestService.getCachedSpec<ZimCategoriesSpec>('zim_categories')
      if (!spec) return updates

      const installed = await InstalledResource.query().where('resource_type', 'zim')
      if (installed.length === 0) return updates

      // Build a map of spec resources by ID for quick lookup
      const specResourceMap = new Map<string, SpecResource>()
      for (const category of spec.categories) {
        for (const tier of category.tiers) {
          for (const resource of tier.resources) {
            // Only keep the latest version if there are duplicates
            const existing = specResourceMap.get(resource.id)
            if (!existing || resource.version > existing.version) {
              specResourceMap.set(resource.id, resource)
            }
          }
        }
      }

      // Compare installed versions against spec versions
      for (const entry of installed) {
        const specResource = specResourceMap.get(entry.resource_id)
        if (!specResource) continue

        if (specResource.version > entry.version) {
          updates.push({
            resource_id: entry.resource_id,
            installed_version: entry.version,
            latest_version: specResource.version,
            latest_url: specResource.url,
            latest_size_mb: specResource.size_mb,
          })
        }
      }
    } catch (error) {
      logger.error('[CollectionUpdateService] Error checking ZIM updates:', error)
    }

    return updates
  }

  private async checkMapUpdates(): Promise<CollectionResourceUpdateInfo[]> {
    const updates: CollectionResourceUpdateInfo[] = []

    try {
      const spec = await this.manifestService.getCachedSpec<MapsSpec>('maps')
      if (!spec) return updates

      const installed = await InstalledResource.query().where('resource_type', 'map')
      if (installed.length === 0) return updates

      // Build a map of spec resources by ID
      const specResourceMap = new Map<string, SpecResource>()
      for (const collection of spec.collections) {
        for (const resource of collection.resources) {
          specResourceMap.set(resource.id, resource)
        }
      }

      // Compare installed versions against spec versions
      for (const entry of installed) {
        const specResource = specResourceMap.get(entry.resource_id)
        if (!specResource) continue

        if (specResource.version > entry.version) {
          updates.push({
            resource_id: entry.resource_id,
            installed_version: entry.version,
            latest_version: specResource.version,
            latest_url: specResource.url,
            latest_size_mb: specResource.size_mb,
          })
        }
      }
    } catch (error) {
      logger.error('[CollectionUpdateService] Error checking map updates:', error)
    }

    return updates
  }
}
