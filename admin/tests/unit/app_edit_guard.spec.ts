import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { selectVolumesForEditGuard } from '../../app/services/app_edit_guard.js'

const usbVolume = { host_path: '/dev', container_path: '/host/dev' }

test('curated app edit does not re-guard an unchanged inherited system bind', () => {
  const result = selectVolumesForEditGuard({
    proposed: [
      { host_path: '/opt/project-nomad/storage/openhop-repeater/data', container_path: '/data' },
      usbVolume,
    ],
    existing: [usbVolume],
    isCustom: false,
  })

  assert.deepEqual(result, [
    { host_path: '/opt/project-nomad/storage/openhop-repeater/data', container_path: '/data' },
  ])
})

test('curated app edit still guards changed or newly-added system binds', () => {
  const result = selectVolumesForEditGuard({
    proposed: [
      { host_path: '/dev', container_path: '/different-device-tree' },
      { host_path: '/etc', container_path: '/host/etc' },
    ],
    existing: [usbVolume],
    isCustom: false,
  })

  assert.deepEqual(result, [
    { host_path: '/dev', container_path: '/different-device-tree' },
    { host_path: '/etc', container_path: '/host/etc' },
  ])
})

test('custom app edits always re-guard every proposed bind', () => {
  const result = selectVolumesForEditGuard({
    proposed: [usbVolume],
    existing: [usbVolume],
    isCustom: true,
  })

  assert.deepEqual(result, [usbVolume])
})

test('equivalent normalized paths count as the inherited curated bind', () => {
  const result = selectVolumesForEditGuard({
    proposed: [{ host_path: '/dev/', container_path: '/host/./dev' }],
    existing: [usbVolume],
    isCustom: false,
  })

  assert.deepEqual(result, [])
})
