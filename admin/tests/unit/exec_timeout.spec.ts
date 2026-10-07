import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { isExecTimeout } from '../../app/utils/exec_timeout.js'

/** Regression: #1258. A dry-run killed by the timeout surfaced as a generic 500. */
test('a child killed by the timeout option is a timeout', () => {
  assert.equal(isExecTimeout({ killed: true, signal: 'SIGTERM', code: null, stderr: '' }), true)
})

test('a child that exited non-zero is not a timeout, even with empty stderr', () => {
  assert.equal(isExecTimeout({ killed: false, signal: null, code: 1, stderr: '' }), false)
})

test('a binary that could not be spawned is not a timeout', () => {
  assert.equal(isExecTimeout({ code: 'ENOENT', errno: -2 }), false)
})

test('non-objects are not timeouts', () => {
  for (const value of [undefined, null, 'timeout', 42]) {
    assert.equal(isExecTimeout(value), false)
  }
})
