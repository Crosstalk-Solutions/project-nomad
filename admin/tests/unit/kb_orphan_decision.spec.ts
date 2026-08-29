import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'

import { decideOrphans, filterOrphanCandidates } from '../../app/utils/kb_orphan_decision.js'

// Paths are built with join() rather than written as POSIX literals so these
// cases exercise the same separator filterOrphanCandidates does. Written as
// '/data/...' string literals they silently pass on Linux CI and fail on a
// Windows dev box, which makes the suite useless exactly where someone is
// most likely to be running it while changing this file.
const STORAGE = join('/data', 'storage')
const KB_UPLOADS_ROOT = join(STORAGE, 'kb_uploads')
const ZIM_ROOT = join(STORAGE, 'zim')

/** Both roots present and walked — the healthy case. */
const SCAN_ROOTS = [KB_UPLOADS_ROOT, ZIM_ROOT]

const upload = (name: string) => join(KB_UPLOADS_ROOT, name)
const zim = (name: string) => join(ZIM_ROOT, name)

test('no sources in Qdrant → no orphans', () => {
  assert.deepEqual(decideOrphans([], [zim('a.zim')]), [])
})

test('every Qdrant source still has a file on disk → no orphans', () => {
  assert.deepEqual(decideOrphans([zim('a.zim'), zim('b.zim')], [zim('a.zim'), zim('b.zim')]), [])
})

test('a source with no matching file on disk is an orphan', () => {
  assert.deepEqual(decideOrphans([zim('a.zim'), zim('gone.zim')], [zim('a.zim')]), [
    zim('gone.zim'),
  ])
})

test('every Qdrant source is orphaned when none remain on disk (but disk scan was non-empty)', () => {
  assert.deepEqual(decideOrphans([zim('gone1.zim'), zim('gone2.zim')], [zim('unrelated.zim')]), [
    zim('gone1.zim'),
    zim('gone2.zim'),
  ])
})

test('empty disk scan is treated as a transient failure, not "everything was deleted"', () => {
  assert.equal(decideOrphans([zim('a.zim'), zim('b.zim')], []), null)
})

test('filterOrphanCandidates keeps sources under the kb_uploads or zim scan roots', () => {
  assert.deepEqual(filterOrphanCandidates([upload('a.pdf'), zim('b.zim')], SCAN_ROOTS), [
    upload('a.pdf'),
    zim('b.zim'),
  ])
})

test('filterOrphanCandidates excludes sources outside the scanned roots (e.g. bundled docs)', () => {
  assert.deepEqual(
    filterOrphanCandidates(
      [join('/data', 'README.md'), join('/data', 'docs', 'guide.md'), zim('b.zim')],
      SCAN_ROOTS
    ),
    [zim('b.zim')]
  )
})

test('filterOrphanCandidates does not match a sibling directory that merely shares a root as a string prefix', () => {
  // '<storage>/zim-backup/...' must not pass just because it starts with the
  // same characters as zimPath — the trailing separator is what makes this a
  // real subpath check rather than a naive string prefix match.
  assert.deepEqual(filterOrphanCandidates([join(STORAGE, 'zim-backup', 'x.zim')], SCAN_ROOTS), [])
})

test('a root that was not scanned contributes no candidates, even though the scan found files', () => {
  // The #1050 shape: the zim root is relocated or not yet mounted, so
  // _discoverKbFiles() skips it (ENOENT is not fatal) and reports only
  // kb_uploads as scanned. The file list is still non-empty from kb_uploads,
  // so decideOrphans' empty-scan guard does NOT fire. Without confining
  // candidates to roots actually walked, every indexed ZIM would be
  // classified as an orphan and purged in one batch.
  const sourcesInQdrant = [upload('a.pdf'), zim('wikipedia_en_all_maxi.zim'), zim('gutenberg.zim')]
  const candidates = filterOrphanCandidates(sourcesInQdrant, [KB_UPLOADS_ROOT])
  assert.deepEqual(candidates, [upload('a.pdf')])

  // End to end: the ZIMs survive despite having no backing file in the scan.
  assert.deepEqual(decideOrphans(candidates, [upload('a.pdf')]), [])
})

test('no roots scanned at all yields no candidates', () => {
  // "We could not read any of the storage" must never read as "nothing is on
  // disk, so purge everything."
  assert.deepEqual(filterOrphanCandidates([zim('a.zim')], []), [])
})

test('a scanned-but-empty root still yields orphans for what it contains', () => {
  // The counterpart to the case above, and the reason the distinction matters:
  // zim scanned clean and legitimately holds no files, so its indexed sources
  // really are orphaned and should be purged. A missing root and an empty one
  // must not behave the same way.
  const candidates = filterOrphanCandidates([zim('gone.zim')], SCAN_ROOTS)
  assert.deepEqual(candidates, [zim('gone.zim')])
  assert.deepEqual(decideOrphans(candidates, [upload('a.pdf')]), [zim('gone.zim')])
})
