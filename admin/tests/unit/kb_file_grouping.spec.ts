import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  classifyKbFile,
  groupAndSortKbFiles,
  sourceToDisplayName,
  UNCATEGORIZED_COLLECTION_KEY,
} from '../../inertia/lib/kb_file_grouping.js'
import type { StoredFileInfo } from '../../types/rag.js'

/** Wrap source paths into the minimal StoredFileInfo shape that
 * `groupAndSortKbFiles` now expects. State + chunk count are irrelevant to
 * grouping/sorting behavior; the per-file state-pill rendering is exercised
 * separately in the modal's component tests (added in the follow-up PR).
 * Metadata fields default to nullish/false — individual tests that exercise
 * sort-by-size or sort-by-uploadedAt override as needed. */
const asInfos = (sources: string[]): StoredFileInfo[] =>
  sources.map((source) => ({
    source,
    state: null,
    chunksEmbedded: 0,
    fileName: sourceToDisplayName(source),
    size: null,
    uploadedAt: null,
    isUserUpload: classifyKbFile(source) === 'upload',
    collection: null,
    active: true,
  }))

test('classifyKbFile distinguishes ZIM, upload, admin_docs, and other', () => {
  assert.equal(classifyKbFile('/app/storage/zim/devdocs_en_python_2026-02.zim'), 'zim')
  assert.equal(classifyKbFile('/app/storage/kb_uploads/federalist.txt-8cc4ec95aa8f.txt'), 'upload')
  assert.equal(classifyKbFile('/app/docs/release-notes.md'), 'admin_docs')
  assert.equal(classifyKbFile('/app/README.md'), 'admin_docs')
  assert.equal(classifyKbFile('/unexpected/path/file.txt'), 'other')
})

test('classifyKbFile does not match /app/READMEs that are not the bundled one', () => {
  assert.equal(classifyKbFile('/app/README.md.bak'), 'other')
})

test('sourceToDisplayName returns the basename', () => {
  assert.equal(
    sourceToDisplayName('/app/storage/zim/devdocs_en_python_2026-02.zim'),
    'devdocs_en_python_2026-02.zim'
  )
  assert.equal(sourceToDisplayName('/app/docs/release-notes.md'), 'release-notes.md')
})

test('groupAndSortKbFiles collapses all admin docs into a single row', () => {
  const groups = groupAndSortKbFiles(
    asInfos([
      '/app/docs/release-notes.md',
      '/app/docs/getting-started.md',
      '/app/docs/maps.md',
      '/app/README.md',
    ])
  )

  assert.equal(groups.length, 1)
  assert.equal(groups[0].bucket, 'admin_docs')
  assert.equal(groups[0].count, 4)
  assert.equal(groups[0].displayName, 'Project NOMAD documentation · 4 files')
  assert.deepEqual(groups[0].members.sort(), [
    '/app/README.md',
    '/app/docs/getting-started.md',
    '/app/docs/maps.md',
    '/app/docs/release-notes.md',
  ])
})

test('groupAndSortKbFiles orders buckets ZIM → upload → admin_docs → other', () => {
  const groups = groupAndSortKbFiles(
    asInfos([
      '/app/docs/release-notes.md',
      '/unexpected/foo.txt',
      '/app/storage/kb_uploads/upload.pdf',
      '/app/storage/zim/devdocs.zim',
    ])
  )

  assert.deepEqual(
    groups.map((g) => g.bucket),
    ['zim', 'upload', 'admin_docs', 'other']
  )
})

test('groupAndSortKbFiles alphabetizes within a bucket', () => {
  const groups = groupAndSortKbFiles(
    asInfos([
      '/app/storage/zim/wikipedia.zim',
      '/app/storage/zim/devdocs.zim',
      '/app/storage/zim/ifixit.zim',
    ])
  )

  assert.deepEqual(
    groups.map((g) => g.displayName),
    ['devdocs.zim', 'ifixit.zim', 'wikipedia.zim']
  )
})

test('groupAndSortKbFiles uses singular noun when only one admin doc exists', () => {
  const groups = groupAndSortKbFiles(asInfos(['/app/docs/release-notes.md']))
  assert.equal(groups[0].displayName, 'Project NOMAD documentation · 1 file')
})

test('groupAndSortKbFiles handles empty input', () => {
  assert.deepEqual(groupAndSortKbFiles([]), [])
})

test('groupAndSortKbFiles preserves a stable synthetic key for the admin docs group', () => {
  const groups = groupAndSortKbFiles(asInfos(['/app/docs/release-notes.md', '/app/docs/maps.md']))
  // The admin-docs row uses a synthetic source key (not a real path) so it
  // can be used as a React key without colliding with any real file row.
  assert.equal(groups[0].source, '__admin_docs_group__')
})

/** Sized fixtures for the sort tests. `size` and `uploadedAt` are set so the
 * three sort keys (name, size, uploadedAt) produce visibly different orders —
 * if a test passed for name it had better fail for size. */
