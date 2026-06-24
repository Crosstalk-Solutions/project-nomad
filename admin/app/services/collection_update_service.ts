import logger from '@adonisjs/core/services/logger'
import axios from 'axios'
import { DateTime } from 'luxon'
import InstalledResource from '#models/installed_resource'
import { RunDownloadJob } from '../jobs/run_download_job.js'
import { ZIM_STORAGE_PATH } from '../utils/fs.js'
import { join } from 'path'
import type {
  ResourceUpdateInfo,
  ContentUpdateCheckResult,
} from '../../types/collections.js'
import { KiwixCatalogService, reconcileResourceUpdateState } from './kiwix_catalog_service.js'

const MAP_STORAGE_PATH = '/storage/maps'

const ZIM_MIME_TYPES = ['application/x-zim', 'application/x-openzim', 'application/octet-stream']
const PMTILES_MIME_TYPES = ['application/vnd.pmtiles', 'application/octet-stream']

export class CollectionUpdateService {
  /**
   * Check every installed resource against the upstream catalogs locally (Kiwix
   * OPDS for ZIMs, GitHub for maps) — no longer routed through the external
   * project-nomad-api. Side-effect: persists each resource's available-update
   * state (version + cool-off anchor) so the auto-updater can act on it later.
   */
  async checkForUpdates(): Promise<ContentUpdateCheckResult> {
    // ZIM/map catalog update path only — exclude `dataset` resources (e.g. the
    // FDA drug labels), which are not filename-versioned and get their own
    // freshness path. No-op today (no dataset rows are written in this slice).
    const installed = await InstalledResource.query().whereNot('resource_type', 'dataset')
    if (installed.length === 0) {
      return {
        updates: [],
        checked_at: new Date().toISOString(),
      }
    }

    try {
      const catalog = new KiwixCatalogService()
      const latestByKey = await catalog.getLatestForResources(
        // `dataset` rows are filtered out above, so the type narrows to ZIM/map.
        installed.map((r) => ({
          resource_id: r.resource_id,
          resource_type: r.resource_type as 'zim' | 'map',
        }))
      )

      const now = DateTime.now()
      const updates: ResourceUpdateInfo[] = []
      for (const resource of installed) {
        const latest = latestByKey.get(`${resource.resource_type}:${resource.resource_id}`) ?? null
        await reconcileResourceUpdateState(resource, latest, now)

        if (latest && latest.version > resource.version) {
          updates.push({
            resource_id: resource.resource_id,
            resource_type: resource.resource_type as 'zim' | 'map',
            installed_version: resource.version,
            latest_version: latest.version,
            download_url: latest.download_url,
            size_bytes: latest.size_bytes || undefined,
          })
        }
      }

      logger.info(
        `[CollectionUpdateService] Local update check complete: ${updates.length} update(s) available`
      )

      const enriched = await this.enrichWithSizes(updates)
      return {
        updates: enriched,
        checked_at: new Date().toISOString(),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error during update check'
      logger.error(`[CollectionUpdateService] Failed to check for updates: ${message}`)
      return {
        updates: [],
        checked_at: new Date().toISOString(),
        error: 'Failed to check for content updates. Please try again later.',
      }
    }
  }

  async applyUpdate(
    update: ResourceUpdateInfo,
    options?: { auto?: boolean }
  ): Promise<{ success: boolean; jobId?: string; error?: string }> {
    // Check if a download is already in progress for this URL
    const existingJob = await RunDownloadJob.getByUrl(update.download_url)
    if (existingJob) {
      const state = await existingJob.getState()
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        return {
          success: false,
          error: `A download is already in progress for ${update.resource_id}`,
        }
      }
    }

    const filename = this.buildFilename(update)
    const filepath = this.buildFilepath(update, filename)

    const result = await RunDownloadJob.dispatch({
      url: update.download_url,
      filepath,
      timeout: 30000,
      allowedMimeTypes:
        update.resource_type === 'zim' ? ZIM_MIME_TYPES : PMTILES_MIME_TYPES,
      forceNew: true,
      filetype: update.resource_type,
      title: update.resource_id,
      totalBytes: update.size_bytes,
      resourceMetadata: {
        resource_id: update.resource_id,
        version: update.latest_version,
        collection_ref: null,
        auto: options?.auto ?? false,
      },
    })

    if (!result || !result.job) {
      return { success: false, error: 'Failed to dispatch download job' }
    }

    logger.info(
      `[CollectionUpdateService] Dispatched update download for ${update.resource_id}: ${update.installed_version} → ${update.latest_version}`
    )

    return { success: true, jobId: result.job.id }
  }

  async applyAllUpdates(
    updates: ResourceUpdateInfo[]
  ): Promise<{ results: Array<{ resource_id: string; success: boolean; jobId?: string; error?: string }> }> {
    const results = await Promise.all(
      updates.map(async (update) => {
        const result = await this.applyUpdate(update)
        return { resource_id: update.resource_id, ...result }
      })
    )

    return { results }
  }

  /**
   * Fetch Content-Length for each update URL in parallel. HEAD failures are non-fatal —
   * the update row just renders without a size. Bounded to HEAD_TIMEOUT_MS so a slow
   * mirror doesn't block the whole check.
   */
  private async enrichWithSizes(updates: ResourceUpdateInfo[]): Promise<ResourceUpdateInfo[]> {
    const HEAD_TIMEOUT_MS = 5000

    return await Promise.all(
      updates.map(async (update) => {
        if (update.size_bytes) return update // Trust upstream if it already gave us one
        try {
          const head = await axios.head(update.download_url, {
            timeout: HEAD_TIMEOUT_MS,
            maxRedirects: 5,
            validateStatus: (s) => s >= 200 && s < 400,
          })
          const len = Number(head.headers['content-length'])
          return Number.isFinite(len) && len > 0 ? { ...update, size_bytes: len } : update
        } catch {
          return update
        }
      })
    )
  }

  private buildFilename(update: ResourceUpdateInfo): string {
    if (update.resource_type === 'zim') {
      return `${update.resource_id}_${update.latest_version}.zim`
    }
    return `${update.resource_id}_${update.latest_version}.pmtiles`
  }

  private buildFilepath(update: ResourceUpdateInfo, filename: string): string {
    if (update.resource_type === 'zim') {
      return join(process.cwd(), ZIM_STORAGE_PATH, filename)
    }
    return join(process.cwd(), MAP_STORAGE_PATH, 'pmtiles', filename)
  }
}
