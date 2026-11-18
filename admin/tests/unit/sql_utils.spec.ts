import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { escapeLike, isDuplicateKeyError } from '../../app/utils/sql.js'

const BS = '\\' // one backslash

test('escapeLike makes LIKE wildcards literal', () => {
  assert.equal(escapeLike('_'), BS + '_')
  assert.equal(escapeLike('%'), BS + '%')
  assert.equal(escapeLike('50%_off'), `50${BS}%${BS}_off`)
})

test('escapeLike escapes the escape character itself', () => {
  assert.equal(escapeLike(`a${BS}b`), `a${BS}${BS}b`)
  assert.equal(escapeLike(`${BS}%`), `${BS}${BS}${BS}%`)
})

test('escapeLike leaves ordinary text alone', () => {
  assert.equal(escapeLike('ibuprofen ORAL'), 'ibuprofen ORAL')
  assert.equal(escapeLike(''), '')
})

test('isDuplicateKeyError recognises MySQL duplicate-key errors only', () => {
  assert.equal(isDuplicateKeyError({ code: 'ER_DUP_ENTRY' }), true)
  assert.equal(isDuplicateKeyError({ errno: 1062 }), true)
  assert.equal(isDuplicateKeyError({ code: 'ER_LOCK_WAIT_TIMEOUT', errno: 1205 }), false)
  assert.equal(isDuplicateKeyError(new Error('boom')), false)
  assert.equal(isDuplicateKeyError(null), false)
})
