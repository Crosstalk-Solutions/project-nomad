/**
 * Allocated output bytes for extraction progress (adapted from upstream PR #1481).
 * A sparse PMTiles output can have its final logical size before its data is
 * written. Filesystem block counts use 512-byte units, not stats.blksize.
 * Logical size remains the completed archive size; this is only a progress hint.
 */
export function getAllocatedBytes(stats: { size: number | bigint; blocks?: number | bigint }): number {
  const size = Number(stats.size)
  if (!Number.isFinite(size) || size < 0) return 0
  if (stats.blocks === undefined) return size
  const blocks = Number(stats.blocks)
  // Some platforms do not provide usable block information. Zero, however,
  // is valid for a freshly truncated sparse file and must not fall back to size.
  if (!Number.isFinite(blocks) || !Number.isInteger(blocks) || blocks < 0) return size
  const allocated = blocks * 512
  return Number.isFinite(allocated) ? Math.min(size, allocated) : size
}
