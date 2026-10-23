import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { decideDownloadedZimKbAction } from '../../app/utils/kb_download_decision.js'

const fresh = { skipEmbedding: false, isReplacement: false }

test('a ZIM that lands before the AI Assistant is installed still gets a row (#1465)', () => {
  assert.equal(
    decideDownloadedZimKbAction({ ...fresh, policy: 'Manual', aiInstalled: false }),
    'record_pending'
  )
  assert.equal(
    decideDownloadedZimKbAction({ ...fresh, policy: 'Always', aiInstalled: false }),
    'record_pending'
  )
})

test('with the AI Assistant up, policy decides between pending and embedding now', () => {
  assert.equal(
    decideDownloadedZimKbAction({ ...fresh, policy: 'Manual', aiInstalled: true }),
    'record_pending'
  )
  assert.equal(
    decideDownloadedZimKbAction({ ...fresh, policy: 'Always', aiInstalled: true }),
    'record_and_embed'
  )
})

test('skip_embedding opts the file out of the KB entirely, whatever else is true', () => {
  for (const policy of ['Manual', 'Always'] as const) {
    for (const aiInstalled of [true, false]) {
      for (const isReplacement of [true, false]) {
        assert.equal(
          decideDownloadedZimKbAction({ skipEmbedding: true, isReplacement, policy, aiInstalled }),
          'none'
        )
      }
    }
  }
})

test('a content update is reconciled against the old file only when the AI Assistant is up', () => {
  assert.equal(
    decideDownloadedZimKbAction({
      skipEmbedding: false,
      isReplacement: true,
      policy: 'Always',
      aiInstalled: true,
    }),
    'reconcile_replacement'
  )
  // no Ollama yet: the new file is at least recorded, like a fresh download
  assert.equal(
    decideDownloadedZimKbAction({
      skipEmbedding: false,
      isReplacement: true,
      policy: 'Always',
      aiInstalled: false,
    }),
    'record_pending'
  )
})
