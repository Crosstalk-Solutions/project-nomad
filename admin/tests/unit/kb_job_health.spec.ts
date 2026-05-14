import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { computeJobHealth } from '../../app/utils/kb_job_health.js'

const MIN = 60 * 1000
const NOW = 1_700_000_000_000 // arbitrary fixed epoch for deterministic tests

test('failed status takes precedence over any timing', () => {
  assert.equal(
    computeJobHealth({ status: 'failed', progress: 42, lastBatchAt: NOW, now: NOW }),
    'failed'
  )
})

test('no progress + no activity timestamps → waiting', () => {
  assert.equal(
    computeJobHealth({ status: 'waiting', progress: 0, now: NOW }),
    'waiting'
  )
})

test('progress > 0 but no lastBatchAt yet → healthy (first batch just started)', () => {
  assert.equal(
    computeJobHealth({ status: 'processing', progress: 5, startedAt: NOW, now: NOW }),
    'healthy'
  )
})

test('lastBatchAt 30s ago → healthy', () => {
  assert.equal(
    computeJobHealth({
      status: 'batch_completed',
      progress: 50,
      lastBatchAt: NOW - 30 * 1000,
      now: NOW,
    }),
    'healthy'
  )
})

test('lastBatchAt 90s ago → still healthy (under 2 min threshold)', () => {
  assert.equal(
    computeJobHealth({
      status: 'batch_completed',
      progress: 50,
      lastBatchAt: NOW - 90 * 1000,
      now: NOW,
    }),
    'healthy'
  )
})

test('lastBatchAt 3 min ago → slow (CPU-paced ingestion lives here)', () => {
  assert.equal(
    computeJobHealth({
      status: 'batch_completed',
      progress: 50,
      lastBatchAt: NOW - 3 * MIN,
      now: NOW,
    }),
    'slow'
  )
})

test('lastBatchAt 4:30 ago → still slow (under 5 min stalled threshold)', () => {
  assert.equal(
    computeJobHealth({
      status: 'batch_completed',
      progress: 50,
      lastBatchAt: NOW - 4.5 * MIN,
      now: NOW,
    }),
    'slow'
  )
})

test('lastBatchAt 5:01 ago → stalled', () => {
  assert.equal(
    computeJobHealth({
      status: 'batch_completed',
      progress: 50,
      lastBatchAt: NOW - (5 * MIN + 1000),
      now: NOW,
    }),
    'stalled'
  )
})

test('lastBatchAt missing but startedAt 10 min ago → stalled (first-batch-never-finished case)', () => {
  assert.equal(
    computeJobHealth({
      status: 'processing',
      progress: 5,
      startedAt: NOW - 10 * MIN,
      now: NOW,
    }),
    'stalled'
  )
})
