import { RagService } from '#services/rag_service'
import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { KB_EVAL_COLLECTION } from '../../constants/kb_collections.js'
import { EMBEDDING_MODEL_NAME } from '../../constants/ollama.js'
import {
  assertGoldensMatchCorpus,
  computeCorpusFingerprint,
  parseGoldens,
  type Golden,
} from '../utils/eval/golden_set.js'
import { EVAL_CORPUS_DIR } from '../utils/eval/corpus_source.js'

/** Where the golden question set lives, relative to the app root. */
export const EVAL_GOLDENS_DIR = 'tests/eval/goldens'

/**
 * The suite that runs when none is named — i.e. `core.jsonl`. Every other
 * `.jsonl` in the goldens directory is opt-in via `--suite`, so adding one
 * cannot move the numbers an existing baseline was recorded against.
 */
export const DEFAULT_GOLDEN_SUITE = 'core'

// EVAL_CORPUS_DIR and docIdFromSource live in app/utils/eval/corpus_source.ts:
// they are pure path logic, and keeping them out of this service is what lets
// the leak guard be unit-tested without booting AdonisJS.
export { docIdFromSource, EVAL_CORPUS_DIR } from '../utils/eval/corpus_source.js'

export type CorpusDocument = {
  /** Filename without extension. This is the id goldens refer to. */
  docId: string
  /** Absolute path on disk; becomes the Qdrant `source` payload. */
  path: string
  text: string
}

export type IngestSummary = {
  fingerprint: string
  documents: number
  chunks: number
  removedBeforeIngest: number
  failures: Array<{ docId: string; reason: string }>
}

/**
 * Owns the frozen evaluation corpus: reading it off disk, fingerprinting it,
 * and pushing it through NOMAD's real ingest path into the reserved
 * `__nomad_eval__` collection tag.
 *
 * Ingesting through `RagService.embedAndStoreText` rather than writing vectors
 * directly is the whole point — chunk size, the token-estimate ratio, the
 * search_document prefix, and the embedding model are all in scope of the
 * measurement, so a change to any of them shows up as a retrieval score
 * movement instead of hiding.
 */
@inject()
export class EvalCorpusService {
  constructor(private ragService: RagService) {}

  private corpusPath(): string {
    return resolve(join(process.cwd(), EVAL_CORPUS_DIR))
  }

  /** Read every markdown document in the corpus, sorted for determinism. */
  async loadCorpus(): Promise<CorpusDocument[]> {
    const dir = this.corpusPath()
    const entries = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()
    if (entries.length === 0) {
      throw new Error(`No corpus documents found in ${dir}`)
    }
    return Promise.all(
      entries.map(async (file) => {
        const path = join(dir, file)
        return { docId: basename(file, '.md'), path, text: await readFile(path, 'utf8') }
      })
    )
  }

  /**
   * Load and validate golden files, cross-checked against the corpus.
   *
   * Each `.jsonl` in the goldens directory is a *suite*, named after the file.
   * Only `core` loads by default. That matters for comparability: aggregate
   * metrics are means over whatever ran, so silently adding goldens to the
   * default set would move recall@k and correctness for reasons unrelated to any
   * change under test, and quietly invalidate every committed baseline. Opting
   * in keeps a suite's numbers separate until someone asks for them.
   */
  async loadGoldens(suites: string[] = [DEFAULT_GOLDEN_SUITE]): Promise<Golden[]> {
    const dir = resolve(join(process.cwd(), EVAL_GOLDENS_DIR))
    const available = (await readdir(dir)).filter((f) => f.endsWith('.jsonl')).sort()
    if (available.length === 0) throw new Error(`No golden files found in ${dir}`)

    // '*' loads every suite. Used by `eval:corpus`, which validates the fixtures
    // rather than measuring anything — a malformed golden should fail validation
    // whether or not its suite is part of the default run.
    const wanted = new Set(suites)
    const files = wanted.has('*')
      ? available
      : available.filter((f) => wanted.has(basename(f, '.jsonl')))
    if (files.length === 0) {
      throw new Error(
        `No golden suites matched [${suites.join(', ')}]. Available: ` +
          available.map((f) => basename(f, '.jsonl')).join(', ')
      )
    }

    const goldens: Golden[] = []
    const seen = new Set<string>()
    for (const file of files) {
      const parsed = parseGoldens(await readFile(join(dir, file), 'utf8'), file)
      for (const g of parsed) {
        // parseGoldens dedupes within a file; this catches collisions across files.
        if (seen.has(g.id)) throw new Error(`Duplicate golden id "${g.id}" in ${file}`)
        seen.add(g.id)
        goldens.push(g)
      }
    }

    const corpus = await this.loadCorpus()
    assertGoldensMatchCorpus(
      goldens,
      corpus.map((d) => d.docId)
    )
    return goldens
  }

  /**
   * Hash the corpus together with the ingest parameters that shaped it.
   * Reports carry this; two reports with different fingerprints are not
   * comparable and `eval:compare` refuses to pretend otherwise.
   */
  async fingerprint(): Promise<string> {
    const corpus = await this.loadCorpus()
    return computeCorpusFingerprint(
      {
        documents: new Map(corpus.map((d) => [d.docId, d.text])),
        chunkTokens: RagService.TARGET_TOKENS_PER_CHUNK,
        chunkOverlapTokens: RagService.CHUNK_OVERLAP_TOKENS,
        charToTokenRatio: RagService.CHAR_TO_TOKEN_RATIO,
        embeddingModel: EMBEDDING_MODEL_NAME,
        embeddingDimension: RagService.EMBEDDING_DIMENSION,
      },
      (input) => createHash('sha256').update(input).digest('hex')
    )
  }

  /** Remove every eval point. Never touches user content. */
  async reset(): Promise<number> {
    const removed = await this.ragService.deleteCollectionPoints(KB_EVAL_COLLECTION)
    logger.info(`[Eval] Removed ${removed} eval corpus chunks`)
    return removed
  }

  /** How many eval chunks are currently in the vector store. */
  async count(): Promise<number> {
    return this.ragService.countChunksInCollection(KB_EVAL_COLLECTION)
  }

  /**
   * Wipe and rebuild the eval corpus.
   *
   * Always a full rebuild: a partial re-ingest would leave the vector store in
   * a state no fingerprint describes, and a fingerprint that does not describe
   * the store is worse than no fingerprint at all.
   */
  async ingest(onProgress?: (docId: string, index: number, total: number) => void): Promise<IngestSummary> {
    const corpus = await this.loadCorpus()
    const removedBeforeIngest = await this.reset()

    let chunks = 0
    const failures: IngestSummary['failures'] = []

    for (const [index, doc] of corpus.entries()) {
      onProgress?.(doc.docId, index + 1, corpus.length)
      try {
        const result = await this.ragService.embedAndStoreText(doc.text, {
          source: doc.path,
          collection: KB_EVAL_COLLECTION,
        })
        if (!result) {
          failures.push({ docId: doc.docId, reason: 'embedAndStoreText returned null' })
          continue
        }
        chunks += result.chunks
      } catch (error) {
        failures.push({ docId: doc.docId, reason: error instanceof Error ? error.message : String(error) })
      }
    }

    return {
      fingerprint: await this.fingerprint(),
      documents: corpus.length,
      chunks,
      removedBeforeIngest,
      failures,
    }
  }
}
