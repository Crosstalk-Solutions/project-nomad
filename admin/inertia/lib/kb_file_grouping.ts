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
  if (ADMIN_DOCS_PREFIXES.some((p) => (p.endsWith('/') ? source.startsWith(p) : source === p))) {
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
   * or a KB-collection header this is a synthetic marker; individual file
   * paths live in `members`. */
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
  /** Subject/category (KB collection) tag, or null if uncategorized. Always
   * null for the collapsed admin_docs group. Not to be confused with the
   * unrelated curated ZIM-pack "collections" feature elsewhere in the app. */
  collection: string | null
  /** Whether this file's chunks are included in RAG search results. Always
   * true (non-toggleable) for the collapsed admin_docs group. */
  active: boolean
  /** True for a collapsible per-KB-collection header row that clusters
   * upload-bucket files sharing a `collection` tag (or the "Uncategorized"
   * bucket for `collection: null` files). Undefined for ordinary file rows
   * and the admin_docs group. */
  isCollectionHeader?: boolean
  /** Aggregate active state across a header row's members. Only set when
   * `isCollectionHeader` is true. */
  collectionActiveState?: 'all-active' | 'all-inactive' | 'mixed'
}

/** Sentinel key (not a valid `collection` value — `sanitizeCollectionName`
 * never produces an empty string) used to group and expand/collapse
 * upload-bucket files with `collection: null` under an "Uncategorized"
 * header, and as the header row's `collection` lookup key from the UI. */
export const UNCATEGORIZED_COLLECTION_KEY = ''

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
  const aMissing =
    sort.key !== 'name' && (sort.key === 'size' ? a.size === null : a.uploadedAt === null)
  const bMissing =
    sort.key !== 'name' && (sort.key === 'size' ? b.size === null : b.uploadedAt === null)
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

/** Build the synthetic React key for a KB-collection header row. */
function collectionHeaderKey(collectionKey: string): string {
  return `__collection_header__:${collectionKey}`
}

/**
 * Group stored-file rows into table rows for the Stored Files panel.
 *
 * - Admin docs (`/app/docs/*`, README) collapse into a single
 *   "Project NOMAD documentation · N files" row.
 * - Upload-bucket files (personal uploads) are clustered under a collapsible
 *   header row per KB-collection tag -- including an "Uncategorized" header
 *   for files with no tag -- so a user with many uploads doesn't see one flat
 *   row per file. A header's members only appear as individual rows when its
 *   key is present in `expandedCollections`; collapsed is the default so the
 *   grouping actually declutters the panel rather than just adding a label.
 * - ZIMs and others stay as individual rows, sorted within their bucket by
 *   the active sort key. Bucket order itself is fixed, and collection headers
 *   within the upload bucket are always ordered alphabetically (Uncategorized
 *   last) regardless of sort -- sorting only ever reorders files *within* a
 *   group, never the groups themselves.
 */
export function groupAndSortKbFiles(
  files: StoredFileInfo[],
  sort: KbFileSort = DEFAULT_SORT,
  expandedCollections: ReadonlySet<string> = new Set()
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
        collection: null,
        active: true,
      })
      continue
    }

    if (bucket === 'upload') {
      const byCollection = new Map<string, StoredFileInfo[]>()
      for (const file of members) {
        const key = file.collection ?? UNCATEGORIZED_COLLECTION_KEY
        const bucketMembers = byCollection.get(key)
        if (bucketMembers) {
          bucketMembers.push(file)
        } else {
          byCollection.set(key, [file])
        }
      }

      const collectionKeys = Array.from(byCollection.keys()).sort((a, b) => {
        if (a === UNCATEGORIZED_COLLECTION_KEY) return 1
        if (b === UNCATEGORIZED_COLLECTION_KEY) return -1
        return a.localeCompare(b)
      })

      for (const key of collectionKeys) {
        const groupMembers = byCollection.get(key)!
        const collectionName = key === UNCATEGORIZED_COLLECTION_KEY ? null : key
        const label = collectionName ?? 'Uncategorized'
        const activeCount = groupMembers.filter((m) => m.active).length
        const collectionActiveState: KbFileGroup['collectionActiveState'] =
          activeCount === 0
            ? 'all-inactive'
            : activeCount === groupMembers.length
              ? 'all-active'
              : 'mixed'

        groups.push({
          bucket,
          source: collectionHeaderKey(key),
          displayName: `${label} · ${groupMembers.length} file${groupMembers.length === 1 ? '' : 's'}`,
          count: groupMembers.length,
          members: groupMembers.map((m) => m.source),
          state: null,
          chunksEmbedded: 0,
          size: null,
          uploadedAt: null,
          isUserUpload: false,
          collection: collectionName,
          active: collectionActiveState !== 'all-inactive',
          isCollectionHeader: true,
          collectionActiveState,
        })

        if (!expandedCollections.has(key)) continue

        for (const file of groupMembers.sort((a, b) => compareForSort(a, b, sort))) {
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
            collection: file.collection,
            active: file.active,
          })
        }
      }
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
        collection: file.collection,
        active: file.active,
      })
    }
  }

  return groups
}
