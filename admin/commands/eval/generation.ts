import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import type {
  GenerationAggregate,
  GenerationMode,
} from '../../app/services/eval_generation_service.js'

const MODES: GenerationMode[] = ['oracle', 'e2e', 'noretrieval']

/**
 * Score generated answers against the golden set.
 *
 * The `--mode` flag is the whole point of this command:
 *
 *   oracle       perfect context injected by construction -> isolates the MODEL
 *   e2e          real retrieval                           -> the real product
 *   noretrieval  no context at all                        -> parametric baseline
 *
 * Run all three on the same model and the ambiguous complaint "the AI gave a
 * bad answer" decomposes into a number that can be acted on.
 *
 *   node ace eval:generation --model=llama3.2:latest --mode=oracle
 *   node ace eval:generation --model=llama3:8b --all-modes
 *   node ace eval:generation --model=mock          # no Ollama needed
 */
export default class EvalGeneration extends BaseCommand {
  static commandName = 'eval:generation'
  static description = 'Score generated answers, with oracle/e2e/noretrieval ablation'

  @flags.string({ description: 'Ollama model to evaluate, or "mock" for the extractive ceiling' })
  declare model: string

  @flags.string({ description: `One of: ${MODES.join(', ')} (default: e2e)` })
  declare mode: string

  @flags.boolean({ description: 'Run all three modes and print the decomposition' })
  declare allModes: boolean

  @flags.string({ description: 'Repeats per question, for stability (default: 3)' })
  declare repeats: string

  @flags.string({ description: 'Only run goldens carrying this tag' })
  declare tag: string

  @flags.string({ description: 'Limit to the first N goldens (for a quick smoke run)' })
  declare limit: string

  @flags.boolean({ description: 'Print every failing question with the answer the model gave' })
  declare verbose: boolean

  @flags.boolean({ description: 'Leave application debug logging on (very noisy)' })
  declare debug: boolean

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { EvalCorpusService } = await import('#services/eval_corpus_service')
    const { EvalGenerationService, MOCK_MODEL } = await import('#services/eval_generation_service')
    const { quietLogging } = await import('../../app/utils/eval/quiet.js')

    const corpusService = await this.app.container.make(EvalCorpusService)
    const generationService = await this.app.container.make(EvalGenerationService)
    const restoreLogging = quietLogging(this.debug)

