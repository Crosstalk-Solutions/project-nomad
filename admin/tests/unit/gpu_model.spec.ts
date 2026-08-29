import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { isUnresolvedGpuModel } from '../../app/utils/gpu_model.js'

test('unresolved PCI ids are rejected', () => {
  // The #1165 shape: a card newer than the container's pci.ids database comes
  // back as its raw id. "Device 2d05" is a real RTX 5060 that reached the
  // public leaderboard under that name.
  for (const s of ['Device 2d05', 'device 2d05', 'DEVICE 1002', 'Device  2d05']) {
    assert.equal(isUnresolvedGpuModel(s), true, s)
  }
})

test('empty and unknown are rejected', () => {
  for (const s of ['', '   ', 'Unknown', 'unknown', 'UNKNOWN']) {
    assert.equal(isUnresolvedGpuModel(s), true, JSON.stringify(s))
  }
})

test('WSL placeholder adapter names are rejected', () => {
  // #1218: WSL reaches the GPU via /dev/dxg, so si.graphics() reports
  // Microsoft's placeholder while CUDA runs on a physical card.
  for (const s of [
    'Microsoft Basic Render Driver',
    'microsoft basic render driver',
    'Microsoft Basic Display Adapter',
  ]) {
    assert.equal(isUnresolvedGpuModel(s), true, s)
  }
})

test('real product names are never rejected', () => {
  // The one thing this function must not do. A false positive here discards a
  // correct GPU name and sends "unknown" to the leaderboard instead.
  for (const s of [
    'NVIDIA GeForce RTX 5090',
    'NVIDIA GeForce RTX 3090 Ti',
    'AMD Radeon RX 6800',
    'Navi 48 [Radeon AI PRO R9700]',
    'Intel Iris Xe Graphics',
    'Raphael',
    'Phoenix1',
    'Device Manager Graphics 5000',
    'GeForce GTX 1080',
    'Microsoft Basic Render Driver Pro',
  ]) {
    assert.equal(isUnresolvedGpuModel(s), false, s)
  }
})

test('a hex-like id that is not the placeholder shape is kept', () => {
  // Guard the regex against over-reach: only a bare "Device <4 hex>" qualifies.
  for (const s of ['Device 2d05x', 'Device 2d0', 'Device 2d055', 'My Device 2d05']) {
    assert.equal(isUnresolvedGpuModel(s), false, s)
  }
})
