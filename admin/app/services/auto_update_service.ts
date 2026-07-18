import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import axios from 'axios'
import { DateTime } from 'luxon'
import KVStore from '#models/kv_store'
import Service from '#models/service'
import { DockerService } from '#services/docker_service'
import { DownloadService } from '#services/download_service'
import { SystemService } from '#services/system_service'
import { SystemUpdateService } from '#services/system_update_service'
import { ContainerRegistryService } from '#services/container_registry_service'
import { isNewerVersion, parseMajorVersion } from '../utils/version.js'
import { isWithinWindow as isWithinWindowUtil } from '../utils/update_window.js'
import {
  checkImageDiskSpace,
  type Blocker,
  type PreflightResult,
} from '../utils/image_disk_preflight.js'

/** Docker image repository for the NOMAD admin/core image (tag applied per-release). */
const NOMAD_IMAGE_REPO = 'ghcr.io/crosstalk-solutions/project-nomad'
const RELEASES_URL = 'https://api.github.com/repos/Crosstalk-Solutions/project-nomad/releases'

/** Defaults for user-configurable settings (server-local time window + cool-off). */
const DEFAULT_WINDOW_START = '02:00'
const DEFAULT_WINDOW_END = '05:00'
const DEFAULT_COOLOFF_HOURS = 72

/** Genuine failures before auto-update disables itself to avoid an update loop. */
const MAX_CONSECUTIVE_FAILURES = 3

/**
 * Only tags matching strict semver are eligible. Defense-in-depth: the selected
 * tag becomes `target_tag`, which the sidecar interpolates into a host-side `sed`
 * (install/sidecar-updater/update-watcher.sh) — so a malformed tag must never be
 * able to reach it, even though releases come from a trusted repo.
 */
const SEMVER_TAG = /^\d+\.\d+\.\d+$/

/** Cache the GitHub releases feed in-process to avoid hammering the API. */
const RELEASES_CACHE_TTL_MS = 15 * 60 * 1000
/** Briefly remember a failed fetch so repeated calls don't each block on the timeout. */
const RELEASES_FAILURE_TTL_MS = 60 * 1000

export interface AutoUpdateConfig {
  enabled: boolean
  windowStart: string
  windowEnd: string
  cooloffHours: number
}

export interface EligibleTarget {
  version: string
  tag: string
  publishedAt: string
}

// Pre-flight types/primitives are shared with AppAutoUpdateService; re-exported
// here for back-compat with existing imports of this module.
export type { Blocker, BlockerSeverity, PreflightResult } from '../utils/image_disk_preflight.js'

/** Minimal shape of a GitHub release entry we depend on. */
export interface GithubRelease {
  tag_name?: string
  published_at?: string
  draft?: boolean
  prerelease?: boolean
}

/**
 * Inputs that can be injected to exercise the decision pipeline deterministically
 * (used by the dry-run command/tests). All are optional; when omitted the real
 * settings/clock/GitHub feed/pre-flight are used, exactly as production runs.
 */
export interface EvaluateOverrides {
  currentVersion?: string
  releases?: GithubRelease[]
  now?: DateTime
  forceEnabled?: boolean
  windowStart?: string
  windowEnd?: string
  cooloffHours?: number
  /** Treat pre-flight as passing without touching Docker/disk/queues. */
  skipPreflight?: boolean
  /** Substitute a canned pre-flight result. */
  fakePreflight?: PreflightResult
}

export type DecisionOutcome =
  | 'disabled'
  | 'outside-window'
  | 'eligibility-error'
  | 'no-eligible'
  | 'blocked'
  | 'ready'

/** Side-effect-free verdict of the decision pipeline. */
export interface AutoUpdateDecision {
  enabled: boolean
  currentVersion: string
  config: AutoUpdateConfig
  withinWindow: boolean
  eligibleTarget: EligibleTarget | null
  preflight: PreflightResult | null
  outcome: DecisionOutcome
  reason: string
}

export interface AutoUpdateStatus extends AutoUpdateConfig {
  currentVersion: string
  withinWindow: boolean
  eligibleTarget: EligibleTarget | null
  lastAttemptAt: string | null
  lastResult: string | null
  lastError: string | null
  consecutiveFailures: number
  autoDisabledReason: string | null
}

