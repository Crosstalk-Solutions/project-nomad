import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { join } from 'node:path'
import { DockerService } from '#services/docker_service'
import { ZimService } from '#services/zim_service'
import { CollectionManifestService } from '#services/collection_manifest_service'
import { RunDownloadJob } from '#jobs/run_download_job'
import { ZIM_STORAGE_PATH } from '../utils/fs.js'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import type { CreatorPacksSpec, CreatorPackWithStatus } from '../../types/collections.js'

// ZIMs report as octet-stream from the Worker (Content-Type is set explicitly to
// application/octet-stream in worker/src/index.js). Mirror the ZimService allowlist.
const ZIM_MIME_TYPES = ['application/x-zim', 'application/x-openzim', 'application/octet-stream']

// Default entitlement Worker origin. Overridable via CREATOR_PACKS_WORKER_BASE so
// we can move to a branded packs.projectnomad.us domain without a code change.
const DEFAULT_WORKER_BASE = 'https://nomad-packs-worker.chris-556.workers.dev'

/**
 * Outcome of an install request. Discriminated on `code` so the controller can
 * map each case to an HTTP status without string-matching thrown messages.
 * (See feedback: typed failure codes over ad-hoc Error parsing.)
 */
export type InstallPackResult =
  | { code: 'dispatched'; filename: string }
  | { code: 'already_installed' }
  | { code: 'already_downloading' }
  | { code: 'not_found' }
  | { code: 'not_configured' }

export type UninstallPackResult =
  | { code: 'uninstalled'; filename: string }
  | { code: 'not_installed' }

/**
 * Creator Packs install rail. Diverges from the curated-collections rail in
 * exactly one way: instead of a static manifest URL, the ZIM is fetched from the
 * entitlement Worker with a bearer `Authorization` header. From RunDownloadJob
 * onward everything is the shared rail (resumable download → InstalledResource →
 * Kiwix rebuildFromDisk). Video ZIMs opt out of KB embedding via skip_embedding.
 */
export class CreatorPackService {
  private dockerService: DockerService
  private manifestService: CollectionManifestService

  constructor(dockerService?: DockerService, manifestService?: CollectionManifestService) {
    this.dockerService = dockerService ?? new DockerService()
    this.manifestService = manifestService ?? new CollectionManifestService()
  }

  private get workerBase(): string {
    return (env.get('CREATOR_PACKS_WORKER_BASE') || DEFAULT_WORKER_BASE).replace(/\/+$/, '')
  }

  /**
   * Whether this build can actually install packs — i.e. the release-injected
   * app key is present. Forks built from source have no key; the UI uses this to
   * HIDE the Creator Packs surfaces entirely rather than show install buttons
   * that would 503. The public catalog still lists, but nothing is installable.
   */
  isConfigured(): boolean {
    return !!env.get('CREATOR_PACKS_APP_KEY')
  }

  /** Stable, per-version download URL. Not signed — the gate is the auth header. */
  packUrl(id: string, version: string): string {
    return `${this.workerBase}/packs/${id}_${version}.zim`
  }

  async listPacksWithStatus(): Promise<CreatorPackWithStatus[]> {
    return this.manifestService.getCreatorPacksWithStatus()
  }

  /**
   * Install a pack by catalog id: ensure Kiwix is present (auto-install if not),
   * then dispatch the gated ZIM download onto the shared rail.
   */
  async installPack(packId: string): Promise<InstallPackResult> {
    const appKey = env.get('CREATOR_PACKS_APP_KEY')
    if (!appKey) {
      logger.error('[CreatorPackService] CREATOR_PACKS_APP_KEY is not set; cannot install packs')
      return { code: 'not_configured' }
    }

    const spec = await this.manifestService.getSpecWithFallback<CreatorPacksSpec>('creator_packs')
    const pack = spec?.packs.find((p) => p.id === packId)
    if (!pack) {
      return { code: 'not_found' }
    }

    const { default: InstalledResource } = await import('#models/installed_resource')
    const existing = await InstalledResource.query()
      .where('resource_type', 'zim')
      .where('resource_id', pack.resource_id)
      .first()
    if (existing && existing.version === pack.version) {
      return { code: 'already_installed' }
    }

    const url = this.packUrl(pack.id, pack.version)
    if (await RunDownloadJob.getActiveByUrl(url)) {
      return { code: 'already_downloading' }
    }

    // Kiwix is a hard prerequisite — it's what serves the pack. Auto-install it if
    // absent (its own preinstall bootstraps a mini-wiki ZIM so the container can
    // start). Best-effort: if the install can't be kicked off we still download the
    // pack so the bytes are on disk; Kiwix hot-reloads it once installed.
    await this.ensureKiwixInstalled()

    const filename = `${pack.id}_${pack.version}.zim`
    const filepath = join(process.cwd(), ZIM_STORAGE_PATH, filename)

    await RunDownloadJob.dispatch({
      url,
      filepath,
      timeout: 30000,
      allowedMimeTypes: ZIM_MIME_TYPES,
      filetype: 'zim',
      title: pack.name,
      totalBytes: pack.size_mb ? pack.size_mb * 1024 * 1024 : undefined,
      requestHeaders: { Authorization: `Bearer ${appKey}` },
      resourceMetadata: {
        resource_id: pack.resource_id,
        version: pack.version,
        collection_ref: 'creator-packs',
        skip_embedding: true,
      },
    })

    logger.info(`[CreatorPackService] Dispatched download for pack ${pack.id} (${filename})`)
    return { code: 'dispatched', filename }
  }

  /**
   * Uninstall an installed pack: delete the ZIM (which via ZimService.delete also
   * removes it from the Kiwix library and clears its InstalledResource row).
   * Uses the INSTALLED version (not the catalog's) so we remove the file that's
   * actually on disk even if a newer version has since been published.
   */
  async uninstallPack(packId: string): Promise<UninstallPackResult> {
    const { default: InstalledResource } = await import('#models/installed_resource')
    const installed = await InstalledResource.query()
      .where('resource_type', 'zim')
      .where('resource_id', packId)
      .first()
    if (!installed) {
      return { code: 'not_installed' }
    }

    const filename = `${packId}_${installed.version}.zim`
    const zimService = new ZimService(this.dockerService)
    await zimService.delete(filename)

    logger.info(`[CreatorPackService] Uninstalled pack ${packId} (${filename})`)
    return { code: 'uninstalled', filename }
  }

  private async ensureKiwixInstalled(): Promise<void> {
    try {
      const kiwixUrl = await this.dockerService.getServiceURL(SERVICE_NAMES.KIWIX)
      if (kiwixUrl) return // already installed and resolvable

      logger.info('[CreatorPackService] Kiwix not installed; auto-installing before pack download')
      const result = await this.dockerService.createContainerPreflight(SERVICE_NAMES.KIWIX)
      if (!result.success) {
        // e.g. "already installing" — not fatal, the pack download proceeds regardless.
        logger.warn(`[CreatorPackService] Kiwix preflight did not start: ${result.message}`)
      }
    } catch (error: any) {
      logger.warn(
        `[CreatorPackService] Kiwix auto-install failed (continuing with pack download): ${error?.message || error}`
      )
    }
  }
}
