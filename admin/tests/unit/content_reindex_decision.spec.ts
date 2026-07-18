import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  decideContentReindex,
  type ContentReindexInput,
} from '../../app/utils/content_reindex_decision.js'

// Default to the fully-actionable case; each test overrides one axis so the
// short-circuit ordering is exercised explicitly.
function input(overrides: Partial<ContentReindexInput> = {}): ContentReindexInput {
  return {
    isReplacement: true,
    qdrantInstalled: true,
    oldFileWasIndexed: true,
    qdrantRunning: true,
    ...overrides,
  }
}

test('fresh install / same-path re-download → not_a_replacement (defers to normal policy)', () => {
  assert.equal(decideContentReindex(input({ isReplacement: false })), 'not_a_replacement')
})

test('not_a_replacement short-circuits before any Qdrant consideration', () => {
  // Even with everything else "off", a non-replacement is the controlling answer.
  assert.equal(
    decideContentReindex(
      input({ isReplacement: false, qdrantInstalled: false, oldFileWasIndexed: false, qdrantRunning: false })
    ),
    'not_a_replacement'
  )
})

test('replacement but Qdrant not installed → qdrant_not_installed (step 2)', () => {
  assert.equal(decideContentReindex(input({ qdrantInstalled: false })), 'qdrant_not_installed')
})

test('not-installed short-circuits before the old-indexed lookup', () => {
  // oldFileWasIndexed should not matter once Qdrant is absent.
  assert.equal(
    decideContentReindex(input({ qdrantInstalled: false, oldFileWasIndexed: true })),
    'qdrant_not_installed'
  )
})

test('replacement, installed, but old file was never indexed → old_not_indexed (step 4)', () => {
  assert.equal(decideContentReindex(input({ oldFileWasIndexed: false })), 'old_not_indexed')
})

test('old not indexed wins even if Qdrant is running (respects prior un-indexed choice)', () => {
  assert.equal(
    decideContentReindex(input({ oldFileWasIndexed: false, qdrantRunning: true })),
    'old_not_indexed'
  )
})

test('old indexed but Qdrant currently down → qdrant_not_running (step 5, defer entirely)', () => {
  assert.equal(decideContentReindex(input({ qdrantRunning: false })), 'qdrant_not_running')
})

test('replacement + installed + old indexed + running → reindex (step 3)', () => {
  assert.equal(decideContentReindex(input()), 'reindex')
})
