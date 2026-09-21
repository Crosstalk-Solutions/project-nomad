import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeCustomUrl } from '../../app/validators/system.js'

test('rejects a normalized custom URL that exceeds the database column size', () => {
  const tooLongHost = 'a'.repeat(247)
  assert.equal(normalizeCustomUrl(`https://${tooLongHost}`), null)
})

test('accepts a normalized custom URL at the database column limit', () => {
  const maxLengthHost = 'a'.repeat(246)
  const normalized = normalizeCustomUrl(`https://${maxLengthHost}`)
  assert.equal(normalized?.length, 255)
})
