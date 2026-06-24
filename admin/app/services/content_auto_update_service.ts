import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import KVStore from '#models/kv_store'
import InstalledResource from '#models/installed_resource'
import { DownloadService } from '#services/download_service'
import { CollectionUpdateService } from '#services/collection_update_service'
import {
  KiwixCatalogService,
  reconcileResourceUpdateState,
  type CatalogResult,
} from '#services/kiwix_catalog_service'
import { isWithinWindow, parseWindowMinutes } from '../utils/update_window.js'
import { recordResourceUpdateFailure } from '../utils/content_auto_update_backoff.js'
import type { Blocker, PreflightResult } from '../utils/image_disk_preflight.js'

/**
 * Content auto-update is opt-in via a single global master switch and runs on
 * its OWN window + per-window data cap (deliberately separate from the core/app
 * `autoUpdate.*` window, since ZIM downloads are multi-GB and bandwidth
 * sensitive). Defaults err toward an overnight window with no cap; the UI
 * strongly recommends setting a cap.
 */
const DEFAULT_WINDOW_START = '02:00'
const DEFAULT_WINDOW_END = '05:00'
const DEFAULT_COOLOFF_HOURS = 72

/** Whole-feature failures (e.g. catalog unreachable) before it self-disables. */
const MAX_FEATURE_FAILURES = 3

export interface ContentAutoUpdateConfig {
  /** Global master switch (`contentAutoUpdate.enabled`). */
  enabled: boolean
  windowStart: string
  windowEnd: string
  cooloffHours: number
  /** Max NEW bytes initiated per window instance. 0 = unlimited. */
  maxBytesPerWindow: number
}

/** Per-resource eligibility verdict (drives both selection and the status UI). */
export interface ContentEligibility {
  eligible: boolean
  reason: string
  cooloffRemainingHours: number | null
}

/** An eligible resource paired with the catalog facts needed to download it. */
export interface ContentCandidate {
  resource: InstalledResource
  version: string
  download_url: string
  size_bytes: number
  installed_at: DateTime
}

/** Outcome of the cap-bounded greedy selection. */
export interface ContentSelection {
  selected: ContentCandidate[]
  /** Single files larger than the whole cap — never auto-started (manual only). */
  skippedOversize: ContentCandidate[]
  /** Fit the cap but not this window's remaining budget — retried next window. */
  deferred: ContentCandidate[]
}

export interface ContentAutoUpdateResourceStatus {
  resource_id: string
  resource_type: 'zim' | 'map'
  current_version: string
  available_update_version: string | null
  size_bytes: number | null
  eligible: boolean
  reason: string
  cooloff_remaining_hours: number | null
  exceeds_cap: boolean
  consecutive_failures: number
  auto_disabled_reason: string | null
}

export interface ContentAutoUpdateStatus extends ContentAutoUpdateConfig {
  withinWindow: boolean
  windowBytesUsed: number
  lastAttemptAt: string | null
  lastResult: string | null
  lastError: string | null
  autoDisabledReason: string | null
  resources: ContentAutoUpdateResourceStatus[]
}

/**
 * Decision + safety layer for automatic content (ZIM/map) updates. This is the
 * content-side counterpart to {@link AppAutoUpdateService}: it decides *whether*
 * each installed resource with an available update should be downloaded now
 * (master switch on + in the content window + past cool-off + within the data
 * cap) and then drives the existing manual download path
 * ({@link CollectionUpdateService.applyUpdate} → {@link RunDownloadJob}).
 *
 * It never installs synchronously — it dispatches resumable download jobs and
 * lets the existing job-completion path advance the installed version and
 * rebuild the Kiwix library.
 */
export class ContentAutoUpdateService {
  constructor(
    private downloadService: DownloadService,
    private catalog: KiwixCatalogService = new KiwixCatalogService(),
    private collectionUpdateService: CollectionUpdateService = new CollectionUpdateService()
  ) {}

