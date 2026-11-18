/**
 * Resume cursor for batched ZIM extraction.
 *
 * The cursor is how many dirents `iterByPath()` has already finished. That
 * range does not start at `entry.index` (user entries begin at the 'C'
 * namespace), and `findByPath` is a prefix search that usually returns only
 * the article just embedded. `offset(cursor, size)` seeks within the range.
 */

import { UnrecoverableError } from 'bullmq'

export type SeekableEntryRange<T> = Iterable<T> & {
  size: number
  offset(start: number, maxResults: number): Iterable<T>
}

export function hasResumeCursor(cursor: number | undefined): cursor is number {
  return typeof cursor === 'number' && Number.isInteger(cursor) && cursor > 0
}

export function openZimBatchRange<T>(
  archive: { iterByPath(): SeekableEntryRange<T> },
  resumeAtDirent?: number
): Iterable<T> {
  const range = archive.iterByPath()
  if (!hasResumeCursor(resumeAtDirent)) return range
  // An empty seek at a valid cursor is a normal end. A cursor past the end
  // means the file changed under the job, and retrying cannot fix that.
  if (resumeAtDirent > range.size) {
    throw new UnrecoverableError(
      `ZIM resume cursor ${resumeAtDirent} is past the end of the archive (${range.size} entries); the file changed since the last batch`
    )
  }
  // `size` reaches the end of the range. libzim takes a signed 32-bit
  // maxResults, and a real archive's entry count fits in that.
  return range.offset(resumeAtDirent, range.size)
}
