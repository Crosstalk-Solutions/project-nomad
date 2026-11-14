import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { recreatesOnStart } from '../../app/utils/dependency_start.js'

test('starting a dependency service whose container is gone recreates it', () => {
  assert.equal(recreatesOnStart('start', true, false), true)
})

test('starting a dependency service whose container exists just starts it', () => {
  assert.equal(recreatesOnStart('start', true, true), false)
})

test('stop and restart never recreate a missing dependency container', () => {
  assert.equal(recreatesOnStart('stop', true, false), false)
  assert.equal(recreatesOnStart('restart', true, false), false)
})

test('starting a user-facing app with no container does not recreate it', () => {
  assert.equal(recreatesOnStart('start', false, false), false)
})