  /** Read the master switch plus the content-specific window/cool-off/cap. */
  async getConfig(): Promise<ContentAutoUpdateConfig> {
    const [enabled, windowStart, windowEnd, cooloffHours, maxBytes] = await Promise.all([
      KVStore.getValue('contentAutoUpdate.enabled'),
      KVStore.getValue('contentAutoUpdate.windowStart'),
      KVStore.getValue('contentAutoUpdate.windowEnd'),
      KVStore.getValue('contentAutoUpdate.cooloffHours'),
      KVStore.getValue('contentAutoUpdate.maxBytesPerWindow'),
    ])

    const parsedCooloff = Number(cooloffHours)
    const parsedCap = Number(maxBytes)
    return {
      enabled: enabled ?? false,
      windowStart: windowStart || DEFAULT_WINDOW_START,
      windowEnd: windowEnd || DEFAULT_WINDOW_END,
      // `Number(null) === 0`, so an unset value must fall through to the default
      // rather than silently resolving to a zero cool-off. An explicit 0 is honored.
      cooloffHours:
        cooloffHours !== null && Number.isFinite(parsedCooloff) && parsedCooloff >= 0
          ? parsedCooloff
          : DEFAULT_COOLOFF_HOURS,
      maxBytesPerWindow:
        maxBytes !== null && Number.isFinite(parsedCap) && parsedCap >= 0 ? parsedCap : 0,
    }
  }

  /**
   * Pure per-resource eligibility verdict. A resource is eligible when it has a
   * detected newer version, is not self-disabled, and is past its cool-off
   * (measured from first-detected). Version comparison is a lexicographic
   * compare of the YYYY-MM stamps, which sorts chronologically.
   */
  resourceEligibility(
    resource: InstalledResource,
    cooloffHours: number,
    now: DateTime
  ): ContentEligibility {
    if (!resource.available_update_version) {
      return { eligible: false, reason: 'Up to date', cooloffRemainingHours: null }
    }
    if (resource.auto_update_disabled_reason) {
      return {
        eligible: false,
        reason: 'Auto-update disabled after repeated failures',
        cooloffRemainingHours: null,
      }
    }
    if (!(resource.available_update_version > resource.version)) {
      return { eligible: false, reason: 'Up to date', cooloffRemainingHours: null }
    }
    if (!resource.available_update_first_seen_at) {
      return { eligible: false, reason: 'Cool-off pending', cooloffRemainingHours: cooloffHours }
    }

    const ageHours = now.diff(resource.available_update_first_seen_at, 'hours').hours
    const remaining = cooloffHours - ageHours
    if (remaining > 0) {
      const rounded = Math.ceil(remaining)
      return {
        eligible: false,
        reason: `In cool-off (${rounded}h remaining)`,
        cooloffRemainingHours: rounded,
      }
    }

    return {
      eligible: true,
      reason: `Eligible → ${resource.available_update_version}`,
      cooloffRemainingHours: 0,
    }
  }

  /**
   * Pure cap-bounded greedy selection. Oldest-installed first (stale content is
   * prioritized), tie-broken smallest-first for predictability.
   *
   * - size unknown (0) → deferred (can't budget safely)
   * - size > the WHOLE cap → skippedOversize (never auto-started; manual only)
   * - size ≤ remaining budget → selected
   * - otherwise → deferred (fits the cap, not this window)
   */
  selectUnderCap(
    candidates: ContentCandidate[],
    capBytes: number,
    usedBytes: number
  ): ContentSelection {
    const cap = capBytes > 0 ? capBytes : Number.POSITIVE_INFINITY
    let remaining = Math.max(0, cap - usedBytes)

    const selected: ContentCandidate[] = []
    const skippedOversize: ContentCandidate[] = []
    const deferred: ContentCandidate[] = []

    const ordered = [...candidates].sort((a, b) => {
      const at = a.installed_at?.toMillis?.() ?? 0
      const bt = b.installed_at?.toMillis?.() ?? 0
      if (at !== bt) return at - bt
      return a.size_bytes - b.size_bytes
    })

    for (const candidate of ordered) {
      if (candidate.size_bytes <= 0) {
        deferred.push(candidate)
      } else if (candidate.size_bytes > cap) {
        skippedOversize.push(candidate)
      } else if (candidate.size_bytes <= remaining) {
        selected.push(candidate)
        remaining -= candidate.size_bytes
      } else {
        deferred.push(candidate)
      }
    }

    return { selected, skippedOversize, deferred }
  }

