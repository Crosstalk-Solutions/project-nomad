import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  classifyOllamaComputeBackend,
  diagnoseAmdCpuFallback,
  diffAmdOllamaConfig,
  parseAmdGfxTargetFromLogs,
  parseOllamaGpuFromLogs,
  resolveExpectedGpuVendor,
} from '../../app/services/ollama_compute.js'

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

test('parseOllamaGpuFromLogs takes the GPU line even when the CPU line comes last', () => {
  const log =
    'msg="inference compute" id=0 library=ROCm compute=gfx1150 name=ROCm0 description="AMD Radeon 890M" total="16.0 GiB"\n' +
    'msg="inference compute" id=cpu library=cpu name=cpu'
  assert.deepEqual(parseOllamaGpuFromLogs(log), {
    library: 'ROCm',
    name: 'AMD Radeon 890M',
    vramMiB: 16384,
  })
})

test('parseOllamaGpuFromLogs recognizes Vulkan and falls back to a generic name', () => {
  assert.deepEqual(parseOllamaGpuFromLogs('msg="inference compute" id=0 library=Vulkan name=V0'), {
    library: 'Vulkan',
    name: 'GPU',
    vramMiB: 0,
  })
})

test('parseOllamaGpuFromLogs returns null for a CPU-only log', () => {
  assert.equal(parseOllamaGpuFromLogs('msg="inference compute" id=cpu library=cpu name=cpu'), null)
})

const ROCM_CONTAINER = {
  Config: {
    Image: 'ollama/ollama:rocm',
    Env: ['OLLAMA_NO_CLOUD=1', 'HSA_OVERRIDE_GFX_VERSION=11.0.0', 'OLLAMA_IGPU_ENABLE=1'],
  },
  HostConfig: {
    Devices: [{ PathOnHost: '/dev/kfd' }, { PathOnHost: '/dev/dri' }],
  },
}

const CPU_CONTAINER = {
  Config: { Image: 'ollama/ollama:0.18.2', Env: ['OLLAMA_NO_CLOUD=1'] },
  HostConfig: {},
}

test('a ROCm container is expected on AMD with no Docker runtime registered (#1344)', () => {
  assert.equal(
    resolveExpectedGpuVendor({ hasNvidiaRuntime: false, amdConfigured: false, container: ROCM_CONTAINER }),
    'amd'
  )
})

test('a /dev/kfd device alone marks the container as AMD', () => {
  const container = {
    Config: { Image: 'ollama/ollama:0.18.2' },
    HostConfig: { Devices: [{ PathOnHost: '/dev/kfd' }] },
  }
  assert.equal(
    resolveExpectedGpuVendor({ hasNvidiaRuntime: false, amdConfigured: false, container }),
    'amd'
  )
})

test('a versioned ROCm tag marks the container as AMD, a rocm repo path does not', () => {
  const tagged = { Config: { Image: 'ollama/ollama:0.12.0-rocm' }, HostConfig: {} }
  const repoOnly = { Config: { Image: 'rocm/ollama:latest' }, HostConfig: {} }
  const input = { hasNvidiaRuntime: false, amdConfigured: false }
  assert.equal(resolveExpectedGpuVendor({ ...input, container: tagged }), 'amd')
  assert.equal(resolveExpectedGpuVendor({ ...input, container: repoOnly }), null)
})

test('/dev/dri alone is not treated as AMD', () => {
  const container = {
    Config: { Image: 'ollama/ollama:0.18.2' },
    HostConfig: { Devices: [{ PathOnHost: '/dev/dri' }] },
  }
  assert.equal(
    resolveExpectedGpuVendor({ hasNvidiaRuntime: false, amdConfigured: false, container }),
    null
  )
})

test('an nvidia DeviceRequest is expected on NVIDIA even without the runtime', () => {
  const container = {
    Config: { Image: 'ollama/ollama:0.18.2' },
    HostConfig: { DeviceRequests: [{ Driver: 'nvidia' }] },
  }
  assert.equal(
    resolveExpectedGpuVendor({ hasNvidiaRuntime: false, amdConfigured: false, container }),
    'nvidia'
  )
})

test('a CPU container is expected on NVIDIA when the runtime was registered after install', () => {
  assert.equal(
    resolveExpectedGpuVendor({ hasNvidiaRuntime: true, amdConfigured: false, container: CPU_CONTAINER }),
    'nvidia'
  )
})

