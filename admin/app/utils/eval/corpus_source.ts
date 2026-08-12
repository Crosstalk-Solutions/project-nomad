import { basename, join, resolve, sep } from 'node:path'

/** Where the frozen corpus lives, relative to the app root. */
export const EVAL_CORPUS_DIR = 'tests/eval/corpus'

/**
 * Map a retrieved chunk's `source` payload back to its corpus document id, or
 * null if the chunk did not come from the eval corpus.
 *
 * The eval corpus shares the `nomad_knowledge_base` Qdrant collection with the
 * developer's real documents — NOMAD "collections" are a payload tag, not
 * separate Qdrant collections — and is isolated by a
 * `collection: __nomad_eval__` filter that Qdrant applies during search. That
 * filter does hold, but a harness whose every number depends on a filter should
 * be able to *prove* the filter held rather than assume it. This function is
 * that proof: the caller counts every unresolved chunk and fails the run if the
 * count is non-zero.
 *
 * The check is on the resolved **path**, not the file extension. An earlier
 * version accepted any `*.md`, which was worse than useless here: NOMAD embeds
 * its own `admin/docs/*.md` into the knowledge base on first run, so a leaked
 * `faq.md` would have resolved to the plausible-looking document id "faq", been
 * counted as a merely-irrelevant chunk, and quietly depressed precision with no
 * indication that anything had gone wrong.
 *
 * Mirrors the resolve-then-prefix-check guard in `RagService.resolveUploadPath`.
 * `corpusDir` is injectable so this stays testable without a real corpus on disk.
 */
export function docIdFromSource(source: unknown, corpusDir?: string): string | null {
  if (typeof source !== 'string') return null
  const dir = resolve(corpusDir ?? join(process.cwd(), EVAL_CORPUS_DIR))
  const abs = resolve(source)
  // The trailing separator matters: without it, a sibling directory such as
  // "…/corpus-backup" shares a string prefix with "…/corpus" and would pass.
  if (!abs.startsWith(dir + sep)) return null
  if (!abs.endsWith('.md')) return null
  return basename(abs, '.md')
}
