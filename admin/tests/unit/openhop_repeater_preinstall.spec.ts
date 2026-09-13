import * as assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  OPENHOP_REPEATER_SEED_CONFIG,
  prepareOpenHopRepeaterStorage,
} from '../../app/services/openhop_repeater_preinstall.js'

const temporaryRoots: string[] = []

async function makeTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'nomad-openhop-repeater-'))
  temporaryRoots.push(root)
  return root
}

function currentOwnership(): { uid: number; gid: number } {
  return {
    uid: process.getuid?.() ?? 0,
    gid: process.getgid?.() ?? 0,
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

test('fresh storage receives a private radio-disabled setup configuration', async () => {
  const root = await makeTemporaryRoot()

  const result = await prepareOpenHopRepeaterStorage(root, currentOwnership())

  assert.equal(result.created, true)
  assert.equal(result.configPath, join(root, 'openhop-repeater', 'config', 'config.yaml'))
  assert.equal(await readFile(result.configPath, 'utf8'), OPENHOP_REPEATER_SEED_CONFIG)
  assert.match(OPENHOP_REPEATER_SEED_CONFIG, /mode: no_tx/)
  assert.match(OPENHOP_REPEATER_SEED_CONFIG, /radio_type: null/)
  assert.match(OPENHOP_REPEATER_SEED_CONFIG, /admin_password: null/)
  assert.match(OPENHOP_REPEATER_SEED_CONFIG, /guest_password: null/)
  assert.doesNotMatch(OPENHOP_REPEATER_SEED_CONFIG, /admin123|guest123/)
  const configStats = await stat(result.configPath)
  const dataStats = await stat(join(root, 'openhop-repeater', 'data'))
  assert.equal(configStats.mode & 0o777, 0o600)
  assert.ok(dataStats.isDirectory())
})

test('existing non-empty configuration is preserved', async () => {
  const root = await makeTemporaryRoot()
  const first = await prepareOpenHopRepeaterStorage(root, currentOwnership())
  const existing = 'repeater:\n  node_name: preserved\nradio_type: pymc_tcp\n'
  await writeFile(first.configPath, existing, { mode: 0o600 })

  const second = await prepareOpenHopRepeaterStorage(root, currentOwnership())

  assert.equal(second.created, false)
  assert.equal(await readFile(first.configPath, 'utf8'), existing)
})

test('empty configuration is safely replaced and repeated preparation is idempotent', async () => {
  const root = await makeTemporaryRoot()
  const first = await prepareOpenHopRepeaterStorage(root, currentOwnership())
  await writeFile(first.configPath, '')

  const replacement = await prepareOpenHopRepeaterStorage(root, currentOwnership())
  const repeated = await prepareOpenHopRepeaterStorage(root, currentOwnership())

  assert.equal(replacement.created, true)
  assert.equal(repeated.created, false)
  assert.equal(await readFile(first.configPath, 'utf8'), OPENHOP_REPEATER_SEED_CONFIG)
})
