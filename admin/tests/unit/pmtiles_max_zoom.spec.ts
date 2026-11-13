import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readPmtilesMaxZoom } from '../../app/utils/pmtiles_header.js'

// Synthetic PMTiles v3 header: 7-byte "PMTILES" magic + version byte + fixed
// layout with maxZoom at byte offset 101 (minZoom=100, per bytesToHeader).
function makeHeader(maxZoom: number): Buffer {
  const buf = Buffer.alloc(127)
  Buffer.from('PMTILES', 'ascii').copy(buf, 0)
  buf.writeUInt8(3, 7)
  buf.writeUInt8(maxZoom, 101)
  return buf
}

test('reads maxZoom from a valid PMTiles archive header', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pmtiles-header-'))
  try {
    const file = join(dir, 'new_jersey.pmtiles')
    await writeFile(file, makeHeader(15))
    assert.equal(await readPmtilesMaxZoom(file), 15)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('returns null for a missing file', async () => {
  assert.equal(await readPmtilesMaxZoom('/nonexistent/path/us.pmtiles'), null)
})

test('returns null for a truncated file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pmtiles-header-'))
  try {
    const file = join(dir, 'truncated.pmtiles')
    await writeFile(file, makeHeader(12).subarray(0, 64))
    assert.equal(await readPmtilesMaxZoom(file), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('returns null for a non-PMTiles file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pmtiles-header-'))
  try {
    const file = join(dir, 'not-a-map.pmtiles')
    await writeFile(file, Buffer.alloc(127, 0x41)) // plain ASCII filler, wrong magic
    assert.equal(await readPmtilesMaxZoom(file), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
