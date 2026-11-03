import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { shouldWarnGpuBeforeBenchmark } from '../../inertia/lib/benchmark_gpu_preflight.js'

test('warns for full and AI runs when GPU passthrough has failed', () => {
  assert.equal(shouldWarnGpuBeforeBenchmark('full', { status: 'passthrough_failed' }), true)
  assert.equal(shouldWarnGpuBeforeBenchmark('ai', { status: 'passthrough_failed' }), true)
})

test('never warns for a system-only run, which does not use the GPU', () => {
  assert.equal(shouldWarnGpuBeforeBenchmark('system', { status: 'passthrough_failed' }), false)
})

test('does not warn when the GPU is usable, absent, or Ollama is not installed', () => {
  for (const status of ['ok', 'no_gpu', 'ollama_not_installed'] as const) {
    assert.equal(shouldWarnGpuBeforeBenchmark('full', { status }), false, status)
    assert.equal(shouldWarnGpuBeforeBenchmark('ai', { status }), false, status)
  }
})

test('does not warn when GPU health is unknown', () => {
  assert.equal(shouldWarnGpuBeforeBenchmark('full', undefined), false)
  assert.equal(shouldWarnGpuBeforeBenchmark('ai', null), false)
})
