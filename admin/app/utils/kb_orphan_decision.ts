import { sep } from 'node:path'

/**
 * Past this share of a root's indexed sources, a single sync refuses to purge
 * that root at all. Losing most of a root at once is far likelier to mean the
 * root points somewhere wrong (a different disk, a stale copy, a half-finished
 * data-path move per #1050) than that the user deleted most of their library
 * by hand. Real deletions through the UI purge their own vectors immediately
 * (ZimService.delete, deleteFileBySource), so the sweep only ever mops up
 * stragglers and has no business removing the bulk of a root.
 */
export const ORPHAN_PURGE_MAX_FRACTION = 0.5

/**
 * The mass-removal guard only engages once this many sources would go. Below
 * it, the fraction is too noisy to mean anything (1 of 2 is 50%) and the cost
 * of a wrong purge is a few minutes of re-embedding, not hours.
 */
export const ORPHAN_PURGE_MIN_GUARDED = 5

export type WithheldOrphans = {
  /** Scan root whose orphans were left in place. */
  root: string
  /** How many indexed sources under it would have been purged. */
  count: number
  /**
   * `empty_root`: the root was walked but held no embeddable files.
   * `mass_removal`: the purge would remove more than ORPHAN_PURGE_MAX_FRACTION
   * of the root's indexed sources.
   */
  reason: 'empty_root' | 'mass_removal'
}

export type OrphanDecision = {
  /** Sources safe to purge. */
  orphans: string[]
  /** Roots whose missing sources were held back, for the operator to see. */
  withheld: WithheldOrphans[]
}

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
 * Decided per scanned root, because the roots fail independently. Two guards
 * apply to each, and either one withholds the whole root for this cycle:
 *
 * 1. A root with zero embeddable files keeps its sources (#1378). Walking a
 *    directory successfully does not prove it holds the content: boot runs
 *    ensureDirectoryExists() on the zim root, so a separate volume that
 *    failed to mount leaves a real, empty mountpoint behind (often holding a
 *    freshly regenerated kiwix-library.xml, which is why this counts
 *    embeddable files rather than directory entries). An empty root is
 *    indistinguishable from an unmounted one, and a single upload in
 *    kb_uploads is enough to make the overall scan non-empty.
 *
 * 2. A purge that would remove more than ORPHAN_PURGE_MAX_FRACTION of a
 *    root's indexed sources (and at least ORPHAN_PURGE_MIN_GUARDED of them) is
 *    withheld. This catches the root pointing at the wrong place while still
 *    holding a few files, which guard 1 can't see.
 *
 * Both guards trade a missed cleanup for safety: re-embedding a wrongly purged
 * library takes hours to days, while a stale source costs nothing until the
 * next sync or an explicit reset.
 */
export function decideOrphans(
  sourcesInQdrant: string[],
  embeddableFiles: string[],
  scannedRoots: string[]
): OrphanDecision {
  const onDisk = new Set(embeddableFiles)
  const orphans: string[] = []
  const withheld: WithheldOrphans[] = []

  for (const root of scannedRoots) {
    const indexed = filterOrphanCandidates(sourcesInQdrant, [root])
    const missing = indexed.filter((source) => !onDisk.has(source))
    if (missing.length === 0) continue

    if (filterOrphanCandidates(embeddableFiles, [root]).length === 0) {
      withheld.push({ root, count: missing.length, reason: 'empty_root' })
      continue
    }

    if (
      missing.length >= ORPHAN_PURGE_MIN_GUARDED &&
      missing.length / indexed.length > ORPHAN_PURGE_MAX_FRACTION
    ) {
      withheld.push({ root, count: missing.length, reason: 'mass_removal' })
      continue
    }

    orphans.push(...missing)
  }

  return { orphans, withheld }
}

/**
 * Narrows paths down to the ones under a root the disk scan genuinely walked.
 * decideOrphans() applies it per root, both to Qdrant sources and to the files
 * found on disk.
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
 *    kb_uploads. A root we couldn't read tells us nothing about what belongs
 *    under it. (A root that exists but is empty is the same problem one step
 *    removed; decideOrphans' per-root guard handles that, see #1378.)
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
