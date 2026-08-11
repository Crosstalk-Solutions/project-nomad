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
