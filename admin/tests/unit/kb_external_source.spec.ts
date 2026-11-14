import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'

import {
  buildKbScanRoots,
  decideKbFileDelete,
  decideScanRootError,
  isPathUnderRoot,
} from '../../app/utils/kb_external_source.js'
import { decideOrphans } from '../../app/utils/kb_orphan_decision.js'

// join() rather than POSIX literals, for the same reason as
// kb_orphan_decision.spec.ts: the guards compare against path.sep.
const APP = join('/app')
const UPLOADS_ROOT = join(APP, 'storage', 'kb_uploads')
const ZIM_ROOT = join(APP, 'storage', 'zim')
const EXTERNAL_ROOT = join(APP, 'kb_external')

const ROOTS = buildKbScanRoots({
  kbUploadsPath: UPLOADS_ROOT,
  zimPath: ZIM_ROOT,
  externalPath: EXTERNAL_ROOT,
})

const upload = (name: string) => join(UPLOADS_ROOT, name)
const zim = (name: string) => join(ZIM_ROOT, name)
const ext = (...parts: string[]) => join(EXTERNAL_ROOT, ...parts)

// --- scan roots ------------------------------------------------------------

test('buildKbScanRoots adds the external folder after kb_uploads and zim', () => {
  assert.deepEqual(ROOTS, [UPLOADS_ROOT, ZIM_ROOT, EXTERNAL_ROOT])
})

// --- isPathUnderRoot -------------------------------------------------------

test('isPathUnderRoot accepts nested files and rejects siblings, the root, and traversal', () => {
  assert.equal(isPathUnderRoot(ext('manuals', 'pump.pdf'), EXTERNAL_ROOT), true)
  assert.equal(isPathUnderRoot(join(APP, 'kb_external-old', 'a.pdf'), EXTERNAL_ROOT), false)
  assert.equal(isPathUnderRoot(EXTERNAL_ROOT, EXTERNAL_ROOT), false)
  assert.equal(isPathUnderRoot(ext('..', 'storage', 'kb_uploads', 'a.pdf'), EXTERNAL_ROOT), false)
})

// --- read-only delete guard ------------------------------------------------

const roots = { uploadsRoot: UPLOADS_ROOT, externalRoot: EXTERNAL_ROOT }

test('an upload is deleted from disk and the index', () => {
  assert.equal(
    decideKbFileDelete({ ...roots, source: upload('a.pdf'), existsOnDisk: true }),
    'delete_file_and_index'
  )
})

test('an external file that still exists is refused, never deleted', () => {
  assert.equal(
    decideKbFileDelete({ ...roots, source: ext('manuals', 'pump.pdf'), existsOnDisk: true }),
    'refuse_external'
  )
})

test('an external file already gone from the folder only has its index entry purged', () => {
  assert.equal(
    decideKbFileDelete({ ...roots, source: ext('manuals', 'pump.pdf'), existsOnDisk: false }),
    'purge_index_only'
  )
})

test('an external file whose sub-path mimics kb_uploads is still read-only', () => {
  // The embed-job cleanup used to match on a `storage/kb_uploads` substring;
  // this is the shape that would have slipped through.
  const tricky = ext('storage', 'kb_uploads', 'a.pdf')
  assert.equal(
    decideKbFileDelete({ ...roots, source: tricky, existsOnDisk: true }),
    'refuse_external'
  )
})

test('read-only wins if the external root were ever nested under uploads', () => {
  const nestedExternal = join(UPLOADS_ROOT, 'external')
  assert.equal(
    decideKbFileDelete({
      uploadsRoot: UPLOADS_ROOT,
      externalRoot: nestedExternal,
      source: join(nestedExternal, 'a.pdf'),
      existsOnDisk: true,
    }),
    'refuse_external'
  )
})

test('ZIMs and other non-upload sources keep the existing index-only behavior', () => {
  assert.equal(
    decideKbFileDelete({ ...roots, source: zim('a.zim'), existsOnDisk: true }),
    'purge_index_only'
  )
  assert.equal(
    decideKbFileDelete({ ...roots, source: join(APP, 'README.md'), existsOnDisk: true }),
    'purge_index_only'
  )
})

// --- scan-root errors ------------------------------------------------------

test('a missing root is skipped, external or not', () => {
  assert.equal(decideScanRootError('ENOENT', false), 'skip_missing')
  assert.equal(decideScanRootError('ENOENT', true), 'skip_missing')
})

test('an unreadable external folder is skipped instead of failing the sync', () => {
  for (const code of ['EACCES', 'EIO', 'ESTALE', undefined]) {
    assert.equal(decideScanRootError(code, true), 'skip_unreadable')
  }
})

test('an unreadable NOMAD storage root still throws', () => {
  assert.equal(decideScanRootError('EACCES', false), 'throw')
  assert.equal(decideScanRootError(undefined, false), 'throw')
})

// --- orphan sweep with the external root ----------------------------------

test('files removed from a walked external folder are purged', () => {
  const kept = ['a', 'b', 'c'].map((n) => ext(`${n}.pdf`))
  assert.deepEqual(decideOrphans([...kept, ext('gone.pdf')], kept, ROOTS), {
    orphans: [ext('gone.pdf')],
    withheld: [],
  })
})

test('an external folder that was not walked (unmounted/unreadable) purges nothing', () => {
  // The scanner leaves a missing or unreadable root out of scannedRoots.
  const walked = [UPLOADS_ROOT, ZIM_ROOT]
  assert.deepEqual(
    decideOrphans([ext('a.pdf'), ext('b.pdf'), upload('u.pdf')], [upload('u.pdf')], walked),
    { orphans: [], withheld: [] }
  )
})

test('an empty external mountpoint (share dropped off the network) is withheld', () => {
  assert.deepEqual(decideOrphans([ext('a.pdf'), upload('u.pdf')], [upload('u.pdf')], ROOTS), {
    orphans: [],
    withheld: [{ root: EXTERNAL_ROOT, count: 1, reason: 'empty_root' }],
  })
})

test('losing most of the external folder at once is withheld as a likely wrong mount', () => {
  const indexed = Array.from({ length: 10 }, (_, i) => ext(`d${i}.pdf`))
  assert.deepEqual(decideOrphans(indexed, indexed.slice(0, 2), ROOTS), {
    orphans: [],
    withheld: [{ root: EXTERNAL_ROOT, count: 8, reason: 'mass_removal' }],
  })
})

test('an external sibling directory is never treated as part of the external root', () => {
  const sibling = join(APP, 'kb_external-backup', 'a.pdf')
  assert.deepEqual(decideOrphans([sibling, ext('a.pdf')], [ext('a.pdf')], ROOTS), {
    orphans: [],
    withheld: [],
  })
})
