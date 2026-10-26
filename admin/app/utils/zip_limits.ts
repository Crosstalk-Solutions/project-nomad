import JSZip from 'jszip'

export const ZIP_MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024
export const ZIP_MAX_RATIO = 100
// Small, very repetitive XML can legitimately compress past 100:1, so the ratio
// only counts once the archive inflates to something that could hurt.
export const ZIP_RATIO_MIN_BYTES = 10 * 1024 * 1024

export class ZipLimitError extends Error {}

/** Returns why an archive is too big to inflate, or null when it is within limits. */
export function checkZipSize(compressedBytes: number, uncompressedBytes: number): string | null {
  if (uncompressedBytes > ZIP_MAX_UNCOMPRESSED_BYTES) {
    return `Archive inflates to more than ${ZIP_MAX_UNCOMPRESSED_BYTES / 1024 / 1024} MB`
  }
  if (
    uncompressedBytes > ZIP_RATIO_MIN_BYTES &&
    uncompressedBytes / Math.max(compressedBytes, 1) > ZIP_MAX_RATIO
  ) {
    return `Archive compression ratio exceeds ${ZIP_MAX_RATIO}:1`
  }
  return null
}

/** Inflates one entry, counting bytes and discarding them; rejects past `budget`. */
function countEntryBytes(file: JSZip.JSZipObject, budget: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let total = 0
    const stream = file.nodeStream('nodebuffer')
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > budget) {
        stream.pause()
        reject(new ZipLimitError(`Archive inflates to more than ${ZIP_MAX_UNCOMPRESSED_BYTES / 1024 / 1024} MB`))
      }
    })
    stream.on('end', () => resolve(total))
    stream.on('error', reject)
  })
}

/**
 * Zip-bomb guard for ZIP-based documents (EPUB, DOCX). Checks the sizes the
 * archive declares first (cheap), then the real inflated size by streaming every
 * entry through a counter, since the declared sizes come from the untrusted
 * header. Memory stays bounded either way. Throws ZipLimitError.
 */
export async function assertZipWithinLimits(zip: JSZip, compressedBytes: number): Promise<void> {
  const files = Object.values(zip.files).filter((f) => !f.dir)

  // JSZip has no public accessor for the declared size; `_data` is its internal
  // CompressedObject, read straight from the central directory.
  const declared = files.reduce(
    (sum, f) => sum + ((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0),
    0
  )
  const declaredProblem = checkZipSize(compressedBytes, declared)
  if (declaredProblem) throw new ZipLimitError(declaredProblem)

  let actual = 0
  for (const file of files) {
    actual += await countEntryBytes(file, ZIP_MAX_UNCOMPRESSED_BYTES - actual)
  }
  const actualProblem = checkZipSize(compressedBytes, actual)
  if (actualProblem) throw new ZipLimitError(actualProblem)
}
