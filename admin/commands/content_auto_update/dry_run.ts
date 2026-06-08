import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { isWithinWindow } from '../../app/utils/update_window.js'

/**
 * Exercise the content auto-update decision pipeline WITHOUT ever dispatching a
 * real download.
 *
 *   # Prove the core selection/eligibility/window logic deterministically
 *   # (no network/DB):
 *   node ace content-auto-update:dry-run --scenarios
 *
 *   # Evaluate what the next run would do against the currently-persisted
 *   # available-update state (run a "Check for Content Updates" first to refresh
 *   # it), forcing the feature on and overriding the cap:
 *   node ace content-auto-update:dry-run --force-enabled --cap=20 --window-start=00:00 --window-end=23:59
 */
export default class ContentAutoUpdateDryRun extends BaseCommand {
  static commandName = 'content-auto-update:dry-run'
  static description = 'Dry-run the content auto-update decision pipeline (never dispatches a download)'

  @flags.boolean({ description: 'Run the built-in deterministic scenario suite and exit' })
  declare scenarios: boolean

  @flags.boolean({ description: 'Ignore the persisted enabled setting and treat as enabled' })
  declare forceEnabled: boolean

  @flags.string({ description: 'Override cool-off hours' })
  declare cooloff: string

  @flags.string({ description: 'Override window start (HH:MM)' })
  declare windowStart: string

  @flags.string({ description: 'Override window end (HH:MM)' })
  declare windowEnd: string

  @flags.string({ description: 'Override per-window data cap in GB (0 = unlimited)' })
  declare cap: string

  @flags.string({ description: 'Override bytes already used this window' })
  declare usedBytes: string

  @flags.string({ description: 'Simulate the clock at this ISO timestamp' })
  declare now: string

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { DateTime } = await import('luxon')
    const { DownloadService } = await import('#services/download_service')
    const { QueueService } = await import('#services/queue_service')
    const { ContentAutoUpdateService } = await import('#services/content_auto_update_service')

    const svc = new ContentAutoUpdateService(new DownloadService(QueueService.getInstance()))

    if (this.scenarios) {
      const ok = this.runScenarios(svc, DateTime)
      if (!ok) this.exitCode = 1
      return
    }

    const BYTES_PER_GB = 1024 * 1024 * 1024
    const overrides: Record<string, any> = {}
    if (this.forceEnabled) overrides.forceEnabled = true
    if (this.cooloff) overrides.cooloffHours = Number(this.cooloff)
    if (this.windowStart) overrides.windowStart = this.windowStart
    if (this.windowEnd) overrides.windowEnd = this.windowEnd
    if (this.cap) overrides.maxBytesPerWindow = Math.round(Number(this.cap) * BYTES_PER_GB)
    if (this.usedBytes) overrides.windowBytesUsed = Number(this.usedBytes)
    if (this.now) overrides.now = DateTime.fromISO(this.now)

    this.logger.info('Running content auto-update dry run (no download will be dispatched)...')
    const d = await svc.dryRun(overrides)

