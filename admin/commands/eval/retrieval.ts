import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import type { RetrievalAggregate } from '../../app/utils/eval/retrieval_metrics.js'

/**
 * Score NOMAD's retrieval against the frozen golden set.
 *
 * No chat model is involved, so this is deterministic and hardware-independent:
 * a movement in these numbers is a code change, not a slow machine or an unlucky
 * sample. It is the fast inner loop for anything touching chunking, embedding,
 * thresholds, or reranking.
 *
 *   node ace eval:retrieval
 *   node ace eval:retrieval --ablate            # is the reranker helping?
 *   node ace eval:retrieval --threshold=0.5     # sweep the cutoff
 *   node ace eval:retrieval --tag=multi-hop     # one slice only
 */
export default class EvalRetrieval extends BaseCommand {
  static commandName = 'eval:retrieval'
  static description = 'Score RAG retrieval against the golden set (deterministic, no chat model)'

  @flags.string({ description: 'Chunks to retrieve per query (default: the production value)' })
  declare topK: string

  @flags.string({ description: 'Minimum similarity score (default: the production value)' })
  declare threshold: string

  @flags.boolean({ description: 'Also score the raw dense, reranked, and diversified orderings' })
  declare ablate: boolean

  @flags.string({ description: 'Only run goldens carrying this tag' })
  declare tag: string

  @flags.boolean({ description: 'Print each failing question and what it retrieved' })
  declare verbose: boolean

  @flags.boolean({ description: 'Leave application debug logging on (very noisy)' })
  declare debug: boolean

  @flags.boolean({ description: 'Write a JSON + Markdown report to tests/eval/reports/' })
  declare report: boolean

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { EvalCorpusService } = await import('#services/eval_corpus_service')
    const { EvalRetrievalService } = await import('#services/eval_retrieval_service')
    const { EvalReportService } = await import('#services/eval_report_service')
    const { quietLogging } = await import('../../app/utils/eval/quiet.js')

    const corpusService = await this.app.container.make(EvalCorpusService)
    const retrievalService = await this.app.container.make(EvalRetrievalService)
    const reportService = await this.app.container.make(EvalReportService)
    const restoreLogging = quietLogging(this.debug)

