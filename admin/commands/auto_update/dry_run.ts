import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { readFile } from 'node:fs/promises'

/**
 * Exercise the auto-update decision pipeline WITHOUT ever triggering a real update.
 *
 *   # Prove the core logic deterministically (no network/DB/Docker):
 *   node ace auto-update:dry-run --scenarios
 *
 *   # Simulate "what would happen if I were running 1.32.0 right now"
 *   # against the live GitHub releases feed and real pre-flight checks:
 *   node ace auto-update:dry-run --current=1.32.0 --force-enabled
 *
 *   # Fully offline simulation with a canned release list + fixed clock:
 *   node ace auto-update:dry-run --current=1.32.0 --force-enabled \
 *     --releases-file=./fixtures/releases.json --now=2026-06-04T21:00:00Z \
 *     --window-start=20:00 --window-end=23:00 --skip-preflight
 */
export default class AutoUpdateDryRun extends BaseCommand {
  static commandName = 'auto-update:dry-run'
  static description = 'Dry-run the auto-update decision pipeline (never triggers an update)'

  @flags.boolean({ description: 'Run the built-in deterministic scenario suite and exit' })
  declare scenarios: boolean

  @flags.string({ description: 'Simulate this currently-running version (e.g. 1.32.0)' })
  declare current: string

  @flags.boolean({ description: 'Ignore the persisted enabled setting and treat as enabled' })
  declare forceEnabled: boolean

  @flags.string({ description: 'Override cool-off hours' })
  declare cooloff: string

  @flags.string({ description: 'Override window start (HH:MM)' })
  declare windowStart: string

  @flags.string({ description: 'Override window end (HH:MM)' })
  declare windowEnd: string

  @flags.string({ description: 'Simulate the clock at this ISO timestamp' })
  declare now: string

  @flags.string({ description: 'Path to a JSON file with a GitHub releases array (offline)' })
  declare releasesFile: string

  @flags.boolean({ description: 'Bypass Docker/disk/queue pre-flight checks' })
  declare skipPreflight: boolean

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { DateTime } = await import('luxon')
    const { DockerService } = await import('#services/docker_service')
    const { DownloadService } = await import('#services/download_service')
    const { SystemService } = await import('#services/system_service')
    const { SystemUpdateService } = await import('#services/system_update_service')
    const { ContainerRegistryService } = await import('#services/container_registry_service')
    const { QueueService } = await import('#services/queue_service')
    const { AutoUpdateService } = await import('#services/auto_update_service')

    const dockerService = new DockerService()
    const svc = new AutoUpdateService(
      dockerService,
      new DownloadService(QueueService.getInstance()),
      new SystemService(dockerService),
      new SystemUpdateService(),
      new ContainerRegistryService()
    )

    if (this.scenarios) {
      const ok = this.runScenarios(svc, DateTime)
      if (!ok) {
        this.exitCode = 1
      }
      return
    }

    // --- Live / simulated single dry run ------------------------------------
    const overrides: Record<string, any> = {}
    if (this.current) overrides.currentVersion = this.current
    if (this.forceEnabled) overrides.forceEnabled = true
    if (this.cooloff) overrides.cooloffHours = Number(this.cooloff)
    if (this.windowStart) overrides.windowStart = this.windowStart
    if (this.windowEnd) overrides.windowEnd = this.windowEnd
    if (this.skipPreflight) overrides.skipPreflight = true
    if (this.now) overrides.now = DateTime.fromISO(this.now)
    if (this.releasesFile) {
      const raw = await readFile(this.releasesFile, 'utf-8')
      overrides.releases = JSON.parse(raw)
    }

    this.logger.info('Running auto-update dry run (no update will be triggered)...')
    const decision = await svc.dryRun(overrides)

    this.logger.log('')
    this.logger.log(`  Current version : ${decision.currentVersion}`)
    this.logger.log(`  Enabled         : ${decision.enabled}`)
    this.logger.log(
      `  Window          : ${decision.config.windowStart}-${decision.config.windowEnd} ` +
        `(currently ${decision.withinWindow ? 'inside' : 'outside'})`
    )
    this.logger.log(`  Cool-off hours  : ${decision.config.cooloffHours}`)
    this.logger.log(
      `  Eligible target : ${decision.eligibleTarget ? decision.eligibleTarget.tag + ' (published ' + decision.eligibleTarget.publishedAt + ')' : '—'}`
    )
    if (decision.preflight) {
      if (decision.preflight.ok) {
        this.logger.log(`  Pre-flight      : ok`)
      } else {
        this.logger.log(`  Pre-flight      : BLOCKED`)
        for (const b of decision.preflight.blockers) {
          this.logger.log(`      - [${b.severity}] ${b.reason}`)
        }
      }
    } else {
      this.logger.log(`  Pre-flight      : (not reached)`)
    }
    this.logger.log('')

