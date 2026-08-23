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
export function decideOrphans(sourcesInQdrant: string[], embeddableFiles: string[]): string[] | null {
  if (embeddableFiles.length === 0) return null

  const onDisk = new Set(embeddableFiles)
  return sourcesInQdrant.filter((source) => !onDisk.has(source))
}

/**
 * Narrows Qdrant sources down to the ones decideOrphans() can actually make
 * an informed call about: sources under the same roots `_discoverKbFiles()`
 * scanned to build `embeddableFiles` (kb_uploads, zim). Everything else —
 * Nomad's own bundled docs (README.md + docs/), or any future embedding
 * source root — is left alone here rather than denylisted by name, so a new
 * source root added outside kb_uploads/zim doesn't get treated as an orphan
 * and purged the first time it appears (see issue #1170's docs-collision
 * near-miss for exactly that failure mode).
 */
export function filterOrphanCandidates(
  sourcesInQdrant: string[],
  scanRoots: { kbUploadsPath: string; zimPath: string }
): string[] {
  const kbUploadsPrefix = scanRoots.kbUploadsPath + sep
  const zimPrefix = scanRoots.zimPath + sep
  return sourcesInQdrant.filter(
    (source) => source.startsWith(kbUploadsPrefix) || source.startsWith(zimPrefix)
  )
}