    try {
      const chunks = await retrievalService.assertCorpusReady()
      const fingerprint = await corpusService.fingerprint()
      let goldens = await corpusService.loadGoldens()

      if (this.tag) {
        goldens = goldens.filter((g) => g.tags.includes(this.tag))
        if (goldens.length === 0) {
          this.logger.error(`No goldens carry the tag "${this.tag}"`)
          this.exitCode = 1
          return
        }
      }

      this.logger.info(`Corpus ${fingerprint} · ${chunks} chunks · ${goldens.length} goldens`)
      this.logger.info('')

      const started = Date.now()
      const result = await retrievalService.run(goldens, {
        topK: this.topK ? Number.parseInt(this.topK, 10) : undefined,
        scoreThreshold: this.threshold ? Number.parseFloat(this.threshold) : undefined,
        ablate: this.ablate,
      })
      const elapsed = ((Date.now() - started) / 1000).toFixed(1)

      this.logger.info(
        `Params: topK=${result.params.topK} threshold=${result.params.scoreThreshold}  (${elapsed}s)`
      )
      this.logger.info('')
      this.printAggregate('OVERALL', result.overall, result.params.kValues)

      if (result.unresolvedChunks > 0) {
        // Every retrieved chunk should belong to the eval corpus. Anything else
        // means the collection filter leaked and the numbers above describe a
        // corpus nobody chose.
        this.logger.error(
          `${result.unresolvedChunks} retrieved chunk(s) did not belong to the eval corpus — the collection filter leaked.`
        )
        this.exitCode = 1
      }

      this.printThresholdGuidance(result.overall)

      if (result.ablation) {
        this.logger.info('')
        this.logger.info('=== Stage ablation (does each heuristic earn its place?) ===')
        const k = result.params.kValues.includes(5) ? 5 : result.params.kValues[0]
        const row = (name: string, agg: RetrievalAggregate) =>
          this.logger.info(
            `  ${name.padEnd(14)} recall@${k}=${fmt(agg.recall[k])}  ndcg@${k}=${fmt(agg.ndcg[k])}  mrr=${fmt(agg.mrr)}  prec@${k}=${fmt(agg.precision[k])}`
          )
        row('dense only', result.ablation.dense)
        row('+ rerank', result.ablation.reranked)
        row('+ diversity', result.ablation.diversified)
        this.explainAblation(result.ablation, k)
      }

      this.logger.info('')
      this.logger.info('=== By tag ===')
      for (const [tag, agg] of Object.entries(result.byTag).sort()) {
        const k = result.params.kValues.includes(5) ? 5 : result.params.kValues[0]
        this.logger.info(
          `  ${tag.padEnd(20)} n=${String(agg.cases).padStart(3)}  recall@${k}=${fmt(agg.recall[k])}  ndcg@${k}=${fmt(agg.ndcg[k])}`
        )
      }

      const k = result.params.kValues.includes(5) ? 5 : result.params.kValues[0]
      const misses = result.cases.filter((c) => !c.expectRefusal && (c.recall[k] ?? 1) < 1)
      this.logger.info('')
      this.logger.info(`${misses.length} of ${result.overall.answerable} answerable questions missed at k=${k}`)

      if (this.verbose && misses.length > 0) {
        this.logger.info('')
        this.logger.info('=== Misses ===')
        for (const miss of misses) {
          this.logger.info(`  ${miss.id}`)
          this.logger.info(`    wanted:   ${miss.relevantDocIds.join(', ') || '(none)'}`)
          this.logger.info(`    retrieved: ${miss.retrievedDocIds.join(', ') || '(nothing)'}`)
        }
      } else if (misses.length > 0) {
        this.logger.info('Re-run with --verbose to see which questions and what they retrieved.')
      }

      if (this.report) {
        const meta = await reportService.buildMeta('retrieval', fingerprint, {
          ...result.params,
          tag: this.tag ?? null,
        })
        const doc = reportService.fromRetrieval(meta, result)
        const slug = `retrieval-${meta.createdAt.replace(/[:.]/g, '-')}`
        const path = await reportService.write(doc, slug, renderRetrievalMarkdown(doc, result, misses))
        this.logger.info('')
        this.logger.success(`Report written: ${path}`)
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      this.exitCode = 1
    } finally {
      restoreLogging()
    }
  }

  private printAggregate(label: string, agg: RetrievalAggregate, kValues: number[]) {
    this.logger.info(`=== ${label} (${agg.answerable} answerable of ${agg.cases}) ===`)
    const row = (name: string, values: Record<number, number | null>) =>
      this.logger.info(
        `  ${name.padEnd(10)} ${kValues.map((k) => `@${k}=${fmt(values[k])}`).join('  ')}`
      )
    row('recall', agg.recall)
    row('hit rate', agg.hitRate)
    row('precision', agg.precision)
    row('ndcg', agg.ndcg)
    this.logger.info(`  mrr        ${fmt(agg.mrr)}`)
  }

  /**
   * Turn the score distributions into an actual recommendation. The raw
   * percentiles are the evidence; this is the reading of them, which is what
   * the threshold constants have never had.
   */
  private printThresholdGuidance(agg: RetrievalAggregate) {
    const rel = agg.relevantScores
    const irr = agg.irrelevantScores
    this.logger.info('')
    this.logger.info('=== Score separation (how to calibrate the threshold) ===')
    if (rel) {
      this.logger.info(
        `  relevant chunks    n=${rel.count} min=${rel.min.toFixed(3)} p10=${rel.p10.toFixed(3)} median=${rel.median.toFixed(3)} p90=${rel.p90.toFixed(3)}`
      )
    }
    if (irr) {
      this.logger.info(
        `  irrelevant chunks  n=${irr.count} min=${irr.min.toFixed(3)} p10=${irr.p10.toFixed(3)} median=${irr.median.toFixed(3)} p90=${irr.p90.toFixed(3)}`
      )
    }
    if (rel && irr) {
      if (rel.p10 > irr.p90) {
        this.logger.success(
          `  Clean separation: a threshold between ${irr.p90.toFixed(3)} and ${rel.p10.toFixed(3)} splits them.`
        )
      } else {
        this.logger.warning(
          `  Overlapping: relevant p10 (${rel.p10.toFixed(3)}) sits below irrelevant p90 (${irr.p90.toFixed(3)}).`
        )
        this.logger.warning(
          '  No cutoff separates these cleanly — the retriever needs work, not the threshold.'
        )
      }
    }
    if (agg.emptyRateOnAnswerable !== null && agg.emptyRateOnAnswerable > 0) {
      this.logger.warning(
        `  ${pct(agg.emptyRateOnAnswerable)} of answerable questions retrieved nothing — threshold may be too high.`
      )
    }
    if (agg.nonEmptyRateOnRefusal !== null && agg.nonEmptyRateOnRefusal > 0) {
      this.logger.warning(
        `  ${pct(agg.nonEmptyRateOnRefusal)} of out-of-corpus questions retrieved something anyway — that context is what produces confident wrong answers.`
      )
    }
  }