/**
 * Decision + safety layer for automatic updates of the NOMAD application itself.
 *
 * It does NOT recreate containers — that remains the sidecar's job. This service
 * decides *whether* an update should run right now (opt-in, in-window, an eligible
 * minor/patch release exists past its cool-off, pre-flight checks pass) and, if so,
 * drives the existing {@link SystemUpdateService.requestUpdate} with an explicit,
 * eligibility-vetted image tag.
 *
 * The window/pre-flight helpers are intentionally generic so a future PR can reuse
 * them to auto-update installed apps (driving DockerService.updateContainer instead).
 */
@inject()
export class AutoUpdateService {
  constructor(
    private dockerService: DockerService,
    private downloadService: DownloadService,
    private systemService: SystemService,
    private systemUpdateService: SystemUpdateService,
    private containerRegistryService: ContainerRegistryService
  ) {}

  /** In-process cache of the last successful releases fetch (per-process). */
  private static releasesCache: { releases: GithubRelease[]; at: number } | null = null
  /** Timestamp of the last failed fetch, for short-lived negative caching. */
  private static releasesFailureAt = 0

  /** Read user-configurable settings, applying defaults. */
  async getConfig(): Promise<AutoUpdateConfig> {
    const [enabled, windowStart, windowEnd, cooloffHours] = await Promise.all([
      KVStore.getValue('autoUpdate.enabled'),
      KVStore.getValue('autoUpdate.windowStart'),
      KVStore.getValue('autoUpdate.windowEnd'),
      KVStore.getValue('autoUpdate.cooloffHours'),
    ])

    const parsedCooloff = Number(cooloffHours)
    return {
      enabled: enabled ?? false,
      windowStart: windowStart || DEFAULT_WINDOW_START,
      windowEnd: windowEnd || DEFAULT_WINDOW_END,
      // `Number(null) === 0`, so an *unset* value must fall through to the default
      // rather than silently resolving to a zero cool-off. An explicit 0 is honored.
      cooloffHours:
        cooloffHours != null && Number.isFinite(parsedCooloff) && parsedCooloff >= 0
          ? parsedCooloff
          : DEFAULT_COOLOFF_HOURS,
    }
  }

  /**
   * Determine whether `now` falls inside the configured update window. The window
   * is interpreted in the container's local time (set via the TZ env var). Windows
   * that wrap past midnight (start > end, e.g. 22:00-02:00) are handled.
   */
  isWithinWindow(config: AutoUpdateConfig, now: DateTime = DateTime.now()): boolean {
    return isWithinWindowUtil(config.windowStart, config.windowEnd, now)
  }

  /**
   * Find the newest release that is safe to auto-apply: same major version as the
   * running build (major bumps are deliberately left for manual update), strictly
   * newer than current, and published at least `cooloffHours` ago. Prereleases and
   * drafts are ignored — auto-update never rides early access.
   *
   * Returns null when nothing qualifies (e.g. only a major bump is newer, or the
   * newest eligible release is still inside its cool-off window).
   */
  async getEligibleTarget(config: AutoUpdateConfig): Promise<EligibleTarget | null> {
    const releases = await this.fetchReleases()
    return this.selectEligibleTarget(
      releases,
      SystemService.getAppVersion(),
      config.cooloffHours,
      DateTime.now()
    )
  }

