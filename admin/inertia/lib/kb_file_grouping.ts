/**
 * Knowledge-base files come back as a flat list of source paths from
 * `/api/rag/files`. The UI groups them so the user sees the categories that
 * matter to them — ZIMs, uploaded documents, and a single rolled-up entry for
 * Project NOMAD's bundled docs (rather than the 12+ individual markdown files
 * those break into).
 *
 * Bucket assignment is purely by path prefix; matching is done on `/` so the
 * server-emitted absolute paths work regardless of which Linux mount the admin
 * container uses.
 */
export type KbFileBucket = 'zim' | 'upload' | 'admin_docs' | 'other'

const ADMIN_DOCS_PREFIXES = ['/app/docs/', '/app/README.md']
const ZIM_PREFIX = '/app/storage/zim/'
const UPLOADS_PREFIX = '/app/storage/kb_uploads/'

export function classifyKbFile(source: string): KbFileBucket {
  if (
    ADMIN_DOCS_PREFIXES.some((p) =>
      p.endsWith('/') ? source.startsWith(p) : source === p
    )
  ) {
    return 'admin_docs'
  }
  if (source.startsWith(ZIM_PREFIX)) return 'zim'
  if (source.startsWith(UPLOADS_PREFIX)) return 'upload'
  return 'other'
}

export function sourceToDisplayName(source: string): string {
  const parts = source.split(/[/\\]/)
  return parts[parts.length - 1] || source
}

export interface KbFileGroup {
  bucket: KbFileBucket
  /** Source path used as the row's stable React key. For collapsed admin docs
   * this is a synthetic marker; individual file paths live in `members`. */
  source: string
  displayName: string
  /** Number of underlying files this row represents (1 for non-collapsed). */
  count: number
  /** All member source paths — populated for collapsed groups, empty otherwise. */
  members: string[]
}

const BUCKET_SORT_ORDER: KbFileBucket[] = ['zim', 'upload', 'admin_docs', 'other']

/**
 * Group raw source paths into rows for the Stored Files table.
 *
 * - Admin docs (`/app/docs/*`, README) collapse into a single
 *   "Project NOMAD documentation · N files" row.
 * - ZIMs, uploads, and others stay as individual rows, sorted by bucket then
 *   alphabetically by filename so related items cluster naturally.
 */
export function groupAndSortKbFiles(sources: string[]): KbFileGroup[] {
  const buckets: Record<KbFileBucket, string[]> = {
    zim: [],
    upload: [],
    admin_docs: [],
    other: [],
  }
  for (const source of sources) {
    buckets[classifyKbFile(source)].push(source)
  }

  const groups: KbFileGroup[] = []

  for (const bucket of BUCKET_SORT_ORDER) {
    const members = buckets[bucket]
    if (members.length === 0) continue

    if (bucket === 'admin_docs') {
      groups.push({
        bucket,
        source: '__admin_docs_group__',
        displayName: `Project NOMAD documentation · ${members.length} file${members.length === 1 ? '' : 's'}`,
        count: members.length,
        members,
      })
      continue
    }

    for (const source of members.sort((a, b) =>
      sourceToDisplayName(a).localeCompare(sourceToDisplayName(b))
    )) {
      groups.push({
        bucket,
        source,
        displayName: sourceToDisplayName(source),
        count: 1,
        members: [],
      })
    }
  }

  return groups
}
