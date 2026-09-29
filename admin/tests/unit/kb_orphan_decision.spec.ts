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
  assert.deepEqual(decideOrphans([], [zim('a.zim')], SCAN_ROOTS), { orphans: [], withheld: [] })
})

test('every Qdrant source still has a file on disk → no orphans', () => {
  assert.deepEqual(
    decideOrphans([zim('a.zim'), zim('b.zim')], [zim('a.zim'), zim('b.zim')], SCAN_ROOTS),
    { orphans: [], withheld: [] }
  )
})

test('a source with no matching file on disk is an orphan', () => {
  assert.deepEqual(decideOrphans([zim('a.zim'), zim('gone.zim')], [zim('a.zim')], SCAN_ROOTS), {
    orphans: [zim('gone.zim')],
    withheld: [],
  })
})

test('sources outside every scanned root are never orphans (e.g. bundled docs)', () => {
  const readme = join('/data', 'README.md')
  assert.deepEqual(decideOrphans([readme, zim('a.zim')], [zim('a.zim')], SCAN_ROOTS), {
    orphans: [],
    withheld: [],
  })
})

test('empty disk scan withholds every root instead of purging everything', () => {
  assert.deepEqual(decideOrphans([upload('a.pdf'), zim('a.zim')], [], SCAN_ROOTS), {
    orphans: [],
    withheld: [
      { root: KB_UPLOADS_ROOT, count: 1, reason: 'empty_root' },
      { root: ZIM_ROOT, count: 1, reason: 'empty_root' },
    ],
  })
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
  assert.deepEqual(decideOrphans(sourcesInQdrant, [upload('a.pdf')], [KB_UPLOADS_ROOT]), {
    orphans: [],
    withheld: [],
  })
})

test('no roots scanned at all yields no candidates', () => {
  // "We could not read any of the storage" must never read as "nothing is on
  // disk, so purge everything."
  assert.deepEqual(filterOrphanCandidates([zim('a.zim')], []), [])
})

test('a walked root with no embeddable files keeps its sources (#1378)', () => {
  // The unmounted-volume shape: boot's ensureDirectoryExists() recreates the
  // zim mountpoint as an empty directory, so the scan walks it without error
  // and reports it as scanned. kb_uploads keeps the overall scan non-empty.
  // Treating "walked and empty" as "everything under it was deleted" would
  // purge every ZIM in the index.
  const sourcesInQdrant = [upload('a.pdf'), zim('wikipedia_en_all_maxi.zim'), zim('gutenberg.zim')]
  assert.deepEqual(decideOrphans(sourcesInQdrant, [upload('a.pdf')], SCAN_ROOTS), {
    orphans: [],
    withheld: [{ root: ZIM_ROOT, count: 2, reason: 'empty_root' }],
  })
})

test('a root holding only non-embeddable files still counts as empty', () => {
  // Kiwix regenerates kiwix-library.xml in the empty mountpoint, so the
  // directory has entries. Only embeddable files are evidence the content is
  // there, and _discoverKbFilesWithRoots() drops the XML before this point, so
  // the zim root arrives with nothing under it.
  const embeddable = [upload('a.pdf')]
  assert.deepEqual(decideOrphans([zim('a.zim')], embeddable, SCAN_ROOTS).withheld, [
    { root: ZIM_ROOT, count: 1, reason: 'empty_root' },
  ])
})

test('an empty kb_uploads root keeps its sources while zim is swept normally', () => {
  const zims = ['a', 'b', 'c'].map((n) => zim(`${n}.zim`))
  assert.deepEqual(
    decideOrphans([upload('a.pdf'), ...zims, zim('gone.zim')], zims, SCAN_ROOTS),
    {
      orphans: [zim('gone.zim')],
      withheld: [{ root: KB_UPLOADS_ROOT, count: 1, reason: 'empty_root' }],
    }
  )
})

test('removing most of a root in one sync is withheld as a likely wrong mount', () => {
  // The root is present and non-empty, but it holds 2 of 10 indexed ZIMs:
  // far likelier a different disk or stale copy than 8 hand-deletions.
  const indexed = Array.from({ length: 10 }, (_, i) => zim(`z${i}.zim`))
  const onDisk = indexed.slice(0, 2)
  assert.deepEqual(decideOrphans(indexed, onDisk, SCAN_ROOTS), {
    orphans: [],
    withheld: [{ root: ZIM_ROOT, count: 8, reason: 'mass_removal' }],
  })
})

test('removing up to half a root is still purged', () => {
  const indexed = Array.from({ length: 10 }, (_, i) => zim(`z${i}.zim`))
  const onDisk = indexed.slice(0, 5)
  assert.deepEqual(decideOrphans(indexed, onDisk, SCAN_ROOTS), {
    orphans: indexed.slice(5),
    withheld: [],
  })
})

test('the mass-removal guard does not engage below the minimum count', () => {
  // 4 of 5 missing is 80%, but only 4 sources: too few for the ratio to mean
  // anything, and cheap to re-embed if wrong.
  const indexed = Array.from({ length: 5 }, (_, i) => zim(`z${i}.zim`))
  assert.deepEqual(decideOrphans(indexed, indexed.slice(0, 1), SCAN_ROOTS), {
    orphans: indexed.slice(1),
    withheld: [],
  })
})
