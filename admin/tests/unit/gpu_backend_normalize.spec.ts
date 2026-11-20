import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeGpuBackend, type GpuBackend } from '../../app/services/ollama_compute.js'

test('null / undefined / empty coerce to auto (default, no hard error)', () => {
  assert.equal(normalizeGpuBackend(null), 'auto')
  assert.equal(normalizeGpuBackend(undefined), 'auto')
  assert.equal(normalizeGpuBackend(''), 'auto')
  assert.equal(normalizeGpuBackend('   '), 'auto')
})

test('canonical values pass through', () => {
  for (const v of ['auto', 'rocm', 'vulkan', 'cuda'] as GpuBackend[]) {
    assert.equal(normalizeGpuBackend(v), v)
  }
})

test('trim + lowercase is applied (spec: values are lowercase, trimmed)', () => {
  assert.equal(normalizeGpuBackend('Vulkan'), 'vulkan')
  assert.equal(normalizeGpuBackend('  VULKAN  '), 'vulkan')
  assert.equal(normalizeGpuBackend('RoCm'), 'rocm')
  assert.equal(normalizeGpuBackend(' CUDA '), 'cuda')
})

test('unknown values fall back to auto (forward-compatible)', () => {
  assert.equal(normalizeGpuBackend('metal'), 'auto')
  assert.equal(normalizeGpuBackend('rocmx'), 'auto')
  assert.equal(normalizeGpuBackend(''), 'auto')
  assert.equal(normalizeGpuBackend('vulkn'), 'auto')
})

test('KV boolean / number values are coerced via String() without throwing', () => {
  assert.equal(normalizeGpuBackend(true), 'auto')
  assert.equal(normalizeGpuBackend(0), 'auto')
})
