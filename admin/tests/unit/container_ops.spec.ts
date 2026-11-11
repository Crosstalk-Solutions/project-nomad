import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  affectedRowCount,
  containerOnlyLabels,
  isValidImageTag,
} from '../../app/utils/container_ops.js'

test('isValidImageTag accepts ordinary Docker tags', () => {
  for (const tag of ['latest', '0.23.2', 'v1.2.3-rc1', 'rocm', '_x', 'a'.repeat(128)]) {
    assert.equal(isValidImageTag(tag), true, tag)
  }
})

test('isValidImageTag rejects anything that could change the image reference', () => {
  for (const tag of [
    '',
    '.hidden',
    '-flag',
    'a'.repeat(129),
    '1.0@sha256:abc',
    'evil/image:tag',
    '1.0 2',
    '1.0\n',
    'tag:other',
  ]) {
    assert.equal(isValidImageTag(tag), false, JSON.stringify(tag))
  }
  assert.equal(isValidImageTag(undefined), false)
  assert.equal(isValidImageTag(123), false)
})

test('affectedRowCount reads the Lucid write result shape', () => {
  // Lucid's model query builder wraps the mysql2 result: [affectedRows]
  assert.equal(affectedRowCount([1]), 1)
  assert.equal(affectedRowCount([0]), 0)
  assert.equal(affectedRowCount(1), 1)
  assert.equal(affectedRowCount([{ affectedRows: 1 }]), 1)
  // Unknown shapes never count as a successful claim
  assert.equal(affectedRowCount([]), 0)
  assert.equal(affectedRowCount(null), 0)
  assert.equal(affectedRowCount(['1']), 0)
})

test('containerOnlyLabels keeps container labels and drops inherited image labels', () => {
  const containerLabels = {
    'io.project-nomad.managed': 'true',
    'com.docker.compose.project': 'project-nomad-managed',
    'org.opencontainers.image.version': '0.18.2', // from the old image
    'maintainer': 'overridden', // container overrode the image value
  }
  const imageLabels = { 'org.opencontainers.image.version': '0.18.2', 'maintainer': 'upstream' }
  assert.deepEqual(containerOnlyLabels(containerLabels, imageLabels), {
    'io.project-nomad.managed': 'true',
    'com.docker.compose.project': 'project-nomad-managed',
    'maintainer': 'overridden',
  })
})

test('containerOnlyLabels keeps everything when the image labels are unknown', () => {
  const labels = { 'io.project-nomad.managed': 'true', 'x': 'y' }
  assert.deepEqual(containerOnlyLabels(labels, undefined), labels)
  assert.deepEqual(containerOnlyLabels(null, { x: 'y' }), {})
})