test('a CPU container on an AMD box is trusted as deliberate (#1232 fallback)', () => {
  assert.equal(
    resolveExpectedGpuVendor({ hasNvidiaRuntime: false, amdConfigured: true, container: CPU_CONTAINER }),
    null
  )
})

test('the AMD GPU type counts when no container exists', () => {
  assert.equal(
    resolveExpectedGpuVendor({ hasNvidiaRuntime: false, amdConfigured: true, container: null }),
    'amd'
  )
  assert.equal(
    resolveExpectedGpuVendor({ hasNvidiaRuntime: false, amdConfigured: false, container: null }),
    null
  )
})

test('diffAmdOllamaConfig is empty when a reinstall would rebuild the same container', () => {
  assert.deepEqual(diffAmdOllamaConfig(ROCM_CONTAINER, '11.0.0'), [])
})

test('diffAmdOllamaConfig reports an HSA override the container is missing', () => {
  const container = {
    ...ROCM_CONTAINER,
    Config: { ...ROCM_CONTAINER.Config, Env: ['OLLAMA_NO_CLOUD=1', 'OLLAMA_IGPU_ENABLE=1'] },
  }
  assert.deepEqual(diffAmdOllamaConfig(container, '11.0.0'), [
    'HSA_OVERRIDE_GFX_VERSION is unset, expected 11.0.0',
  ])
})

test('diffAmdOllamaConfig reports a stale override when none is wanted', () => {
  assert.deepEqual(diffAmdOllamaConfig(ROCM_CONTAINER, null), [
    'HSA_OVERRIDE_GFX_VERSION is 11.0.0, expected unset',
  ])
})

test('diffAmdOllamaConfig reports missing image, devices and iGPU flag', () => {
  assert.deepEqual(diffAmdOllamaConfig(CPU_CONTAINER, null), [
    'image is ollama/ollama:0.18.2, not the ROCm build',
    '/dev/kfd is not passed through',
    '/dev/dri is not passed through',
    'OLLAMA_IGPU_ENABLE=1 is not set',
  ])
})

const UNSUPPORTED_GFX1103_LOG =
  'level=WARN source=amd_linux.go msg="amdgpu is not supported (supported types:[gfx1030 gfx1100])" gpu_type=gfx1103 gpu=0 library=/usr/lib/ollama/rocm\n' +
  'msg="inference compute" id=cpu library=cpu name=cpu'

test('parseAmdGfxTargetFromLogs reads the gfx target Ollama rejected', () => {
  assert.equal(parseAmdGfxTargetFromLogs(UNSUPPORTED_GFX1103_LOG), 'gfx1103')
  assert.equal(parseAmdGfxTargetFromLogs('msg="inference compute" id=cpu library=cpu'), null)
})

test('diagnoseAmdCpuFallback on the #1344 box: matching config, override needed', () => {
  const container = {
    ...ROCM_CONTAINER,
    Config: { ...ROCM_CONTAINER.Config, Env: ['OLLAMA_NO_CLOUD=1', 'OLLAMA_IGPU_ENABLE=1'] },
  }
  // No gfx marker and no KV override, so a reinstall resolves no override either.
  assert.deepEqual(diagnoseAmdCpuFallback(container, UNSUPPORTED_GFX1103_LOG, null), {
    amdReinstallWouldChange: false,
    amdGfxTarget: 'gfx1103',
    suggestedHsaOverride: '11.0.0',
  })
})

test('diagnoseAmdCpuFallback flags a reinstall when a newly set override is missing', () => {
  const container = {
    ...ROCM_CONTAINER,
    Config: { ...ROCM_CONTAINER.Config, Env: ['OLLAMA_NO_CLOUD=1', 'OLLAMA_IGPU_ENABLE=1'] },
  }
  assert.equal(
    diagnoseAmdCpuFallback(container, UNSUPPORTED_GFX1103_LOG, '11.0.0').amdReinstallWouldChange,
    true
  )
})

test('diagnoseAmdCpuFallback reports the current override and omits unknown fields', () => {
  assert.deepEqual(diagnoseAmdCpuFallback(ROCM_CONTAINER, '', '11.0.0'), {
    amdReinstallWouldChange: false,
    currentHsaOverride: '11.0.0',
  })
})
