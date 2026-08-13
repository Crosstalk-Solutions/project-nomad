import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Manage the frozen evaluation corpus.
 *
 *   # Validate the corpus and goldens without touching the vector store
 *   node ace eval:corpus --check
 *
 *   # Show what is currently ingested
 *   node ace eval:corpus --status
 *
 *   # Wipe and rebuild (the normal path; safe — never touches user content)
 *   node ace eval:corpus --ingest
 *
 *   # Remove the eval corpus entirely
 *   node ace eval:corpus --reset
 */
export default class EvalCorpus extends BaseCommand {
  static commandName = 'eval:corpus'
  static description = 'Manage the frozen RAG evaluation corpus (ingest, reset, status, check)'

  @flags.boolean({ description: 'Wipe and re-ingest the corpus into the reserved eval collection' })
  declare ingest: boolean

  @flags.boolean({ description: 'Remove every eval corpus chunk from the vector store' })
  declare reset: boolean

  @flags.boolean({ description: 'Show the fingerprint and current chunk count' })
  declare status: boolean

  @flags.boolean({
    description: 'Validate the corpus and goldens only — no Qdrant, no Ollama, no writes',
  })
  declare check: boolean

  @flags.boolean({ description: 'Leave application debug logging on (very noisy)' })
  declare debug: boolean

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { EvalCorpusService } = await import('#services/eval_corpus_service')
    const { quietLogging } = await import('../../app/utils/eval/quiet.js')
    const service = await this.app.container.make(EvalCorpusService)
    const restoreLogging = quietLogging(this.debug)
    try {
      await this.dispatch(service)
    } finally {
      restoreLogging()
    }
  }

  private async dispatch(service: any) {

    // Default to --status so a bare invocation is always safe.
    if (!this.ingest && !this.reset && !this.check) this.status = true

    if (this.check) {
      return this.runCheck(service)
    }

    if (this.reset) {
      const removed = await service.reset()
      this.logger.success(`Removed ${removed} eval corpus chunks`)
      return
    }

    if (this.ingest) {
      return this.runIngest(service)
    }

    const [fingerprint, chunks, goldens] = await Promise.all([
      service.fingerprint(),
      service.count(),
      service.loadGoldens(),
    ])
    this.logger.info(`Fingerprint:   ${fingerprint}`)
    this.logger.info(`Chunks in KB:  ${chunks}`)
    this.logger.info(`Goldens:       ${goldens.length}`)
    if (chunks === 0) {
      this.logger.warning('Corpus is not ingested. Run: node ace eval:corpus --ingest')
    }
  }

  /**
   * Validation-only path. Deliberately avoids the container-resolved services'
   * network dependencies so a contributor can check their golden edits without
   * a running stack.
   */
  private async runCheck(service: any) {
    try {
      const corpus = await service.loadCorpus()
      const goldens = await service.loadGoldens()
      const fingerprint = await service.fingerprint()

      const tagCounts = new Map<string, number>()
      for (const g of goldens) {
        for (const tag of g.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      }

      // A document no golden asks about is dead weight in the corpus: it costs
      // ingest time and adds distractor noise nobody chose deliberately.
      const referenced = new Set<string>(goldens.flatMap((g: any) => g.relevantDocIds))
      const unreferenced = corpus
        .map((d: any) => d.docId)
        .filter((id: string) => !referenced.has(id))

      this.logger.success(`Corpus OK: ${corpus.length} documents, ${goldens.length} goldens`)
      this.logger.info(`Fingerprint: ${fingerprint}`)
      this.logger.info(
        `Tags: ${[...tagCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([t, n]) => `${t}=${n}`)
          .join(' ')}`
      )
      const refusals = goldens.filter((g: any) => g.expectRefusal).length
      this.logger.info(`Refusal cases: ${refusals} / ${goldens.length}`)
      if (unreferenced.length > 0) {
        this.logger.warning(`Documents no golden references: ${unreferenced.join(', ')}`)
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      this.exitCode = 1
    }
  }

  private async runIngest(service: any) {
    this.logger.info('Rebuilding the eval corpus (user content is never touched)...')
    // Validate before destroying anything — a typo in a golden should not cost
    // you the ingest you were about to run.
    await service.loadGoldens()

    const summary = await service.ingest((docId: string, index: number, total: number) => {
      this.logger.info(`  [${index}/${total}] ${docId}`)
    })

    this.logger.info('')
    if (summary.removedBeforeIngest > 0) {
      this.logger.info(`Removed ${summary.removedBeforeIngest} chunks from the previous ingest`)
    }
    this.logger.success(`Ingested ${summary.documents} documents into ${summary.chunks} chunks`)
    this.logger.info(`Fingerprint: ${summary.fingerprint}`)

    if (summary.failures.length > 0) {
      this.logger.error(`${summary.failures.length} document(s) failed to ingest:`)
      for (const f of summary.failures) this.logger.error(`  ${f.docId}: ${f.reason}`)
      // A partial corpus produces scores that look real and are not.
      this.logger.error('The corpus is incomplete — results from this state are not comparable.')
      this.exitCode = 1
    }
  }
}
