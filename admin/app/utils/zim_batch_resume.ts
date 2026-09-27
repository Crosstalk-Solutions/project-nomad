/**
 * Resume cursor for batched ZIM extraction.
 *
 * The cursor is how many dirents `iterByPath()` has already finished. That
 * range does not start at `entry.index` (user entries begin at the 'C'
 * namespace), and `findByPath` is a prefix search that usually returns only
 * the article just embedded. `offset(cursor, size)` seeks within the range.
 */

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
  // `size` reaches the end of the range. libzim takes a signed 32-bit
  // maxResults, and a real archive's entry count fits in that.
  return range.offset(resumeAtDirent, range.size)
}
