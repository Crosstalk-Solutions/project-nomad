import { sep } from 'node:path'

/**
 * Decision for the reverse sweep in `RagService.scanAndSyncStorage`.
 *
 * This is the pure, I/O-free core of the orphan check described in issue
 * #1170: `scanAndSyncStorage` already builds `sourcesInQdrant` (from a facet
 * query) and `embeddableFiles` (from a disk scan) in the same pass, but only
 * ever asked "is this on-disk file already embedded?" — never the reverse
 * "does this Qdrant source still have a file on disk?" Sources left behind by
 * `ZimService.delete()` (which never touched Qdrant) or by
 * `reconcileReplacedContentFile`'s `qdrant_not_running` no-op therefore never
 * got reaped.
 *
 * Guarded so a transient failure can't be misread as "every file was
 * deleted": if the disk scan came back empty, we return `null` (do nothing)
 * rather than treating every indexed source as an orphan. An empty
 * `embeddableFiles` list is indistinguishable from a filesystem hiccup, and
 * the blast radius of wrongly deleting a healthy knowledge base outweighs the
 * cost of skipping a sweep for one cycle.
 */
export function decideOrphans(
  sourcesInQdrant: string[],
  embeddableFiles: string[]
): string[] | null {
  if (embeddableFiles.length === 0) return null

  const onDisk = new Set(embeddableFiles)
  return sourcesInQdrant.filter((source) => !onDisk.has(source))
}

/**
 * Narrows Qdrant sources down to the ones decideOrphans() can actually make an
 * informed call about: sources under a root the disk scan genuinely walked.
 *
 * `scannedRoots` is deliberately the roots that were *walked*, not the roots
 * that were *configured*. Two different failure modes collapse into that one
 * rule:
 *
 * 1. A source root outside the scan entirely — Nomad's own bundled docs
 *    (README.md + docs/), or any root added in future. Allowlisting rather
 *    than denylisting those by name means a new root doesn't get treated as
 *    orphaned the first time it appears (see #1170's docs-collision near-miss).
 *
 * 2. A configured root that wasn't there at scan time. `_discoverKbFiles()`
 *    skips a missing root rather than failing, so a relocated or not-yet-
 *    mounted zim directory (#1050) still leaves the scan non-empty via
 *    kb_uploads. decideOrphans' empty-scan guard doesn't fire, and without
 *    this filter every ZIM in the index would be purged in one batch. A root
 *    we couldn't read tells us nothing about what belongs under it.
 *
 * Passing an empty `scannedRoots` therefore yields no candidates, which is the
 * correct reading of "we couldn't see any of the storage."
 */
export function filterOrphanCandidates(
  sourcesInQdrant: string[],
  scannedRoots: string[]
): string[] {
  // The trailing separator is what makes this a subpath test rather than a
  // naive string prefix match, so `<root>-backup/x.zim` doesn't qualify.
  const prefixes = scannedRoots.map((root) => root + sep)
  if (prefixes.length === 0) return []
  return sourcesInQdrant.filter((source) => prefixes.some((prefix) => source.startsWith(prefix)))
}