  /**
   * Run-wide pre-flight: never auto-update content while ANY download is already
   * running. Because content downloads are multi-GB and resumable, an in-flight
   * download from a prior window naturally blocks new starts here — exactly the
   * "let in-flight finish, don't start new" behavior we want. Transient → `skip`.
   */
  async runGlobalPreflight(): Promise<PreflightResult> {
    const blockers: Blocker[] = []
    try {
      const downloads = await this.downloadService.listDownloadJobs()
      const active = downloads.filter(
        (d) => !!d.status && ['waiting', 'active', 'delayed'].includes(d.status)
      )
      if (active.length > 0) {
        blockers.push({ reason: `${active.length} download(s) in progress`, severity: 'skip' })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn(`[ContentAutoUpdateService] Could not check active downloads: ${message}`)
    }
    return { ok: blockers.length === 0, blockers }
  }

  /**
   * Entry point invoked by ContentAutoUpdateJob. Gates on the master switch +
   * window, runs the local catalog check, then downloads as many eligible
   * resources as fit under the per-window data cap.
   */
  async attempt(): Promise<{ started: number; reason: string }> {
    const config = await this.getConfig()
    const now = DateTime.now()

    if (!config.enabled) {
      return { started: 0, reason: 'Content auto-update is disabled' }
    }
    if (!isWithinWindow(config.windowStart, config.windowEnd, now)) {
      const reason = `Outside update window (${config.windowStart}-${config.windowEnd})`
      await this.recordRun(reason)
      return { started: 0, reason }
    }

    try {
      // Reset the per-window budget once per window instance (the cron fires
      // hourly but a window can span several hours).
      await this.maybeResetWindowBudget(config, now)

      // Local catalog check + persist available-update state for every resource.
      // ZIM/map catalog path only — `dataset` resources are excluded (they get
      // their own freshness path; no-op today as none are written in this slice).
      const installed = await InstalledResource.query().whereNot('resource_type', 'dataset')
      const latestByKey = await this.catalog.getLatestForResources(
        // `dataset` rows are filtered out above, so the type narrows to ZIM/map.
        installed.map((r) => ({
          resource_id: r.resource_id,
          resource_type: r.resource_type as 'zim' | 'map',
        }))
      )
      for (const resource of installed) {
        const latest = latestByKey.get(`${resource.resource_type}:${resource.resource_id}`) ?? null
        await reconcileResourceUpdateState(resource, latest, now)
      }

      const eligible = installed.filter(
        (r) => this.resourceEligibility(r, config.cooloffHours, now).eligible
      )
      if (eligible.length === 0) {
        await this.recordFeatureSuccess()
        const reason = 'No eligible content updates'
        await this.recordRun(reason)
        return { started: 0, reason }
      }

      const global = await this.runGlobalPreflight()
      if (!global.ok) {
        await this.recordFeatureSuccess()
        const reason = `Pre-flight blocked: ${global.blockers.map((b) => b.reason).join('; ')}`
        await this.recordRun(reason)
        return { started: 0, reason }
      }

      const candidates: ContentCandidate[] = eligible.map((r) => {
        const latest = latestByKey.get(`${r.resource_type}:${r.resource_id}`) as CatalogResult
        return {
          resource: r,
          version: latest.version,
          download_url: latest.download_url,
          size_bytes: r.available_update_size_bytes ?? latest.size_bytes ?? 0,
          installed_at: r.installed_at,
        }
      })

      const usedBytes = await this.getWindowBytesUsed()
      const { selected, skippedOversize, deferred } = this.selectUnderCap(
        candidates,
        config.maxBytesPerWindow,
        usedBytes
      )

      let started = 0
      let failed = 0
      let initiatedBytes = 0
      for (const candidate of selected) {
        const result = await this.collectionUpdateService.applyUpdate(
          {
            resource_id: candidate.resource.resource_id,
            // `dataset` rows are filtered out of `installed` above, so ZIM/map.
            resource_type: candidate.resource.resource_type as 'zim' | 'map',
            installed_version: candidate.resource.version,
            latest_version: candidate.version,
            download_url: candidate.download_url,
            size_bytes: candidate.size_bytes || undefined,
          },
          { auto: true }
        )

        if (result.success) {
          // Success is NOT recorded here: applyUpdate only enqueues a resumable
          // download. The per-resource backoff is cleared once the download
          // actually completes (RunDownloadJob.onComplete) and incremented when it
          // fails terminally (the worker `failed` handler). Recording success on
          // dispatch would reset the counter every window and defeat self-disable.
          initiatedBytes += candidate.size_bytes
          started++
          logger.info(
            `[ContentAutoUpdateService] Started ${candidate.resource.resource_id} → ${candidate.version}`
          )
        } else {
          // A failure to even enqueue is a genuine auto-update failure; no job runs,
          // so no terminal `failed` event will follow — count it here.
          await recordResourceUpdateFailure(candidate.resource, result.error ?? 'dispatch failed')
          failed++
        }
      }

      if (initiatedBytes > 0) {
        await this.addWindowBytesUsed(initiatedBytes)
      }

      const parts = [`${started} started`]
      if (failed) parts.push(`${failed} failed`)
      if (skippedOversize.length) parts.push(`${skippedOversize.length} skipped (exceeds cap)`)
      if (deferred.length) parts.push(`${deferred.length} deferred (over budget)`)
      const reason = parts.join(', ')

      await this.recordFeatureSuccess()
      await this.recordRun(reason)
      logger.info(`[ContentAutoUpdateService] Run complete: ${reason}`)
      return { started, reason }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.recordFeatureFailure(message)
      await this.recordRun(`Failed: ${message}`)
      logger.error(`[ContentAutoUpdateService] Run failed: ${message}`)
      return { started: 0, reason: `Failed: ${message}` }
    }
  }

  /**
   * Evaluate what the next run *would* do, without hitting the network,
   * persisting state, or dispatching anything. Operates on the available-update
   * state already persisted by the last check (manual or auto), so run a "Check
   * for Content Updates" first if you want fresh catalog data. Used by the
   * `content-auto-update:dry-run` command.
   */
  async dryRun(
    overrides: {
      now?: DateTime
      forceEnabled?: boolean
      cooloffHours?: number
      windowStart?: string
      windowEnd?: string
      maxBytesPerWindow?: number
      windowBytesUsed?: number
    } = {}
  ): Promise<{
    enabled: boolean
    withinWindow: boolean
    config: ContentAutoUpdateConfig
    eligibleCount: number
    selection: ContentSelection
  }> {
    const base = await this.getConfig()
    const config: ContentAutoUpdateConfig = {
      enabled: overrides.forceEnabled ? true : base.enabled,
      windowStart: overrides.windowStart ?? base.windowStart,
      windowEnd: overrides.windowEnd ?? base.windowEnd,
      cooloffHours: overrides.cooloffHours ?? base.cooloffHours,
      maxBytesPerWindow: overrides.maxBytesPerWindow ?? base.maxBytesPerWindow,
    }
    const now = overrides.now ?? DateTime.now()
    const withinWindow = isWithinWindow(config.windowStart, config.windowEnd, now)

    const pending = await InstalledResource.query()
      .whereNotNull('available_update_version')
      .whereNot('resource_type', 'dataset')
    const eligible = pending.filter(
      (r) => this.resourceEligibility(r, config.cooloffHours, now).eligible
    )
    const candidates: ContentCandidate[] = eligible.map((r) => ({
      resource: r,
      version: r.available_update_version!,
      download_url: '(dry-run)',
      size_bytes: r.available_update_size_bytes ?? 0,
      installed_at: r.installed_at,
    }))

    const usedBytes = overrides.windowBytesUsed ?? (await this.getWindowBytesUsed())
    const selection = this.selectUnderCap(candidates, config.maxBytesPerWindow, usedBytes)

    return {
      enabled: config.enabled,
      withinWindow,
      config,
      eligibleCount: eligible.length,
      selection,
    }
  }

  // ── Per-window budget ─────────────────────────────────────────────────────────

  /** Most-recent window-open boundary as an absolute timestamp (handles wrap). */
  windowStartBoundary(windowStart: string, now: DateTime): DateTime {
    const minutes = parseWindowMinutes(windowStart) ?? 0
    const todayStart = now.startOf('day').plus({ minutes })
    return now >= todayStart ? todayStart : todayStart.minus({ days: 1 })
  }

  /** Reset the window budget exactly once per entry into the window. */
  private async maybeResetWindowBudget(
    config: ContentAutoUpdateConfig,
    now: DateTime
  ): Promise<void> {
    const boundary = this.windowStartBoundary(config.windowStart, now)
    const resetAtRaw = await KVStore.getValue('contentAutoUpdate.windowResetAt')
    const resetAt = resetAtRaw ? DateTime.fromISO(resetAtRaw) : null
    if (!resetAt || !resetAt.isValid || resetAt < boundary) {
      await KVStore.setValue('contentAutoUpdate.windowBytesUsed', '0')
      await KVStore.setValue('contentAutoUpdate.windowResetAt', now.toISO()!)
    }
  }

  private async getWindowBytesUsed(): Promise<number> {
    const raw = await KVStore.getValue('contentAutoUpdate.windowBytesUsed')
    const num = Number(raw)
    return Number.isFinite(num) && num > 0 ? num : 0
  }

  private async addWindowBytesUsed(bytes: number): Promise<void> {
    const used = await this.getWindowBytesUsed()
    await KVStore.setValue('contentAutoUpdate.windowBytesUsed', String(used + bytes))
  }

  // ── Backoff + run recording ───────────────────────────────────────────────────
  // Per-resource backoff lives in ../utils/content_auto_update_backoff.ts so the
  // job-completion path and the worker `failed` handler can share it without an
  // import cycle. The feature-level backoff below stays here.

  /** Clear the feature-level backoff after a clean run. */
  private async recordFeatureSuccess(): Promise<void> {
    await KVStore.setValue('contentAutoUpdate.consecutiveFailures', '0')
    await KVStore.clearValue('contentAutoUpdate.lastError')
  }

  /** Record a whole-feature failure and self-disable the feature at the threshold. */
  private async recordFeatureFailure(reason: string): Promise<void> {
    const raw = await KVStore.getValue('contentAutoUpdate.consecutiveFailures')
    const failures = (Number(raw) || 0) + 1
    await KVStore.setValue('contentAutoUpdate.consecutiveFailures', String(failures))
    await KVStore.setValue('contentAutoUpdate.lastError', reason)
    if (failures >= MAX_FEATURE_FAILURES) {
      await KVStore.setValue('contentAutoUpdate.enabled', false)
      await KVStore.setValue(
        'contentAutoUpdate.autoDisabledReason',
        `Content auto-update disabled after ${failures} consecutive failures. Last error: ${reason}`
      )
      logger.error(
        `[ContentAutoUpdateService] Feature auto-disabled after ${failures} consecutive failures`
      )
    }
  }

  private async recordRun(reason: string): Promise<void> {
    await KVStore.setValue('contentAutoUpdate.lastAttemptAt', DateTime.now().toISO()!)
    await KVStore.setValue('contentAutoUpdate.lastResult', reason)
  }

  // ── Status snapshot ───────────────────────────────────────────────────────────

  /** Full state snapshot for the settings UI (resources with pending updates). */
  async getStatus(): Promise<ContentAutoUpdateStatus> {
    const config = await this.getConfig()
    const now = DateTime.now()

    const pending = await InstalledResource.query()
      .whereNotNull('available_update_version')
      .whereNot('resource_type', 'dataset')
    const resources: ContentAutoUpdateResourceStatus[] = pending.map((resource) => {
      const verdict = this.resourceEligibility(resource, config.cooloffHours, now)
      const size = resource.available_update_size_bytes ?? null
      const exceedsCap =
        config.maxBytesPerWindow > 0 && size !== null && size > config.maxBytesPerWindow
      return {
        resource_id: resource.resource_id,
        // `dataset` rows are filtered out of `pending` above, so ZIM/map.
        resource_type: resource.resource_type as 'zim' | 'map',
        current_version: resource.version,
        available_update_version: resource.available_update_version,
        size_bytes: size,
        eligible: verdict.eligible && !exceedsCap,
        reason: exceedsCap ? 'Exceeds data cap — update manually' : verdict.reason,
        cooloff_remaining_hours: verdict.cooloffRemainingHours,
        exceeds_cap: exceedsCap,
        consecutive_failures: resource.auto_update_consecutive_failures || 0,
        auto_disabled_reason: resource.auto_update_disabled_reason,
      }
    })

    const [lastAttemptAt, lastResult, lastError, autoDisabledReason, windowBytesUsed] =
      await Promise.all([
        KVStore.getValue('contentAutoUpdate.lastAttemptAt'),
        KVStore.getValue('contentAutoUpdate.lastResult'),
        KVStore.getValue('contentAutoUpdate.lastError'),
        KVStore.getValue('contentAutoUpdate.autoDisabledReason'),
        this.getWindowBytesUsed(),
      ])

    return {
      ...config,
      withinWindow: isWithinWindow(config.windowStart, config.windowEnd, now),
      windowBytesUsed,
      lastAttemptAt: lastAttemptAt || null,
      lastResult: lastResult || null,
      lastError: lastError || null,
      autoDisabledReason: autoDisabledReason || null,
      resources,
    }
  }
}
