import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { describeNvidiaStartError, isNvidiaStartError } from '../../app/utils/nvidia_start_error.js'

// Verbatim from #1641.
const DRIVER_MISMATCH =
  '(HTTP code 500) server error - failed to create task for container: failed to create shim task: ' +
  'OCI runtime create failed: runc create failed: unable to start container process: error during ' +
  'container init: error running prestart hook #0: exit status 1, stdout: , stderr: Auto-detected ' +
  "mode as 'legacy' nvidia-container-cli: initialization error: nvml error: driver/library version mismatch"

/** Regression: #1641. A driver/library mismatch killed the whole Ollama install. */
test('an NVML driver/library mismatch is an NVIDIA start error', () => {
  assert.equal(isNvidiaStartError(new Error(DRIVER_MISMATCH)), true)
})

test('other nvidia-container-cli failures are NVIDIA start errors', () => {
  const driverNotLoaded =
    'error running prestart hook #0: exit status 1, stdout: , stderr: nvidia-container-cli: ' +
    'initialization error: load library failed: libnvidia-ml.so.1: cannot open shared object file'
  assert.equal(isNvidiaStartError(new Error(driverNotLoaded)), true)
})

test('a missing nvidia device driver is an NVIDIA start error', () => {
  const msg =
    '(HTTP code 500) server error - could not select device driver "nvidia" with capabilities: [[gpu]]'
  assert.equal(isNvidiaStartError(new Error(msg)), true)
})

test('unrelated start failures are not NVIDIA start errors', () => {
  // Falling back to CPU on these would hide a real failure behind a degraded install.
  for (const msg of [
    'Bind for 0.0.0.0:11434 failed: port is already allocated',
    'error gathering device information while adding custom device "/dev/kfd": no such file or directory',
    'invalid mount config for type "bind": bind source path does not exist: /opt/project-nomad/storage',
  ]) {
    assert.equal(isNvidiaStartError(new Error(msg)), false, msg)
  }
})

test('non-Error values are handled', () => {
  assert.equal(isNvidiaStartError(DRIVER_MISMATCH), true)
  assert.equal(isNvidiaStartError(undefined), false)
})

test('a driver/library mismatch tells the user to reboot', () => {
  const msg = describeNvidiaStartError(new Error(DRIVER_MISMATCH))
  assert.match(msg, /CPU-only/)
  assert.match(msg, /Reboot this machine/)
})

test('other NVIDIA start errors point at nvidia-smi and the toolkit', () => {
  const msg = describeNvidiaStartError(
    new Error('nvidia-container-cli: initialization error: driver error: failed to process request')
  )
  assert.match(msg, /CPU-only/)
  assert.doesNotMatch(msg, /Reboot/)
  assert.match(msg, /NVIDIA Container Toolkit/)
})
