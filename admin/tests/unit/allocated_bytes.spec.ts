import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getAllocatedBytes } from '../../app/utils/fs.js'

const MiB = 1024 * 1024

test('a sparse file reports far less than its apparent size', async () => {
  // pmtiles extract sizes its output up front and fills it in (#1479)
  const dir = await mkdtemp(join(tmpdir(), 'nomad-sparse-'))
  try {
    const file = join(dir, 'out.pmtiles')
    const fh = await open(file, 'w')
    await fh.truncate(512 * MiB)
    await fh.write(Buffer.alloc(MiB, 1), 0, MiB, 0)
    await fh.close()

    const stats = await stat(file)
    assert.equal(stats.size, 512 * MiB)
    const allocated = getAllocatedBytes(stats)
    assert.ok(allocated >= MiB, `expected at least the written 1 MiB, got ${allocated}`)
    assert.ok(allocated < 64 * MiB, `expected far below the apparent size, got ${allocated}`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a fully written file reports its exact size, not the block-rounded one', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nomad-sparse-'))
  try {
    const file = join(dir, 'small.bin')
    await writeFile(file, Buffer.alloc(1000, 1))
    assert.equal(getAllocatedBytes(await stat(file)), 1000)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('falls back to size when blocks are not reported', () => {
  assert.equal(getAllocatedBytes({ size: 4096 }), 4096)
  assert.equal(getAllocatedBytes({ size: 10n, blocks: 8n }), 10)
})