const sized: StoredFileInfo[] = [
  {
    source: '/app/storage/kb_uploads/charlie.txt',
    state: null,
    chunksEmbedded: 0,
    fileName: 'charlie.txt',
    size: 100,
    uploadedAt: '2026-01-01T00:00:00Z',
    isUserUpload: true,
    collection: null,
    active: true,
  },
  {
    source: '/app/storage/kb_uploads/alpha.txt',
    state: null,
    chunksEmbedded: 0,
    fileName: 'alpha.txt',
    size: 300,
    uploadedAt: '2026-03-01T00:00:00Z',
    isUserUpload: true,
    collection: null,
    active: true,
  },
  {
    source: '/app/storage/kb_uploads/bravo.txt',
    state: null,
    chunksEmbedded: 0,
    fileName: 'bravo.txt',
    size: 200,
    uploadedAt: '2026-02-01T00:00:00Z',
    isUserUpload: true,
    collection: null,
    active: true,
  },
]

// These fixtures are all `collection: null`, so they land in a single
// "Uncategorized" header row that must be expanded (via
// UNCATEGORIZED_COLLECTION_KEY) to see the sorted member rows.
const expandUncategorized = new Set([UNCATEGORIZED_COLLECTION_KEY])
const fileRowsOf = (groups: ReturnType<typeof groupAndSortKbFiles>) =>
  groups.filter((g) => !g.isCollectionHeader)

test('groupAndSortKbFiles sorts by size ascending', () => {
  const groups = groupAndSortKbFiles(sized, { key: 'size', direction: 'asc' }, expandUncategorized)
  assert.deepEqual(
    fileRowsOf(groups).map((g) => g.displayName),
    ['charlie.txt', 'bravo.txt', 'alpha.txt']
  )
})

test('groupAndSortKbFiles sorts by size descending', () => {
  const groups = groupAndSortKbFiles(sized, { key: 'size', direction: 'desc' }, expandUncategorized)
  assert.deepEqual(
    fileRowsOf(groups).map((g) => g.displayName),
    ['alpha.txt', 'bravo.txt', 'charlie.txt']
  )
})

test('groupAndSortKbFiles sorts by uploadedAt ascending', () => {
  const groups = groupAndSortKbFiles(
    sized,
    { key: 'uploadedAt', direction: 'asc' },
    expandUncategorized
  )
  assert.deepEqual(
    fileRowsOf(groups).map((g) => g.displayName),
    ['charlie.txt', 'bravo.txt', 'alpha.txt']
  )
})

test('groupAndSortKbFiles sorts by uploadedAt descending', () => {
  const groups = groupAndSortKbFiles(
    sized,
    { key: 'uploadedAt', direction: 'desc' },
    expandUncategorized
  )
  assert.deepEqual(
    fileRowsOf(groups).map((g) => g.displayName),
    ['alpha.txt', 'bravo.txt', 'charlie.txt']
  )
})

test('groupAndSortKbFiles parks files with null size at the end of size sort', () => {
  const withMissing: StoredFileInfo[] = [
    ...sized,
    {
      source: '/app/storage/kb_uploads/zzz_missing.txt',
      state: null,
      chunksEmbedded: 0,
      fileName: 'zzz_missing.txt',
      size: null,
      uploadedAt: null,
      isUserUpload: true,
      collection: null,
      active: true,
    },
  ]
  // Missing-size files sort last regardless of direction so the "real" data
  // owns the top of the view either way.
  const asc = groupAndSortKbFiles(
    withMissing,
    { key: 'size', direction: 'asc' },
    expandUncategorized
  )
  assert.equal(fileRowsOf(asc).at(-1)?.displayName, 'zzz_missing.txt')
  const desc = groupAndSortKbFiles(
    withMissing,
    { key: 'size', direction: 'desc' },
    expandUncategorized
  )
  assert.equal(fileRowsOf(desc).at(-1)?.displayName, 'zzz_missing.txt')
})

test('groupAndSortKbFiles preserves bucket order across all sort modes', () => {
  const mixed: StoredFileInfo[] = [
    {
      source: '/app/storage/zim/big.zim',
      state: null,
      chunksEmbedded: 0,
      fileName: 'big.zim',
      size: 999,
      uploadedAt: '2026-01-01T00:00:00Z',
      isUserUpload: false,
      collection: null,
      active: true,
    },
    {
      source: '/app/storage/kb_uploads/small.txt',
      state: null,
      chunksEmbedded: 0,
      fileName: 'small.txt',
      size: 1,
      uploadedAt: '2026-09-01T00:00:00Z',
      isUserUpload: true,
      collection: null,
      active: true,
    },
    {
      source: '/app/docs/release-notes.md',
      state: null,
      chunksEmbedded: 0,
      fileName: 'release-notes.md',
      size: 50,
      uploadedAt: '2026-05-01T00:00:00Z',
      isUserUpload: false,
      collection: null,
      active: true,
    },
  ]
  // Even if size-desc would put zim first naturally, sort runs *within* a
  // bucket — buckets themselves stay in the canonical zim → upload → admin_docs
  // order. This is the invariant that lets the per-bucket grouping stay
  // legible while still giving the user a sortable view.
  for (const direction of ['asc', 'desc'] as const) {
    for (const key of ['name', 'size', 'uploadedAt'] as const) {
      const groups = groupAndSortKbFiles(mixed, { key, direction })
      assert.deepEqual(
        groups.map((g) => g.bucket),
        ['zim', 'upload', 'admin_docs'],
        `bucket order changed for ${key}/${direction}`
      )
    }
  }
})

