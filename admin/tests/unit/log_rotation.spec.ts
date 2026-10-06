import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { LOG_MAX_FILE, LOG_MAX_SIZE, withLogRotation } from '../../app/utils/log_rotation.js'

const ROTATED = {
  Type: 'json-file',
  Config: { 'max-size': LOG_MAX_SIZE, 'max-file': LOG_MAX_FILE },
}

/** Regression: #1412. An unbounded nomad_admin log filled / and took MySQL down. */
test('a new container on a json-file daemon gets a size cap', () => {
  assert.deepEqual(withLogRotation(undefined, 'json-file'), ROTATED)
})

test('an inspected container with an empty json-file config gets a size cap', () => {
  // What `docker inspect` reports for a container created with no log options.
  assert.deepEqual(withLogRotation({ Type: 'json-file', Config: {} }, 'json-file'), ROTATED)
})

test('an existing max-size is kept, whether from the daemon log-opts or the user', () => {
  const existing = { Type: 'json-file', Config: { 'max-size': '50m', 'max-file': '5' } }
  assert.deepEqual(withLogRotation(existing, 'json-file'), existing)
})

test('unrelated json-file options are preserved alongside the cap', () => {
  const result = withLogRotation({ Type: 'json-file', Config: { compress: 'true' } }, 'json-file')
  assert.deepEqual(result?.Config, {
    'compress': 'true',
    'max-size': LOG_MAX_SIZE,
    'max-file': LOG_MAX_FILE,
  })
})

test('a non-json-file daemon default is left alone', () => {
  // max-size is not a valid journald option; passing it would fail container creation.
  for (const driver of ['journald', 'local', 'syslog', 'none']) {
    assert.equal(withLogRotation(undefined, driver), undefined, driver)
  }
})

test('an explicit non-json-file driver on the container is kept', () => {
  const existing = { Type: 'local', Config: {} }
  assert.deepEqual(withLogRotation(existing, 'json-file'), existing)
})

test('an unknown daemon driver leaves the config untouched rather than guessing', () => {
  assert.equal(withLogRotation(undefined, undefined), undefined)
})
