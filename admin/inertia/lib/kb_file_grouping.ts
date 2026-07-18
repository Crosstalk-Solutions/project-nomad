import type { KbIngestStateValue } from '../../types/kb_ingest_state.js'
import type { StoredFileInfo } from '../../types/rag.js'

/**
 * Knowledge-base files come back as a list of `{source, state, chunksEmbedded}`
 * objects from `/api/rag/files`. The UI groups them so the user sees the
 * categories that matter to them — ZIMs, uploaded documents, and a single
 * rolled-up entry for Project NOMAD's bundled docs (rather than the 12+
 * individual markdown files those break into).
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
  /** Per-file ingestion state. `null` for the collapsed admin_docs group and
   * for any source that exists in Qdrant but has no state row yet. */
  state: KbIngestStateValue | null
  /** Chunks currently embedded for this source; 0 for state-row-less or
   * zero-chunk files. Always 0 for the collapsed admin_docs group. */
  chunksEmbedded: number
  /** File size in bytes from disk. Null for the collapsed admin_docs group,
   * and for any file the scanner couldn't stat. */
  size: number | null
  /** Last-modified timestamp (ISO 8601). Null for collapsed groups and for
   * files the scanner couldn't stat. */
  uploadedAt: string | null
  /** True when the row corresponds to a user upload — drives whether the
   * view/download buttons render. False for the collapsed admin_docs group. */
  isUserUpload: boolean
}

const BUCKET_SORT_ORDER: KbFileBucket[] = ['zim', 'upload', 'admin_docs', 'other']

export type KbFileSortKey = 'name' | 'size' | 'uploadedAt'
export type KbFileSortDirection = 'asc' | 'desc'
export interface KbFileSort {
  key: KbFileSortKey
  direction: KbFileSortDirection
}

const DEFAULT_SORT: KbFileSort = { key: 'name', direction: 'asc' }

function compareForSort(a: StoredFileInfo, b: StoredFileInfo, sort: KbFileSort): number {
  // Files the scanner couldn't stat sort to the end regardless of direction so
  // they don't pollute the top of size/uploaded-at views.
  const aMissing = sort.key !== 'name' && (sort.key === 'size' ? a.size === null : a.uploadedAt === null)
  const bMissing = sort.key !== 'name' && (sort.key === 'size' ? b.size === null : b.uploadedAt === null)
  if (aMissing && !bMissing) return 1
  if (!aMissing && bMissing) return -1

  let cmp = 0
  if (sort.key === 'size') {
    cmp = (a.size ?? 0) - (b.size ?? 0)
  } else if (sort.key === 'uploadedAt') {
    cmp = (a.uploadedAt ?? '').localeCompare(b.uploadedAt ?? '')
  }
  if (cmp === 0) {
    // Tiebreak (and primary key for 'name') is filename — keeps stable order.
    cmp = sourceToDisplayName(a.source).localeCompare(sourceToDisplayName(b.source))
  }
  return sort.direction === 'desc' ? -cmp : cmp
}

/**
 * Group stored-file rows into table rows for the Stored Files panel.
 *
 * - Admin docs (`/app/docs/*`, README) collapse into a single
 *   "Project NOMAD documentation · N files" row.
 * - ZIMs, uploads, and others stay as individual rows, sorted within their
 *   bucket by the active sort key. Bucket order itself is fixed — sorting
 *   never flattens or reorders the groups themselves.
 */
export function groupAndSortKbFiles(
  files: StoredFileInfo[],
  sort: KbFileSort = DEFAULT_SORT
): KbFileGroup[] {
  const buckets: Record<KbFileBucket, StoredFileInfo[]> = {
    zim: [],
    upload: [],
    admin_docs: [],
    other: [],
  }
  for (const file of files) {
    buckets[classifyKbFile(file.source)].push(file)
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
        members: members.map((m) => m.source),
        state: null,
        chunksEmbedded: 0,
        size: null,
        uploadedAt: null,
        isUserUpload: false,
      })
      continue
    }

    for (const file of members.sort((a, b) => compareForSort(a, b, sort))) {
      groups.push({
        bucket,
        source: file.source,
        displayName: sourceToDisplayName(file.source),
        count: 1,
        members: [],
        state: file.state,
        chunksEmbedded: file.chunksEmbedded,
        size: file.size,
        uploadedAt: file.uploadedAt,
        isUserUpload: file.isUserUpload,
      })
    }
  }

  return groups
}