test('groupAndSortKbFiles emits null metadata + isUserUpload=false for the admin_docs group', () => {
  const groups = groupAndSortKbFiles(asInfos(['/app/docs/release-notes.md', '/app/README.md']))
  assert.equal(groups[0].bucket, 'admin_docs')
  assert.equal(groups[0].size, null)
  assert.equal(groups[0].uploadedAt, null)
  assert.equal(groups[0].isUserUpload, false)
})

/** Fixtures for the KB-collection grouping tests: two named collections
 * ("diy" with one file, "recipes" with a mixed active/inactive pair) plus an
 * untagged file that should fall into the "Uncategorized" header. */
const collectioned: StoredFileInfo[] = [
  {
    source: '/app/storage/kb_uploads/recipe_active.txt',
    state: null,
    chunksEmbedded: 0,
    fileName: 'recipe_active.txt',
    size: 10,
    uploadedAt: null,
    isUserUpload: true,
    collection: 'recipes',
    active: true,
  },
  {
    source: '/app/storage/kb_uploads/recipe_off.txt',
    state: null,
    chunksEmbedded: 0,
    fileName: 'recipe_off.txt',
    size: 20,
    uploadedAt: null,
    isUserUpload: true,
    collection: 'recipes',
    active: false,
  },
  {
    source: '/app/storage/kb_uploads/diy_guide.txt',
    state: null,
    chunksEmbedded: 0,
    fileName: 'diy_guide.txt',
    size: 30,
    uploadedAt: null,
    isUserUpload: true,
    collection: 'diy',
    active: true,
  },
  {
    source: '/app/storage/kb_uploads/loose_note.txt',
    state: null,
    chunksEmbedded: 0,
    fileName: 'loose_note.txt',
    size: 40,
    uploadedAt: null,
    isUserUpload: true,
    collection: null,
    active: true,
  },
]

test('groupAndSortKbFiles collapses upload files into per-collection header rows by default', () => {
  const groups = groupAndSortKbFiles(collectioned)
  // Nothing expanded -> just the three headers, no individual file rows.
  assert.equal(groups.length, 3)
  assert.ok(groups.every((g) => g.isCollectionHeader))
})

test('groupAndSortKbFiles orders KB-collection headers alphabetically with Uncategorized last', () => {
  const groups = groupAndSortKbFiles(collectioned)
  assert.deepEqual(
    groups.map((g) => g.collection),
    ['diy', 'recipes', null]
  )
})

test('groupAndSortKbFiles labels the null-collection header "Uncategorized" with a file count', () => {
  const groups = groupAndSortKbFiles(collectioned)
  const header = groups.find((g) => g.collection === null)
  assert.equal(header?.displayName, 'Uncategorized · 1 file')
})

test('groupAndSortKbFiles computes all-active, all-inactive, and mixed aggregate state per header', () => {
  const groups = groupAndSortKbFiles(collectioned)
  const diy = groups.find((g) => g.collection === 'diy')
  const recipes = groups.find((g) => g.collection === 'recipes')
  assert.equal(diy?.collectionActiveState, 'all-active')
  assert.equal(recipes?.collectionActiveState, 'mixed')
})

test('groupAndSortKbFiles expands only the requested collection into member rows', () => {
  const groups = groupAndSortKbFiles(
    collectioned,
    { key: 'name', direction: 'asc' },
    new Set(['recipes'])
  )
  const recipesIdx = groups.findIndex((g) => g.collection === 'recipes' && g.isCollectionHeader)
  assert.equal(groups[recipesIdx + 1]?.displayName, 'recipe_active.txt')
  assert.equal(groups[recipesIdx + 2]?.displayName, 'recipe_off.txt')
  // diy and Uncategorized stay collapsed -- their next entry is another header.
  const diyIdx = groups.findIndex((g) => g.collection === 'diy')
  assert.equal(groups[diyIdx + 1]?.isCollectionHeader, true)
})

test('groupAndSortKbFiles uses UNCATEGORIZED_COLLECTION_KEY to expand null-collection files', () => {
  const groups = groupAndSortKbFiles(
    collectioned,
    { key: 'name', direction: 'asc' },
    new Set([UNCATEGORIZED_COLLECTION_KEY])
  )
  const fileRows = groups.filter((g) => !g.isCollectionHeader)
  assert.deepEqual(
    fileRows.map((g) => g.displayName),
    ['loose_note.txt']
  )
})