  /**
   * Fetch the published GitHub releases for the NOMAD repo, cached in-process.
   * A successful result is reused for {@link RELEASES_CACHE_TTL_MS} so repeated
   * status-page loads don't each hit (and risk rate-limiting) the unauthenticated
   * GitHub API. A recent failure is negatively cached for {@link RELEASES_FAILURE_TTL_MS}
   * so back-to-back calls while offline don't each block on the request timeout.
   */
  async fetchReleases(): Promise<GithubRelease[]> {
    const now = Date.now()
    const cached = AutoUpdateService.releasesCache
    if (cached && now - cached.at < RELEASES_CACHE_TTL_MS) {
      return cached.releases
    }
    if (now - AutoUpdateService.releasesFailureAt < RELEASES_FAILURE_TTL_MS) {
      throw new Error('GitHub releases fetch recently failed; backing off')
    }

    try {
      const response = await axios.get(RELEASES_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        timeout: 5000,
      })
      if (!Array.isArray(response.data)) {
        throw new Error('Unexpected response from GitHub releases API')
      }
      AutoUpdateService.releasesCache = { releases: response.data, at: now }
      return response.data
    } catch (error) {
      AutoUpdateService.releasesFailureAt = now
      throw error
    }
  }

  /**
   * Pure selection of the newest auto-applicable release from a release list.
   * Extracted so the dry-run command and tests can drive it with fixtures.
   * Same major as `currentVersion`, strictly newer, published on/before
   * `now - cooloffHours`, prereleases/drafts excluded. Returns null for dev
   * builds or when nothing qualifies.
   */
  selectEligibleTarget(
    releases: GithubRelease[],
    currentVersion: string,
    cooloffHours: number,
    now: DateTime
  ): EligibleTarget | null {
    if (currentVersion === 'dev' || currentVersion === '0.0.0') {
      return null
    }
    const currentMajor = parseMajorVersion(currentVersion)
    const cutoff = now.minus({ hours: cooloffHours })

    const candidates = releases
      .filter((r) => r && !r.draft && !r.prerelease && r.tag_name && r.published_at)
      .map((r) => ({
        version: String(r.tag_name).replace(/^v/, '').trim(),
        publishedAt: String(r.published_at),
      }))
      .filter((r) => SEMVER_TAG.test(r.version))
      .filter((r) => parseMajorVersion(r.version) === currentMajor)
      .filter((r) => isNewerVersion(r.version, currentVersion))
      .filter((r) => DateTime.fromISO(r.publishedAt) <= cutoff)
      .sort((a, b) => (isNewerVersion(a.version, b.version) ? -1 : 1))

    const best = candidates[0]
    if (!best) return null

    return {
      version: best.version,
      tag: `v${best.version}`,
      publishedAt: best.publishedAt,
    }
  }

  /**
   * Pre-flight checks that gate an auto-update. `skip` blockers are transient
   * (retry next window, no penalty); `failure` blockers count toward the backoff
   * that eventually auto-disables auto-update.
   */
  async runPreflight(targetTag: string): Promise<PreflightResult> {
    const blockers: Blocker[] = []

    // 1. Sidecar must be present to perform the update.
    if (!this.systemUpdateService.isSidecarAvailable()) {
      blockers.push({ reason: 'Update sidecar is not available', severity: 'failure' })
    }

    // 2. No system update already running.
    const updateStatus = this.systemUpdateService.getUpdateStatus()
    if (updateStatus && !['idle', 'complete', 'error'].includes(updateStatus.stage)) {
      blockers.push({
        reason: `A system update is already in progress (stage: ${updateStatus.stage})`,
        severity: 'skip',
      })
    }

    // 3. No content/model downloads in progress.
    try {
      const downloads = await this.downloadService.listDownloadJobs()
      const active = downloads.filter(
        (d) => !!d.status && ['waiting', 'active', 'delayed'].includes(d.status)
      )
      if (active.length > 0) {
        blockers.push({
          reason: `${active.length} download(s) in progress`,
          severity: 'skip',
        })
      }
    } catch (error) {
      logger.warn(`[AutoUpdateService] Could not check active downloads: ${error.message}`)
    }

    // 4. No app (container) install/update in progress.
    try {
      const installing = await Service.query().whereNot('installation_status', 'idle')
      if (installing.length > 0) {
        blockers.push({
          reason: `${installing.length} app install/update(s) in progress`,
          severity: 'skip',
        })
      }
    } catch (error) {
      logger.warn(`[AutoUpdateService] Could not check app installations: ${error.message}`)
    }

    // 5. Sufficient host storage for the new image.
    const diskBlocker = await this.checkDiskSpace(targetTag)
    if (diskBlocker) blockers.push(diskBlocker)

    return { ok: blockers.length === 0, blockers }
  }

  /** Returns a disk blocker if free space is insufficient, otherwise null. */
  private async checkDiskSpace(targetTag: string): Promise<Blocker | null> {
    const hostArch = await this.getHostArch()
    return checkImageDiskSpace({
      image: `${NOMAD_IMAGE_REPO}:${targetTag}`,
      hostArch,
      containerRegistryService: this.containerRegistryService,
      systemService: this.systemService,
    })
  }

  /** Map the Docker daemon's architecture string to OCI naming (amd64/arm64/...). */
  private async getHostArch(): Promise<string> {
    try {
      const info = await this.dockerService.docker.info()
      const arch = info.Architecture || ''
      const archMap: Record<string, string> = {
        x86_64: 'amd64',
        aarch64: 'arm64',
        armv7l: 'arm',
        amd64: 'amd64',
        arm64: 'arm64',
      }
      return archMap[arch] || arch.toLowerCase()
    } catch {
      return 'amd64'
    }
  }

  /**
   * Side-effect-free core of the decision pipeline. Resolves the effective config
   * (settings, overridable), checks the window, finds an eligible target, and runs
   * pre-flight — returning a verdict WITHOUT requesting an update or mutating any
   * persisted state. Both {@link attempt} (production) and {@link dryRun} (testing)
   * are built on this so a dry run faithfully reflects what a real run would do.
   */
  async evaluate(overrides: EvaluateOverrides = {}): Promise<AutoUpdateDecision> {
    const baseConfig = await this.getConfig()
    const config: AutoUpdateConfig = {
      enabled: overrides.forceEnabled ?? baseConfig.enabled,
      windowStart: overrides.windowStart ?? baseConfig.windowStart,
      windowEnd: overrides.windowEnd ?? baseConfig.windowEnd,
      cooloffHours: overrides.cooloffHours ?? baseConfig.cooloffHours,
    }
    const now = overrides.now ?? DateTime.now()
    const currentVersion = overrides.currentVersion ?? SystemService.getAppVersion()

    const base = {
      enabled: config.enabled,
      currentVersion,
      config,
      withinWindow: false,
      eligibleTarget: null as EligibleTarget | null,
      preflight: null as PreflightResult | null,
    }

    if (!config.enabled) {
      return { ...base, outcome: 'disabled', reason: 'Auto-update is disabled' }
    }

    const withinWindow = this.isWithinWindow(config, now)
    if (!withinWindow) {
      return {
        ...base,
        outcome: 'outside-window',
        reason: `Outside update window (${config.windowStart}-${config.windowEnd})`,
      }
    }

    let eligibleTarget: EligibleTarget | null
    try {
      const releases = overrides.releases ?? (await this.fetchReleases())
      eligibleTarget = this.selectEligibleTarget(releases, currentVersion, config.cooloffHours, now)
    } catch (error) {
      return {
        ...base,
        withinWindow,
        outcome: 'eligibility-error',
        reason: `Failed to determine eligible version: ${error.message}`,
      }
    }

    if (!eligibleTarget) {
      return {
        ...base,
        withinWindow,
        outcome: 'no-eligible',
        reason: 'No eligible minor/patch update available (or still in cool-off)',
      }
    }

    const preflight = overrides.fakePreflight
      ? overrides.fakePreflight
      : overrides.skipPreflight
        ? { ok: true, blockers: [] }
        : await this.runPreflight(eligibleTarget.tag)

    if (!preflight.ok) {
      const summary = preflight.blockers.map((b) => b.reason).join('; ')
      return {
        ...base,
        withinWindow,
        eligibleTarget,
        preflight,
        outcome: 'blocked',
        reason: `Pre-flight blocked: ${summary}`,
      }
    }

    return {
      ...base,
      withinWindow,
      eligibleTarget,
      preflight,
      outcome: 'ready',
      reason: `Ready to update to ${eligibleTarget.tag}`,
    }
  }

  /**
   * Run the full decision pipeline WITHOUT requesting an update or recording any
   * state. Accepts the same injectable overrides as {@link evaluate}, so callers can
   * simulate any scenario (a given current version, a canned release list, a fixed
   * clock, a forced window) and see exactly what a real run would decide.
   */
  async dryRun(overrides: EvaluateOverrides = {}): Promise<AutoUpdateDecision> {
    return this.evaluate(overrides)
  }

  /**
   * The entry point invoked by AutoUpdateJob. Evaluates the decision pipeline and,
   * when everything passes, requests the update with the vetted tag — recording the
   * outcome to the KVStore (for the UI) and applying failure backoff.
   */
  async attempt(): Promise<{ updated: boolean; reason: string }> {
    const decision = await this.evaluate()

    switch (decision.outcome) {
      case 'disabled':
        return { updated: false, reason: decision.reason }

      case 'outside-window':
      case 'no-eligible':
      // A failed release lookup is transient (offline-first appliances are
      // routinely without connectivity) — treat as a skip so it never trips the
      // backoff that auto-disables the feature. Only real update-request failures
      // (the `ready` case below) count toward MAX_CONSECUTIVE_FAILURES.
      case 'eligibility-error':
        await this.recordSkip(decision.reason)
        return { updated: false, reason: decision.reason }

      case 'blocked': {
        const hasFailure = decision.preflight!.blockers.some((b) => b.severity === 'failure')
        if (hasFailure) {
          await this.recordFailure(decision.reason)
        } else {
          await this.recordSkip(decision.reason)
        }
        return { updated: false, reason: decision.reason }
      }

      case 'ready': {
        const target = decision.eligibleTarget!
        const result = await this.systemUpdateService.requestUpdate({
          targetTag: target.tag,
          requester: 'auto-update',
        })

        if (result.success) {
          await this.recordSuccess(target)
          logger.info(`[AutoUpdateService] Auto-update requested: ${target.tag}`)
          return { updated: true, reason: `Update requested: ${target.tag}` }
        }

        await this.recordFailure(`Update request failed: ${result.message}`)
        return { updated: false, reason: result.message }
      }
    }
  }

  // --- Outcome recording -----------------------------------------------------

  private async recordSuccess(target: EligibleTarget): Promise<void> {
    await KVStore.setValue('autoUpdate.lastAttemptAt', DateTime.now().toISO()!)
    await KVStore.setValue('autoUpdate.lastResult', `Update requested: ${target.tag}`)
    await KVStore.clearValue('autoUpdate.lastError')
    await KVStore.setValue('autoUpdate.consecutiveFailures', '0')
  }

  private async recordSkip(reason: string): Promise<void> {
    await KVStore.setValue('autoUpdate.lastAttemptAt', DateTime.now().toISO()!)
    await KVStore.setValue('autoUpdate.lastResult', reason)
    logger.info(`[AutoUpdateService] Skipped: ${reason}`)
  }

  private async recordFailure(reason: string): Promise<void> {
    await KVStore.setValue('autoUpdate.lastAttemptAt', DateTime.now().toISO()!)
    await KVStore.setValue('autoUpdate.lastResult', reason)
    await KVStore.setValue('autoUpdate.lastError', reason)

    const prior = Number(await KVStore.getValue('autoUpdate.consecutiveFailures')) || 0
    const failures = prior + 1
    await KVStore.setValue('autoUpdate.consecutiveFailures', String(failures))
    logger.error(`[AutoUpdateService] Failure ${failures}/${MAX_CONSECUTIVE_FAILURES}: ${reason}`)

    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      await KVStore.setValue('autoUpdate.enabled', false)
      await KVStore.setValue(
        'autoUpdate.autoDisabledReason',
        `Auto-update disabled after ${failures} consecutive failures. Last error: ${reason}`
      )
      logger.error(
        `[AutoUpdateService] Auto-update auto-disabled after ${failures} consecutive failures`
      )
    }
  }

  /** Full state snapshot for the settings UI. */
  async getStatus(): Promise<AutoUpdateStatus> {
    const config = await this.getConfig()
    const currentVersion = SystemService.getAppVersion()

    let eligibleTarget: EligibleTarget | null = null
    try {
      eligibleTarget = await this.getEligibleTarget(config)
    } catch (error) {
      logger.warn(`[AutoUpdateService] getStatus eligibility lookup failed: ${error.message}`)
    }

    const [lastAttemptAt, lastResult, lastError, consecutiveFailures, autoDisabledReason] =
      await Promise.all([
        KVStore.getValue('autoUpdate.lastAttemptAt'),
        KVStore.getValue('autoUpdate.lastResult'),
        KVStore.getValue('autoUpdate.lastError'),
        KVStore.getValue('autoUpdate.consecutiveFailures'),
        KVStore.getValue('autoUpdate.autoDisabledReason'),
      ])

    return {
      ...config,
      currentVersion,
      withinWindow: this.isWithinWindow(config),
      eligibleTarget,
      lastAttemptAt: lastAttemptAt || null,
      lastResult: lastResult || null,
      lastError: lastError || null,
      consecutiveFailures: Number(consecutiveFailures) || 0,
      autoDisabledReason: autoDisabledReason || null,
    }
  }
}
