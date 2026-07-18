import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Exercise the app auto-update decision logic WITHOUT ever triggering a real update.
 *
 *   # Prove the per-app eligibility + window logic deterministically (no DB/Docker):
 *   node ace app-auto-update:dry-run --scenarios
 *
 *   # Show, against the live DB, which opted-in apps WOULD update right now:
 *   node ace app-auto-update:dry-run
 */
export default class AppAutoUpdateDryRun extends BaseCommand {
  static commandName = 'app-auto-update:dry-run'
  static description = 'Dry-run the app auto-update decision logic (never triggers an update)'

  @flags.boolean({ description: 'Run the built-in deterministic scenario suite and exit' })
  declare scenarios: boolean

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { DateTime } = await import('luxon')
    const { DockerService } = await import('#services/docker_service')
    const { DownloadService } = await import('#services/download_service')
    const { SystemService } = await import('#services/system_service')
    const { ContainerRegistryService } = await import('#services/container_registry_service')
    const { QueueService } = await import('#services/queue_service')
    const { AppAutoUpdateService } = await import('#services/app_auto_update_service')
    const { isWithinWindow } = await import('../../app/utils/update_window.js')

    const dockerService = new DockerService()
    const svc = new AppAutoUpdateService(
      dockerService,
      new DownloadService(QueueService.getInstance()),
      new SystemService(dockerService),
      new ContainerRegistryService()
    )

    if (this.scenarios) {
      const ok = this.runScenarios(svc, DateTime, isWithinWindow)
      if (!ok) this.exitCode = 1
      return
    }

    // --- Live read-only snapshot (no update triggered) ----------------------
    const status = await svc.getStatus()
    this.logger.log('')
    this.logger.log(`  Master switch   : ${status.enabled ? 'enabled' : 'disabled'}`)
    this.logger.log(
      `  Window          : ${status.windowStart}-${status.windowEnd} ` +
        `(currently ${status.withinWindow ? 'inside' : 'outside'})`
    )
    this.logger.log(`  Cool-off hours  : ${status.cooloffHours}`)
    this.logger.log('')
    if (status.apps.length === 0) {
      this.logger.info('No apps are opted into auto-update.')
      return
    }
    this.logger.log('Opted-in apps:')
    for (const app of status.apps) {
      const tag = app.eligible ? this.colors.green('WOULD UPDATE') : this.colors.dim('skip')
      this.logger.log(
        `  ${tag}  ${app.friendly_name || app.service_name}: ${app.current_version}` +
          `${app.available_update_version ? ' → ' + app.available_update_version : ''} — ${app.reason}`
      )
    }
  }

  /**
   * Deterministic acceptance suite over the pure decision helpers — no DB or Docker.
   * Uses ContainerRegistryService.parseImageReference (pure) via appEligibility.
   */
  private runScenarios(svc: any, DateTime: any, isWithinWindow: any): boolean {
    const now = DateTime.fromISO('2026-06-04T12:00:00Z')
    const daysAgo = (d: number) => now.minus({ days: d })
    const hoursAgo = (h: number) => now.minus({ hours: h })

    const mk = (o: Record<string, any>) => ({
      service_name: 'nomad_test',
      container_image: 'ollama/ollama:0.18.1',
      available_update_version: null,
      available_update_first_seen_at: null,
      auto_update_disabled_reason: null,
      ...o,
    })

    type Case = { name: string; service: any; cooloff: number; expect: boolean }
    const cases: Case[] = [
      { name: 'no update → not eligible', service: mk({}), cooloff: 72, expect: false },
      {
        name: 'major bump → not eligible',
        service: mk({
          available_update_version: '1.0.0',
          available_update_first_seen_at: daysAgo(10),
        }),
        cooloff: 72,
        expect: false,
      },
      {
        name: 'minor newer inside cool-off → not eligible',
        service: mk({
          available_update_version: '0.19.0',
          available_update_first_seen_at: hoursAgo(10),
        }),
        cooloff: 72,
        expect: false,
      },
      {
        name: 'minor newer past cool-off → eligible',
        service: mk({
          available_update_version: '0.19.0',
          available_update_first_seen_at: daysAgo(5),
        }),
        cooloff: 72,
        expect: true,
      },
      {
        name: 'null first-seen → not eligible',
        service: mk({ available_update_version: '0.19.0', available_update_first_seen_at: null }),
        cooloff: 72,
        expect: false,
      },
      {
        name: 'self-disabled → not eligible',
        service: mk({
          available_update_version: '0.19.0',
          available_update_first_seen_at: daysAgo(30),
          auto_update_disabled_reason: 'disabled',
        }),
        cooloff: 72,
        expect: false,
      },
      {
        name: ':latest pinned → not eligible',
        service: mk({
          container_image: 'foo/bar:latest',
          available_update_version: '1.2.3',
          available_update_first_seen_at: daysAgo(30),
        }),
        cooloff: 72,
        expect: false,
      },
      {
        name: 'cool-off 0 applies immediately',
        service: mk({
          available_update_version: '0.18.2',
          available_update_first_seen_at: hoursAgo(1),
        }),
        cooloff: 0,
        expect: true,
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
    for (const c of cases) {
      const got = svc.appEligibility(c.service, c.cooloff, now).eligible
      const ok = got === c.expect
      this.report(ok, `${c.name} (expected ${c.expect}, got ${got})`)
      ok ? passed++ : failed++
    }

    this.logger.log('')
    this.logger.log('Window scenarios:')
    for (const c of windows) {
      const got = isWithinWindow(c.start, c.end, DateTime.fromISO(c.at))
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
