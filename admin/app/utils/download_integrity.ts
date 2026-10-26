/** Parsed `Content-Range: bytes <start>-<end>/<total>` header (total is null for `*`). */
export interface ContentRange {
  start: number
  end: number
  total: number | null
}

export function parseContentRange(header: string | undefined | null): ContentRange | null {
  const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(String(header ?? '').trim())
  if (!match) return null
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    total: match[3] === '*' ? null : Number(match[3]),
  }
}

/**
 * True when a 206 response really continues the partial file we hold: it starts exactly where the
 * .tmp ends and belongs to a file of the size the HEAD reported. A redirect to another mirror (or a
 * publisher replacing the file under the same name) can answer with a different range or file;
 * appending that would splice two files together.
 */
export function isMatchingResume(header: string | undefined | null, startByte: number, totalBytes: number): boolean {
  const range = parseContentRange(header)
  if (!range || range.start !== startByte) return false
  return !(totalBytes > 0 && range.total !== null && range.total !== totalBytes)
}

export type DownloadCompleteness = 'complete' | 'short' | 'oversized'

/** Classify a finished stream. An unknown size (0, no Content-Length) cannot be checked. */
export function checkDownloadedSize(downloadedBytes: number, totalBytes: number): DownloadCompleteness {
  if (totalBytes <= 0 || downloadedBytes === totalBytes) return 'complete'
  return downloadedBytes < totalBytes ? 'short' : 'oversized'
}

/** Free space always left after a download, so MySQL, Redis and logs on the same disk keep working. */
export const DOWNLOAD_FREE_SPACE_HEADROOM_BYTES = 2 * 1024 ** 3 // 2 GiB

export function hasRoomForDownload(
  remainingBytes: number,
  freeBytes: number,
  headroomBytes = DOWNLOAD_FREE_SPACE_HEADROOM_BYTES
): boolean {
  return remainingBytes + headroomBytes <= freeBytes
}

export function formatGiB(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`
}
