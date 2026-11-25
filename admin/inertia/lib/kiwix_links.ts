/**
 * Build a link that opens one article inside its ZIM archive in Kiwix.
 *
 * Kiwix serves each archive under `/content/<book name>/`, where the book name is
 * the ZIM file name without its `.zim` extension. `source` is the path the
 * Knowledge Base stored for the archive (e.g. `/app/storage/zim/foo_2026-01.zim`).
 * Returns null when there is nothing safe to link to.
 */
export function kiwixArticleUrl(
  kiwixBaseUrl: string | null | undefined,
  source: string | null | undefined,
  articlePath: string | null | undefined
): string | null {
  if (!kiwixBaseUrl || !source || !articlePath) return null
  const file = source.split('/').pop() || ''
  if (!file.toLowerCase().endsWith('.zim')) return null
  const book = file.slice(0, -'.zim'.length)
  if (!book) return null
  const encodedPath = articlePath
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${kiwixBaseUrl.replace(/\/+$/, '')}/content/${encodeURIComponent(book)}/${encodedPath}`
}