    const verdict =
      decision.outcome === 'ready'
        ? `WOULD UPDATE → ${decision.eligibleTarget!.tag}`
        : `WOULD NOT UPDATE (${decision.outcome}): ${decision.reason}`
    if (decision.outcome === 'ready') {
      this.logger.success(verdict)
    } else {
      this.logger.info(verdict)
    }
  }

  /**
   * Deterministic acceptance suite over the pure decision helpers — no network,
   * DB, or Docker. Proves every branch reviewers care about.
   */
  private runScenarios(svc: any, DateTime: any): boolean {
    const NOW = '2026-06-04T12:00:00Z'
    const now = DateTime.fromISO(NOW)
    const daysAgo = (d: number) => now.minus({ days: d }).toISO()
    const hoursAgo = (h: number) => now.minus({ hours: h }).toISO()
    const rel = (tag: string, published: string, extra: object = {}) => ({
      tag_name: tag,
      published_at: published,
      ...extra,
    })

    type EligCase = {
      name: string
      releases: any[]
      current: string
      cooloff: number
      expect: string | null
    }

    const eligibility: EligCase[] = [
      {
        name: 'only a major bump is newer → none (major requires manual)',
        releases: [rel('v2.0.0', daysAgo(10))],
        current: '1.32.0',
        cooloff: 72,
        expect: null,
      },
      {
        name: 'same-major minor newer but inside cool-off → none',
        releases: [rel('v1.33.0', hoursAgo(10))],
        current: '1.32.0',
        cooloff: 72,
        expect: null,
      },
      {
        name: 'same-major patch past cool-off → selected',
        releases: [rel('v1.32.1', daysAgo(5))],
        current: '1.32.0',
        cooloff: 72,
        expect: '1.32.1',
      },
      {
        name: 'mixed: newest same-major past cool-off wins; major/in-cooloff/prerelease ignored',
        releases: [
          rel('v2.0.0', daysAgo(30)),
          rel('v1.34.0', hoursAgo(5)),
          rel('v1.33.2', daysAgo(4)),
          rel('v1.33.5', daysAgo(1), { prerelease: true }),
          rel('v1.33.0', daysAgo(8)),
        ],
        current: '1.32.9',
        cooloff: 72,
        expect: '1.33.2',
      },
      {
        name: 'draft releases ignored',
        releases: [rel('v1.33.0', daysAgo(5), { draft: true })],
        current: '1.32.0',
        cooloff: 72,
        expect: null,
      },
      {
        name: 'malformed tag with injection chars → ignored (M2)',
        releases: [rel('v1.33.0|; e reboot', daysAgo(10))],
        current: '1.32.0',
        cooloff: 72,
        expect: null,
      },
      {
        name: 'dev build never updates',
        releases: [rel('v1.33.0', daysAgo(10))],
        current: 'dev',
        cooloff: 72,
        expect: null,
      },
      {
        name: 'cool-off of 0 applies immediately',
        releases: [rel('v1.32.1', hoursAgo(1))],
        current: '1.32.0',
        cooloff: 0,
        expect: '1.32.1',
      },
    ]

    type WinCase = { name: string; start: string; end: string; at: string; expect: boolean }
    const at = (hhmm: string) => `2026-06-04T${hhmm}:00`
    const windows: WinCase[] = [
      {
        name: 'normal 20:00-23:00 @ 21:00 → in',
        start: '20:00',
        end: '23:00',
        at: at('21:00'),
        expect: true,
      },
      {
        name: 'normal 20:00-23:00 @ 19:00 → out',
        start: '20:00',
        end: '23:00',
        at: at('19:00'),
        expect: false,
      },
      {
        name: 'wrap 22:00-02:00 @ 23:00 → in',
        start: '22:00',
        end: '02:00',
        at: at('23:00'),
        expect: true,
      },
      {
        name: 'wrap 22:00-02:00 @ 01:00 → in',
        start: '22:00',
        end: '02:00',
        at: at('01:00'),
        expect: true,
      },
      {
        name: 'wrap 22:00-02:00 @ 12:00 → out',
        start: '22:00',
        end: '02:00',
        at: at('12:00'),
        expect: false,
      },
    ]

    let passed = 0
    let failed = 0

    this.logger.log('')
    this.logger.log('Eligibility scenarios:')
    for (const c of eligibility) {
      const got = svc.selectEligibleTarget(c.releases, c.current, c.cooloff, now)
      const gotVersion = got ? got.version : null
      const ok = gotVersion === c.expect
      this.report(ok, `${c.name} (expected ${c.expect ?? 'none'}, got ${gotVersion ?? 'none'})`)
      ok ? passed++ : failed++
    }

    this.logger.log('')
    this.logger.log('Window scenarios:')
    for (const c of windows) {
      const cfg = { enabled: true, windowStart: c.start, windowEnd: c.end, cooloffHours: 72 }
      const got = svc.isWithinWindow(cfg, DateTime.fromISO(c.at))
      const ok = got === c.expect
      this.report(ok, `${c.name} (expected ${c.expect}, got ${got})`)
      ok ? passed++ : failed++
    }

    this.logger.log('')
    if (failed === 0) {
      this.logger.success(`All ${passed} scenarios passed`)
    } else {
      this.logger.error(`${failed} scenario(s) failed, ${passed} passed`)
    }
    return failed === 0
  }

  private report(ok: boolean, message: string) {
    if (ok) {
      this.logger.log(`  ${this.colors.green('✓')} ${message}`)
    } else {
      this.logger.log(`  ${this.colors.red('✗')} ${message}`)
    }
  }
}