    try {
      if (!this.model) {
        this.logger.error('--model is required (use --model=mock to run without Ollama)')
        this.exitCode = 1
        return
      }

      const modes: GenerationMode[] = this.allModes
        ? MODES
        : [(this.mode as GenerationMode) || 'e2e']
      for (const mode of modes) {
        if (!MODES.includes(mode)) {
          this.logger.error(`Unknown mode "${mode}". Expected one of: ${MODES.join(', ')}`)
          this.exitCode = 1
          return
        }
      }

      let goldens = await corpusService.loadGoldens()
      if (this.tag) goldens = goldens.filter((g) => g.tags.includes(this.tag))
      if (this.limit) goldens = goldens.slice(0, Number.parseInt(this.limit, 10))
      if (goldens.length === 0) {
        this.logger.error('No goldens matched the given filters')
        this.exitCode = 1
        return
      }

      // e2e and oracle both need the corpus present; noretrieval does not, but
      // requiring it uniformly keeps the three modes comparable.
      const chunks = await corpusService.count()
      if (chunks === 0 && modes.some((m) => m !== 'noretrieval')) {
        this.logger.error('The eval corpus is not ingested. Run: node ace eval:corpus --ingest')
        this.exitCode = 1
        return
      }

      const fingerprint = await corpusService.fingerprint()
      const repeats = this.repeats ? Number.parseInt(this.repeats, 10) : 3
      this.logger.info(
        `Corpus ${fingerprint} · ${goldens.length} goldens · model=${this.model} · repeats=${repeats}`
      )
      if (this.model === MOCK_MODEL) {
        this.logger.info(
          'Mock model: answers are the injected context verbatim — this is the extractive ceiling for the current retrieval, not a real model.'
        )
      }
      this.logger.info('')

      const summaries: Array<{ mode: GenerationMode; agg: GenerationAggregate }> = []

      for (const mode of modes) {
        const result = await generationService.run(goldens, {
          mode,
          model: this.model,
          repeats,
          onProgress: (id, index, total) => {
            if (this.verbose) this.logger.info(`  [${index}/${total}] ${mode}: ${id}`)
          },
        })
        summaries.push({ mode, agg: result.overall })

        this.printAggregate(mode, result.overall, result.elapsedMs)

        if (result.overall.errors > 0) {
          this.logger.error(
            `${result.overall.errors} question(s) errored talking to the model — the scores above are incomplete.`
          )
          const firstError = result.cases.find((c) => c.error)
          if (firstError) this.logger.error(`  first error (${firstError.id}): ${firstError.error}`)
          this.exitCode = 1
        }

        if (this.verbose) this.printFailures(result.cases)
      }

      if (summaries.length > 1) this.printDecomposition(summaries)
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      this.exitCode = 1
    } finally {
      restoreLogging()
    }
  }

  private printAggregate(mode: GenerationMode, agg: GenerationAggregate, elapsedMs: number) {
    this.logger.info(`=== ${mode.toUpperCase()} (${(elapsedMs / 1000).toFixed(1)}s) ===`)
    this.logger.info(`  correctness        ${fmt(agg.correctness)}`)
    this.logger.info(`  refusal correct    ${fmt(agg.refusalCorrectness)}`)
    this.logger.info(`  leakage rate       ${fmt(agg.leakageRate)}  (lower is better)`)
    this.logger.info(`  think-tag leak     ${fmt(agg.thinkTagLeakRate)}  (should be 0)`)
    this.logger.info(`  markdown formatted ${fmt(agg.markdownRate)}`)
    this.logger.info(
      `  numeric grounding  ${agg.groundedness ? `${agg.groundedness.mean.toFixed(3)} (n=${agg.groundedness.n})` : '  n/a'}`
    )
    this.logger.info(
      `  mean answer length ${agg.meanAnswerLength === null ? 'n/a' : Math.round(agg.meanAnswerLength)} chars`
    )
    if (agg.unstable > 0) {
      this.logger.warning(
        `  ${agg.unstable} question(s) flipped between repeats — excluded from gating, do not read them as a regression.`
      )
    }
    this.logger.info('')
  }

  /**
   * The reason this command exists: turn three scores into an attribution.
   */
  private printDecomposition(summaries: Array<{ mode: GenerationMode; agg: GenerationAggregate }>) {
    const get = (mode: GenerationMode) => summaries.find((s) => s.mode === mode)?.agg.correctness ?? null
    const oracle = get('oracle')
    const e2e = get('e2e')
    const none = get('noretrieval')

    this.logger.info('=== Decomposition ===')
    if (oracle !== null && e2e !== null) {
      const cost = oracle - e2e
      this.logger.info(`  retrieval cost   ${cost.toFixed(3)}   (oracle ${oracle.toFixed(3)} - e2e ${e2e.toFixed(3)})`)
      this.logger.info(`  model ceiling    ${oracle.toFixed(3)}   (what this model manages with perfect context)`)
    }
    if (e2e !== null && none !== null) {
      this.logger.info(`  RAG contribution ${(e2e - none).toFixed(3)}   (e2e ${e2e.toFixed(3)} - noretrieval ${none.toFixed(3)})`)
    }

    if (oracle !== null && e2e !== null) {
      // The actual triage rule, stated so nobody has to re-derive it.
      const cost = oracle - e2e
      if (oracle < 0.6) {
        this.logger.warning(
          '  Oracle is low: this model struggles even with perfect context. Retrieval work will not fix it — try a larger model.'
        )
      } else if (cost > 0.15) {
        this.logger.warning(
          '  Large retrieval cost: the model can use good context but is not being given it. Work on retrieval.'
        )
      } else {
        this.logger.success('  Model and retrieval are both holding up on this corpus.')
      }
    }
    if (none !== null && e2e !== null && e2e <= none) {
      this.logger.warning(
        '  RAG is not adding anything over the bare model on this set — check that retrieval is actually reaching the prompt.'
      )
    }
  }

  private printFailures(cases: Array<any>) {
    const failures = cases.filter((c) => c.correctness.passRate < 1 || c.refusalCorrectness.passRate < 1)
    if (failures.length === 0) return
    this.logger.info('--- failures ---')
    for (const f of failures) {
      this.logger.info(`  ${f.id}  correct=${f.correctness.passes}/${f.correctness.repeats} refusal=${f.refusalCorrectness.passes}/${f.refusalCorrectness.repeats}`)
      const score = f.scores[0]
      if (score?.missedRequired?.length) {
        this.logger.info(`    missed: ${score.missedRequired.join(' | ')}`)
      }
      if (score?.hitForbidden?.length) {
        this.logger.info(`    said forbidden: ${score.hitForbidden.join(' | ')}`)
      }
      if (score?.leakage?.length) {
        this.logger.info(`    narrated retrieval`)
      }
      if (f.answers[0]) {
        const preview = f.answers[0].replace(/\s+/g, ' ').slice(0, 220)
        this.logger.info(`    said: ${preview}${f.answers[0].length > 220 ? '…' : ''}`)
      }
    }
    this.logger.info('')
  }
}

const fmt = (v: number | null) => (v === null ? '  n/a' : v.toFixed(3))
