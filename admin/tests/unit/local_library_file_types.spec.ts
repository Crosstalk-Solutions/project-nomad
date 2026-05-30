import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { determineFileType } from '../../app/utils/fs.js'

test('local library file types include PDF, EPUB, and MOBI-style eBooks', () => {
  assert.equal(determineFileType('first-aid.pdf'), 'pdf')
  assert.equal(determineFileType('foraging.epub'), 'epub')
  assert.equal(determineFileType('manual.mobi'), 'mobi')
  assert.equal(determineFileType('manual.azw3'), 'mobi')
})

test('local library unsupported binary formats remain unknown for RAG dispatch', () => {
  assert.equal(determineFileType('archive.exe'), 'unknown')
  assert.equal(determineFileType('disk.iso'), 'unknown')
})
