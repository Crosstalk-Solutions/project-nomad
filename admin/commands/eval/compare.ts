import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Diff an eval report against a baseline and fail on regression.
 *
 * This is the "did my change help?" command, and the one CI would call.
 *
 *   node ace eval:compare tests/eval/baselines/<fp>/retrieval.json tests/eval/reports/latest.json
 *   node ace eval:compare base.json current.json --tolerance=0.05
 *   node ace eval:compare --promote=retrieval tests/eval/reports/latest.json
 */
export default class EvalCompare extends BaseCommand {
  static commandName = 'eval:compare'
  static description = 'Diff an eval report against a baseline; exits non-zero on regression'

  @args.string({ description: 'Baseline report JSON (or the report to promote, with --promote)' })
  declare baseline: string

  @args.string({ description: 'Current report JSON', required: false })
  declare current: string

  @flags.string({ description: 'Regression tolerance per metric (default: 0.02)' })
  declare tolerance: string

  @flags.string({
    description: 'Promote the given report to a committed baseline under this name, then exit',
  })
  declare promote: string

  @flags.boolean({ description: 'Print the full metric table, not just the regressions' })
  declare verbose: boolean

  /**
   * Deliberately does not boot the application.
   *
   * Comparing two report files is pure I/O — it needs no MySQL, no Redis, no
   * Qdrant, and no Ollama. Keeping it that way is what lets CI run the gate on
   * a committed baseline without standing up the whole stack, and it avoids the
   * app's noisy Redis teardown on exit.
   */
  static options: CommandOptions = {
    startApp: false,
  }

  async run() {
    const { EvalReportService } = await import('#services/eval_report_service')
    const { compareReports, DEFAULT_TOLERANCE } = await import('../../app/utils/eval/report.js')
    const service = new EvalReportService()

    try {
      if (this.promote) {
        const report = await service.read(this.baseline)
        const path = await service.promoteToBaseline(report, this.promote)
        this.logger.success(`Promoted to baseline: ${path}`)
        this.logger.info(`Corpus fingerprint: ${report.meta.corpusFingerprint}`)
        this.logger.info('Commit this file so the whole team gates against the same numbers.')
        return
      }

      if (!this.current) {
        this.logger.error('Two report paths are required (or use --promote=<name> with one).')
        this.exitCode = 1
        return
      }

      const [baseline, current] = await Promise.all([
        service.read(this.baseline),
        service.read(this.current),
      ])
      const tolerance = this.tolerance ? Number.parseFloat(this.tolerance) : DEFAULT_TOLERANCE
      const result = compareReports(baseline, current, tolerance)

      if (!result.comparable) {
        // Refusing is the correct outcome, not a failure of the tool — diffing
        // runs from different corpora would manufacture a regression.
        this.logger.error('Reports are not comparable:')
        this.logger.error(`  ${result.incomparableReason}`)
        this.exitCode = 1
        return
      }

      this.logger.info(
        `baseline ${short(baseline.meta.gitSha)} (${baseline.meta.createdAt}) -> current ${short(current.meta.gitSha)} (${current.meta.createdAt})`
      )
      this.logger.info(`corpus ${current.meta.corpusFingerprint} · tolerance ${tolerance}`)
      if (current.meta.gitDirty) {
        this.logger.warning('Current report was produced from a dirty working tree.')
      }
      this.logger.info('')

      const rows = this.verbose
        ? [...result.deltas].sort((a, b) => (a.improvement ?? 0) - (b.improvement ?? 0))
        : [...result.regressions, ...result.improvements]

      if (rows.length === 0) {
        this.logger.success('No metric moved outside the tolerance band.')
      } else {
        for (const d of rows) {
          const line = `  ${d.metric.padEnd(24)} ${fmt(d.baseline)} -> ${fmt(d.current)}  ${signed(d.delta)}`
          if (d.regressed) this.logger.error(`${line}   REGRESSED`)
          else if ((d.improvement ?? 0) > tolerance) this.logger.success(`${line}   improved`)
          else this.logger.info(line)
        }
      }

      this.logger.info('')
      if (result.regressions.length > 0) {
        this.logger.error(
          `${result.regressions.length} metric(s) regressed beyond the ${tolerance} tolerance.`
        )
        this.exitCode = 1
      } else {
        this.logger.success(
          `No regressions. ${result.improvements.length} metric(s) improved beyond tolerance.`
        )
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      this.exitCode = 1
    }
  }
}

const fmt = (v: number | null) => (v === null ? '   n/a' : v.toFixed(4).padStart(6))
const signed = (v: number | null) => (v === null ? '     ' : `${v >= 0 ? '+' : ''}${v.toFixed(4)}`)
const short = (sha: string | null) => (sha ? sha.slice(0, 7) : 'unknown')
