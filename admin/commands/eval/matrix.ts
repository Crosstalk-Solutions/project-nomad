import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import type { GenerationAggregate } from '../../app/services/eval_generation_service.js'

type Row = {
  model: string
  oracle: GenerationAggregate | null
  e2e: GenerationAggregate | null
  error?: string
}

/**
 * Build the model capability table.
 *
 * This is the artifact that answers a GitHub issue. When a user reports "the
 * AI gave me a bad answer", look up their model in this table:
 *
 *   - scoring at or near its row  -> the model is at its ceiling. The honest
 *                                    answer is "run a larger model", not a bug.
 *   - scoring well below its row  -> something is wrong with their config or
 *                                    our code, and it is worth investigating.
 *
 * Without it, every quality concern is unfalsifiable.
 *
 *   node ace eval:matrix --models=llama3.2:latest,llama3:8b --limit=30
 *   node ace eval:matrix --models=... --promote   # commit as the reference table
 */
export default class EvalMatrix extends BaseCommand {
  static commandName = 'eval:matrix'
  static description = 'Score several models side by side to build the capability reference table'

  @flags.string({ description: 'Comma-separated Ollama model names' })
  declare models: string

  @flags.string({ description: 'Repeats per question (default: 1 — the matrix is already long)' })
  declare repeats: string

  @flags.string({ description: 'Limit to the first N goldens' })
  declare limit: string

  @flags.string({ description: 'Only run goldens carrying this tag' })
  declare tag: string

  @flags.boolean({ description: 'Write the table to tests/eval/baselines/<fingerprint>/matrix.json' })
  declare promote: boolean

  @flags.boolean({ description: 'Leave application debug logging on (very noisy)' })
  declare debug: boolean

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { EvalCorpusService } = await import('#services/eval_corpus_service')
    const { EvalGenerationService } = await import('#services/eval_generation_service')
    const { quietLogging } = await import('../../app/utils/eval/quiet.js')
    const { mkdir, writeFile } = await import('node:fs/promises')
    const { dirname, join, resolve } = await import('node:path')

    const corpusService = await this.app.container.make(EvalCorpusService)
    const generationService = await this.app.container.make(EvalGenerationService)
    const restoreLogging = quietLogging(this.debug)

    try {
      if (!this.models) {
        this.logger.error('--models is required, e.g. --models=llama3.2:latest,llama3:8b')
        this.exitCode = 1
        return
      }
      const models = this.models.split(',').map((m) => m.trim()).filter(Boolean)

      let goldens = await corpusService.loadGoldens()
      if (this.tag) goldens = goldens.filter((g) => g.tags.includes(this.tag))
      if (this.limit) goldens = goldens.slice(0, Number.parseInt(this.limit, 10))

      const fingerprint = await corpusService.fingerprint()
      const repeats = this.repeats ? Number.parseInt(this.repeats, 10) : 1
      this.logger.info(
        `Corpus ${fingerprint} · ${goldens.length} goldens · ${models.length} models · repeats=${repeats}`
      )
      this.logger.info('Running oracle and e2e for each model. This takes a while.')
      this.logger.info('')

      const rows: Row[] = []
      for (const model of models) {
        this.logger.info(`--- ${model} ---`)
        const row: Row = { model, oracle: null, e2e: null }
        try {
          // Only oracle and e2e: those two are what the triage rule needs, and
          // adding noretrieval would half again the runtime of an already long
          // command for a number that does not change the verdict.
          for (const mode of ['oracle', 'e2e'] as const) {
            const started = Date.now()
            const result = await generationService.run(goldens, { mode, model, repeats })
            row[mode] = result.overall
            this.logger.info(
              `  ${mode.padEnd(6)} correctness=${fmt(result.overall.correctness)} refusal=${fmt(result.overall.refusalCorrectness)} (${((Date.now() - started) / 1000).toFixed(0)}s)`
            )
            if (result.overall.errors > 0) {
              this.logger.warning(`  ${result.overall.errors} question(s) errored in ${mode}`)
            }
          }
        } catch (error) {
          row.error = error instanceof Error ? error.message : String(error)
          this.logger.error(`  failed: ${row.error}`)
        }
        rows.push(row)
      }

      this.logger.info('')
      this.printTable(rows)

      if (this.promote) {
        const path = resolve(join(process.cwd(), 'tests/eval/baselines', fingerprint, 'matrix.json'))
        await mkdir(dirname(path), { recursive: true })
        await writeFile(
          path,
          JSON.stringify(
            {
              corpusFingerprint: fingerprint,
              createdAt: new Date().toISOString(),
              goldens: goldens.length,
              repeats,
              tag: this.tag ?? null,
              rows,
            },
            null,
            2
          )
        )
        this.logger.success(`Capability table written: ${path}`)
        this.logger.info('Commit it — this is the reference a support triage compares against.')
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      this.exitCode = 1
    } finally {
      restoreLogging()
    }
  }

  private printTable(rows: Row[]) {
    this.logger.info('=== Capability matrix ===')
    this.logger.info('')
    const width = Math.max(20, ...rows.map((r) => r.model.length + 2))
    this.logger.info(
      `${'model'.padEnd(width)}${'oracle'.padStart(8)}${'e2e'.padStart(8)}${'ret.cost'.padStart(10)}${'refusal'.padStart(9)}${'leakage'.padStart(9)}${'ground'.padStart(8)}`
    )
    for (const row of rows) {
      if (row.error) {
        this.logger.info(`${row.model.padEnd(width)}  ERROR: ${row.error}`)
        continue
      }
      const cost =
        row.oracle?.correctness !== null && row.oracle?.correctness !== undefined &&
        row.e2e?.correctness !== null && row.e2e?.correctness !== undefined
          ? row.oracle.correctness - row.e2e.correctness
          : null
      this.logger.info(
        row.model.padEnd(width) +
          fmt(row.oracle?.correctness ?? null).padStart(8) +
          fmt(row.e2e?.correctness ?? null).padStart(8) +
          (cost === null ? '   n/a' : `${cost >= 0 ? '+' : ''}${cost.toFixed(3)}`).padStart(10) +
          fmt(row.e2e?.refusalCorrectness ?? null).padStart(9) +
          fmt(row.e2e?.leakageRate ?? null).padStart(9) +
          fmt(row.e2e?.groundedness?.mean ?? null).padStart(8)
      )
    }
    this.logger.info('')
    this.logger.info('oracle   = correctness with perfect context (the model\'s ceiling)')
    this.logger.info('e2e      = correctness with real retrieval (what a user gets)')
    this.logger.info('ret.cost = oracle - e2e (what imperfect retrieval costs this model)')
    this.logger.info('leakage  = rate of narrating retrieval; lower is better')
  }
}

const fmt = (v: number | null) => (v === null ? ' n/a' : v.toFixed(3))