  private explainAblation(ablation: { dense: RetrievalAggregate; reranked: RetrievalAggregate; diversified: RetrievalAggregate }, k: number) {
    const verdict = (name: string, before: number | null, after: number | null) => {
      if (before === null || after === null) return
      const delta = after - before
      if (Math.abs(delta) < 1e-6) {
        this.logger.warning(`  ${name} changed nothing at k=${k} — it is complexity with no measured benefit.`)
      } else if (delta < 0) {
        this.logger.warning(`  ${name} made ndcg@${k} worse by ${Math.abs(delta).toFixed(4)}.`)
      } else {
        this.logger.success(`  ${name} improved ndcg@${k} by ${delta.toFixed(4)}.`)
      }
    }
    verdict('Reranking', ablation.dense.ndcg[k], ablation.reranked.ndcg[k])
    verdict('Source diversity', ablation.reranked.ndcg[k], ablation.diversified.ndcg[k])
  }
}

const fmt = (v: number | null) => (v === null ? '  n/a' : v.toFixed(3))
const pct = (v: number) => `${(v * 100).toFixed(0)}%`

/**
 * The human-readable half of a report. Leads with the misses, because when a
 * number moves the next question is always "which questions?" and a table of
 * aggregates cannot answer it.
 */
function renderRetrievalMarkdown(doc: any, result: any, misses: any[]): string {
  const lines: string[] = ['# Retrieval eval', '']
  lines.push(`- corpus: \`${doc.meta.corpusFingerprint}\``)
  lines.push(`- commit: \`${doc.meta.gitSha ?? 'unknown'}\`${doc.meta.gitDirty ? ' (dirty tree)' : ''}`)
  lines.push(`- when: ${doc.meta.createdAt}`)
  lines.push(`- params: topK=${result.params.topK} threshold=${result.params.scoreThreshold}`)
  lines.push('')
  lines.push('## Metrics', '')
  lines.push('| metric | value |', '|---|---:|')
  for (const [name, value] of Object.entries(doc.metrics)) {
    lines.push(`| ${name} | ${value === null ? 'n/a' : (value as number).toFixed(4)} |`)
  }
  lines.push('')
  lines.push(`## Misses (${misses.length})`, '')
  if (misses.length === 0) {
    lines.push('None.')
  } else {
    for (const m of misses) {
      lines.push(`### \`${m.id}\``)
      lines.push(`- wanted: ${m.relevantDocIds.join(', ') || '_none_'}`)
      lines.push(`- retrieved: ${m.retrievedDocIds.join(', ') || '_nothing_'}`)
      lines.push('')
    }
  }
  lines.push('## By tag', '')
  lines.push('| tag | recall@5 | ndcg@5 |', '|---|---:|---:|')
  for (const [tag, metrics] of Object.entries(doc.byTag).sort()) {
    const m = metrics as Record<string, number | null>
    const cell = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : v.toFixed(4))
    lines.push(`| ${tag} | ${cell(m['recall@5'])} | ${cell(m['ndcg@5'])} |`)
  }
  return lines.join('\n') + '\n'
}