    this.logger.log('')
    this.logger.log(`  Enabled         : ${d.enabled}`)
    this.logger.log(
      `  Window          : ${d.config.windowStart}-${d.config.windowEnd} ` +
        `(currently ${d.withinWindow ? 'inside' : 'outside'})`
    )
    this.logger.log(`  Cool-off hours  : ${d.config.cooloffHours}`)
    this.logger.log(
      `  Data cap        : ${d.config.maxBytesPerWindow > 0 ? d.config.maxBytesPerWindow + ' bytes' : 'unlimited'}`
    )
    this.logger.log(`  Eligible        : ${d.eligibleCount}`)
    this.logger.log(`  Would start     : ${d.selection.selected.map((c) => c.resource.resource_id).join(', ') || '—'}`)
    this.logger.log(
      `  Skipped (cap)   : ${d.selection.skippedOversize.map((c) => c.resource.resource_id).join(', ') || '—'}`
    )
    this.logger.log(
      `  Deferred (budget): ${d.selection.deferred.map((c) => c.resource.resource_id).join(', ') || '—'}`
    )
    this.logger.log('')
  }

  /**
   * Deterministic acceptance suite over the pure decision helpers — no network
   * or dispatch. Mirrors the per-resource eligibility, cap selection, and window
   * branches reviewers care about.
   */
  private runScenarios(svc: any, DateTime: any): boolean {
    const now = DateTime.fromISO('2026-06-04T03:00:00Z')
    const daysAgo = (d: number) => now.minus({ days: d })
    const hoursAgo = (h: number) => now.minus({ hours: h })

    const res = (o: Record<string, any> = {}) => ({
      resource_id: 'res',
      version: '2024-01',
      available_update_version: null,
      available_update_size_bytes: null,
      available_update_first_seen_at: null,
      auto_update_disabled_reason: null,
      auto_update_consecutive_failures: 0,
      installed_at: daysAgo(100),
      ...o,
    })
    const cand = (id: string, size: number, installedAt: any = daysAgo(100)) => ({
      resource: res({ resource_id: id }),
      version: '2024-06',
      download_url: `(test)`,
      size_bytes: size,
      installed_at: installedAt,
    })

    let passed = 0
    let failed = 0
    const report = (ok: boolean, message: string) => {
      this.logger.log(`  ${ok ? this.colors.green('✓') : this.colors.red('✗')} ${message}`)
      ok ? passed++ : failed++
    }

    this.logger.log('')
    this.logger.log('Eligibility scenarios:')
    report(
      svc.resourceEligibility(res(), 72, now).eligible === false,
      'no available update → not eligible'
    )
    report(
      svc.resourceEligibility(
        res({ available_update_version: '2024-06', available_update_first_seen_at: hoursAgo(10) }),
        72,
        now
      ).eligible === false,
      'inside cool-off → not eligible'
    )
    report(
      svc.resourceEligibility(
        res({ available_update_version: '2024-06', available_update_first_seen_at: daysAgo(5) }),
        72,
        now
      ).eligible === true,
      'past cool-off → eligible'
    )
    report(
      svc.resourceEligibility(
        res({
          available_update_version: '2024-06',
          available_update_first_seen_at: daysAgo(30),
          auto_update_disabled_reason: 'disabled',
        }),
        72,
        now
      ).eligible === false,
      'self-disabled → not eligible'
    )

    this.logger.log('')
    this.logger.log('Cap selection scenarios:')
    {
      const s = svc.selectUnderCap([cand('a', 1000), cand('b', 2000)], 10000, 0)
      report(s.selected.length === 2, 'under cap selects all')
    }
    {
      const s = svc.selectUnderCap([cand('huge', 50000)], 20000, 0)
      report(
        s.selected.length === 0 && s.skippedOversize.length === 1,
        'oversize file → skipped, never selected'
      )
    }
    {
      const s = svc.selectUnderCap([cand('mid', 8000)], 10000, 5000)
      report(s.selected.length === 0 && s.deferred.length === 1, 'over remaining budget → deferred')
    }
    {
      const s = svc.selectUnderCap([cand('a', 0)], 10000, 0)
      report(s.selected.length === 0 && s.deferred.length === 1, 'unknown size → deferred')
    }
    {
      const s = svc.selectUnderCap([cand('big', 9_999_999_999)], 0, 0)
      report(s.selected.length === 1, 'cap 0 → unlimited')
    }

    this.logger.log('')
    this.logger.log('Window scenarios:')
    report(
      isWithinWindow('02:00', '05:00', DateTime.fromISO('2026-06-04T03:00:00')) === true,
      'normal 02:00-05:00 @ 03:00 → in'
    )
    report(
      isWithinWindow('22:00', '02:00', DateTime.fromISO('2026-06-04T01:00:00')) === true,
      'wrap 22:00-02:00 @ 01:00 → in'
    )
    report(
      isWithinWindow('22:00', '02:00', DateTime.fromISO('2026-06-04T12:00:00')) === false,
      'wrap 22:00-02:00 @ 12:00 → out'
    )

    this.logger.log('')
    if (failed === 0) {
      this.logger.success(`All ${passed} scenarios passed`)
    } else {
      this.logger.error(`${failed} scenario(s) failed, ${passed} passed`)
    }
    return failed === 0
  }
}
