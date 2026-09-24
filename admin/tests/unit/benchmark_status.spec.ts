/**
 * Tests for the benchmark status decision — what /api/benchmark/status and the
 * double-run guard report while a benchmark is queued or running.
 *
 * Benchmarks run in the queue worker, so the web process's in-memory status
 * always read idle and a second run was accepted mid-flight (#1326). Status now
 * comes from the queue; this is the pure decision over what the queue holds.
 *
 * Pure functions only — no MySQL, Redis, or queue worker needed:
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveBenchmarkStatus } from '../../app/utils/benchmark_status.js'

const IDLE = { status: 'idle' as const, benchmarkId: null }

test('benchmark status: an empty queue falls back to the local status', () => {
  assert.deepEqual(resolveBenchmarkStatus([], IDLE), IDLE)
  // A sync=true run executes in this process and is only visible locally
  const localRun = { status: 'running_cpu' as const, benchmarkId: 'local-1' }
  assert.deepEqual(resolveBenchmarkStatus([], localRun), localRun)
})

test('benchmark status: an active job reports the stage the worker published', () => {
  assert.deepEqual(
    resolveBenchmarkStatus(
      [{ state: 'active', benchmarkId: 'b1', progress: { status: 'running_disk_read' } }],
      IDLE
    ),
    { status: 'running_disk_read', benchmarkId: 'b1' }
  )
})

test('benchmark status: an active job with no usable stage yet is starting, never idle', () => {
  // BullMQ progress starts at 0 before the worker's first update
  for (const progress of [0, null, {}, { status: 'idle' }, { status: 'completed' }, { status: 'error' }]) {
    assert.deepEqual(
      resolveBenchmarkStatus([{ state: 'active', benchmarkId: 'b1', progress }], IDLE),
      { status: 'starting', benchmarkId: 'b1' },
      `progress ${JSON.stringify(progress)}`
    )
  }
})

test('benchmark status: a job still waiting in the queue counts as starting', () => {
  for (const state of ['waiting', 'delayed'] as const) {
    assert.deepEqual(
      resolveBenchmarkStatus([{ state, benchmarkId: 'b2', progress: 0 }], IDLE),
      { status: 'starting', benchmarkId: 'b2' }
    )
  }
})

test('benchmark status: the running job wins over one queued behind it', () => {
  assert.deepEqual(
    resolveBenchmarkStatus(
      [
        { state: 'waiting', benchmarkId: 'queued', progress: 0 },
        { state: 'active', benchmarkId: 'running', progress: { status: 'running_ai' } },
      ],
      IDLE
    ),
    { status: 'running_ai', benchmarkId: 'running' }
  )
})
