import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { LocalLibraryService } from '../../app/services/local_library_service.js'

test('local library path resolution rejects traversal and nested paths', () => {
  const service = new LocalLibraryService()

  assert.throws(() => service.resolveLibraryPath('../secret.pdf'), /invalid_filename/)
  assert.throws(() => service.resolveLibraryPath('manuals/field.pdf'), /invalid_filename/)
  assert.throws(() => service.resolveLibraryPath('manuals%2Ffield.pdf'), /invalid_filename/)
  assert.throws(() => service.resolveLibraryPath('..%2Fsecret.pdf'), /invalid_filename/)
})

test('local library path resolution accepts a plain supported filename', () => {
  const service = new LocalLibraryService()
  const resolved = service.resolveLibraryPath('field-guide.pdf')

  assert.match(resolved, /storage\/local_library\/field-guide\.pdf$/)
})
