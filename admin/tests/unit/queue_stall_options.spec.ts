import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_LOCK_DURATION,
  LONG_LOCK_DURATION,
  stallOptionsForQueue,
} from '../../app/utils/queue_stall_options.js'

const QUEUES = {
  embedFile: 'file-embeddings',
  download: 'downloads',
  drugDownload: 'drug-download',
  drugIngest: 'drug-ingest',
}

const optionsFor = (queue: string) => stallOptionsForQueue(queue, QUEUES)

test('queues without an entry keep the default lock and BullMQ default maxStalledCount', () => {
  for (const queue of ['benchmarks', 'model-downloads', 'update-checks', 'pmtiles-extracts']) {
    assert.deepEqual(optionsFor(queue), { lockDuration: DEFAULT_LOCK_DURATION })
  }
})

test('an unlisted queue leaves maxStalledCount unset rather than setting it to a value', () => {
  // The caller spreads this key only when it is not undefined, so an explicit
  // value here would silently change every other queue's behaviour.
  assert.equal('maxStalledCount' in optionsFor('benchmarks'), false)
})

/**
 * Regression: #1269. Embedding is a self-continuing chain, so a stalled-recovery
 * re-queue runs a second chain alongside a live one, and both write fresh Qdrant
 * points. Failing on the first stall is the only safe option.
 */
test('file-embeddings never auto-recovers a stalled job', () => {
  const opts = optionsFor(QUEUES.embedFile)
  assert.equal(opts.maxStalledCount, 0, 'must fail on the first stall, not re-queue')
  assert.equal(opts.lockDuration, LONG_LOCK_DURATION)
})

test('maxStalledCount 0 is distinguishable from unset', () => {
  // `stalledCount > maxStalledCount` after an increment: 0 fails on the first
  // stall, BullMQ's default of 1 re-queues once first. Guarding against a
  // refactor that treats a falsy 0 as "not configured".
  const embed = optionsFor(QUEUES.embedFile)
  assert.equal(embed.maxStalledCount, 0)
  assert.notEqual(embed.maxStalledCount, undefined)
})

/**
 * Regression: #1203. A download is resumable, so recovery is safe, and the
 * default maxStalledCount of 1 was failing jobs outright and bypassing their
 * own `attempts: 10` policy.
 */
test('downloads tolerate stalls instead of failing outright', () => {
  assert.deepEqual(optionsFor(QUEUES.download), {
    lockDuration: LONG_LOCK_DURATION,
    maxStalledCount: 3,
  })
})

test('the two long-running queues take opposite stall policies', () => {
  const embed = optionsFor(QUEUES.embedFile)
  const download = optionsFor(QUEUES.download)
  assert.equal(embed.lockDuration, download.lockDuration)
  assert.notEqual(
    embed.maxStalledCount,
    download.maxStalledCount,
    'non-idempotent chain and resumable download must not share a recovery policy'
  )
})

test('the drug queues are unchanged', () => {
  for (const queue of [QUEUES.drugDownload, QUEUES.drugIngest]) {
    assert.deepEqual(optionsFor(queue), {
      lockDuration: LONG_LOCK_DURATION,
      maxStalledCount: 3,
    })
  }
})
