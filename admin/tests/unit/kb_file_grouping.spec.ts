import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  classifyKbFile,
  groupAndSortKbFiles,
  sourceToDisplayName,
} from '../../inertia/lib/kb_file_grouping.js'
import type { StoredFileInfo } from '../../types/rag.js'

/** Wrap source paths into the minimal StoredFileInfo shape that
 * `groupAndSortKbFiles` now expects. State + chunk count are irrelevant to
 * grouping/sorting behavior; the per-file state-pill rendering is exercised
 * separately in the modal's component tests (added in the follow-up PR). */
const asInfos = (sources: string[]): StoredFileInfo[] =>
  sources.map((source) => ({ source, state: null, chunksEmbedded: 0 }))

test('classifyKbFile distinguishes ZIM, upload, admin_docs, and other', () => {
  assert.equal(
    classifyKbFile('/app/storage/zim/devdocs_en_python_2026-02.zim'),
    'zim'
  )
  assert.equal(
    classifyKbFile('/app/storage/kb_uploads/federalist.txt-8cc4ec95aa8f.txt'),
    'upload'
  )
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
  const groups = groupAndSortKbFiles(asInfos([
    '/app/docs/release-notes.md',
    '/app/docs/getting-started.md',
    '/app/docs/maps.md',
    '/app/README.md',
  ]))

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
  const groups = groupAndSortKbFiles(asInfos([
    '/app/docs/release-notes.md',
    '/unexpected/foo.txt',
    '/app/storage/kb_uploads/upload.pdf',
    '/app/storage/zim/devdocs.zim',
  ]))

  assert.deepEqual(
    groups.map((g) => g.bucket),
    ['zim', 'upload', 'admin_docs', 'other']
  )
})

test('groupAndSortKbFiles alphabetizes within a bucket', () => {
  const groups = groupAndSortKbFiles(asInfos([
    '/app/storage/zim/wikipedia.zim',
    '/app/storage/zim/devdocs.zim',
    '/app/storage/zim/ifixit.zim',
  ]))

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
  const groups = groupAndSortKbFiles(asInfos([
    '/app/docs/release-notes.md',
    '/app/docs/maps.md',
  ]))
  // The admin-docs row uses a synthetic source key (not a real path) so it
  // can be used as a React key without colliding with any real file row.
  assert.equal(groups[0].source, '__admin_docs_group__')
})
