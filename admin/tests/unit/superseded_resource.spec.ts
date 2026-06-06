import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'

import { decideSupersededDeletion } from '../../app/utils/superseded_resource.js'

const STORAGE = join('/app', 'storage', 'zim')
const OLD = join(STORAGE, 'ifixit_en_all_2026-03.zim')
const NEW = join(STORAGE, 'ifixit_en_all_2026-05.zim')

test('first install (no prior row) deletes nothing', () => {
  const d = decideSupersededDeletion({
    existing: null,
    newFilePath: NEW,
    newVersion: '2026-05',
    newFileExists: true,
    storageBaseDir: STORAGE,
  })
  assert.equal(d.delete, false)
  assert.equal(d.reason, 'first_install')
})

test('superseded prior version is deleted', () => {
  const d = decideSupersededDeletion({
    existing: { file_path: OLD, version: '2026-03' },
    newFilePath: NEW,
    newVersion: '2026-05',
    newFileExists: true,
    storageBaseDir: STORAGE,
  })
  assert.equal(d.delete, true)
  assert.equal(d.reason, 'superseded')
  assert.equal(d.path, OLD)
})

test('same file path is never deleted (re-download)', () => {
  const d = decideSupersededDeletion({
    existing: { file_path: NEW, version: '2026-05' },
    newFilePath: NEW,
    newVersion: '2026-05',
    newFileExists: true,
    storageBaseDir: STORAGE,
  })
  assert.equal(d.delete, false)
  assert.equal(d.reason, 'same_file')
})

test('old file is NOT deleted until the new file is confirmed on disk', () => {
  const d = decideSupersededDeletion({
    existing: { file_path: OLD, version: '2026-03' },
    newFilePath: NEW,
    newVersion: '2026-05',
    newFileExists: false,
    storageBaseDir: STORAGE,
  })
  assert.equal(d.delete, false)
  assert.equal(d.reason, 'new_file_missing')
})

test('downgrade / reinstall of an older version does not wipe the newer file', () => {
  const d = decideSupersededDeletion({
    existing: { file_path: NEW, version: '2026-05' },
    newFilePath: OLD,
    newVersion: '2026-03',
    newFileExists: true,
    storageBaseDir: STORAGE,
  })
  assert.equal(d.delete, false)
  assert.equal(d.reason, 'not_newer')
})

test('equal version is not considered newer', () => {
  const d = decideSupersededDeletion({
    existing: { file_path: join(STORAGE, 'ifixit_en_all_2026-05a.zim'), version: '2026-05' },
    newFilePath: NEW,
    newVersion: '2026-05',
    newFileExists: true,
    storageBaseDir: STORAGE,
  })
  assert.equal(d.delete, false)
  assert.equal(d.reason, 'not_newer')
})

test('refuses to delete a path outside the storage directory', () => {
  const d = decideSupersededDeletion({
    existing: { file_path: '/etc/passwd', version: '2026-03' },
    newFilePath: NEW,
    newVersion: '2026-05',
    newFileExists: true,
    storageBaseDir: STORAGE,
  })
  assert.equal(d.delete, false)
  assert.equal(d.reason, 'outside_storage')
})

test('refuses a traversal escape that only looks like it is under storage', () => {
  const d = decideSupersededDeletion({
    existing: { file_path: join(STORAGE, '..', 'mysql', 'data.ibd'), version: '2026-03' },
    newFilePath: NEW,
    newVersion: '2026-05',
    newFileExists: true,
    storageBaseDir: STORAGE,
  })
  assert.equal(d.delete, false)
  assert.equal(d.reason, 'outside_storage')
})

test('YYYY-MM-DD versions order correctly against YYYY-MM', () => {
  const d = decideSupersededDeletion({
    existing: { file_path: OLD, version: '2026-05' },
    newFilePath: NEW,
    newVersion: '2026-05-12',
    newFileExists: true,
    storageBaseDir: STORAGE,
  })
  assert.equal(d.delete, true)
  assert.equal(d.reason, 'superseded')
})
