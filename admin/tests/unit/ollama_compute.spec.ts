import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { classifyOllamaComputeBackend } from '../../app/services/ollama_compute.js'

test('CUDA inference line is classified as gpu', () => {
  const log =
    'time=2026-07-16T00:49:00.371Z level=INFO source=types.go:32 msg="inference compute" id=0 filter_id=0 library=CUDA compute=12.1 name=CUDA0 description="NVIDIA GB10" libdirs=ollama,cuda_v13 driver=13.0 pci_id=000f:01:00.0 type=iGPU total="121.7 GiB" available="96.8 GiB"'
  assert.equal(classifyOllamaComputeBackend(log), 'gpu')
})

test('CPU-only inference line is classified as cpu', () => {
  const log =
    'time=2026-07-15T01:51:42.511Z level=INFO source=types.go:50 msg="inference compute" id=cpu library=cpu compute="" name=cpu description=cpu libdirs=ollama driver="" pci_id="" type="" total="121.7 GiB" available="121.7 GiB"'
  assert.equal(classifyOllamaComputeBackend(log), 'cpu')
})

test('a GPU line alongside a CPU fallback line is still gpu', () => {
  const log =
    'msg="inference compute" id=0 library=CUDA compute=12.1 name=CUDA0\n' +
    'msg="inference compute" id=1 library=cpu name=cpu'
  assert.equal(classifyOllamaComputeBackend(log), 'gpu')
})

test('no inference compute line is unknown', () => {
  assert.equal(
    classifyOllamaComputeBackend('time=... level=INFO msg="some other line"\nno compute line here'),
    'unknown'
  )
})

test('empty log is unknown', () => {
  assert.equal(classifyOllamaComputeBackend(''), 'unknown')
})

test('ROCm and Vulkan are gpu backends', () => {
  assert.equal(
    classifyOllamaComputeBackend('msg="inference compute" id=0 library=ROCm name=AMD'),
    'gpu'
  )
  assert.equal(
    classifyOllamaComputeBackend('msg="inference compute" id=0 library=Vulkan name=Intel'),
    'gpu'
  )
})
