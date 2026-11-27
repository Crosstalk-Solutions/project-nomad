import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { access, mkdtemp, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getAllocatedBytes } from '../../app/utils/pmtiles_progress.js'

const MiB = 1024 * 1024

test('a pre-sized sparse PMTiles file reports allocated data instead of its final logical length', async (context) => {
  if (process.platform !== 'linux') return context.skip('Real sparse allocation fixture is validated on Linux')
  const directory = await mkdtemp(join(tmpdir(), 'nomad-pmtiles-progress-'))
  try {
    const filename = join(directory, 'map.pmtiles.tmp')
    const handle = await open(filename, 'w')
    try {
      await handle.truncate(512 * MiB)
      await handle.sync()
      assert.equal(getAllocatedBytes(await handle.stat()), 0)
      await handle.write(Buffer.alloc(MiB, 1), 0, MiB, 0)
      await handle.sync()
    } finally {
      await handle.close()
    }
    const information = await stat(filename)
    assert.equal(information.size, 512 * MiB)
    const allocated = getAllocatedBytes(information)
    assert.ok(allocated >= MiB, `Expected the written 1 MiB, got ${allocated}`)
    assert.ok(allocated < 64 * MiB, `Sparse file should not look finished: ${allocated}`)
    assert.equal(information.size, 512 * MiB, 'Progress must not change the completed logical size')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('a dense file is capped at its exact length despite allocation-block rounding', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nomad-pmtiles-dense-'))
  try {
    const filename = join(directory, 'small.pmtiles.tmp')
    await writeFile(filename, Buffer.alloc(1000, 1))
    assert.equal(getAllocatedBytes(await stat(filename)), 1000)
    assert.equal(getAllocatedBytes({ size: 1000, blocks: 8 }), 1000)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('missing block counts fall back to logical size and zero blocks remain zero', () => {
  assert.equal(getAllocatedBytes({ size: 4096 }), 4096)
  assert.equal(getAllocatedBytes({ size: 512 * MiB, blocks: 0 }), 0)
  assert.equal(getAllocatedBytes({ size: 0, blocks: 0 }), 0)
  assert.equal(getAllocatedBytes({ size: 5120n, blocks: 2n }), 1024)
  assert.equal(getAllocatedBytes({ size: 10n, blocks: 8n }), 10)
})

test('invalid filesystem hints cannot publish NaN, negative or infinite progress bytes', () => {
  for (const size of [NaN, Infinity, -1]) assert.equal(getAllocatedBytes({ size, blocks: 8 }), 0)
  for (const blocks of [NaN, Infinity, -1, 0.5]) assert.equal(getAllocatedBytes({ size: 4096, blocks }), 4096)
  assert.equal(getAllocatedBytes({ size: 4096, blocks: Number.MAX_VALUE }), 4096)
})

test('the actual extraction job reports sparse progress and publishes only successful outputs', async (context) => {
  if (process.platform !== 'linux') return context.skip('Subprocess sparse fixture is validated on Linux')
  if (!process.execArgv.includes('--experimental-test-module-mocks')) {
    return context.skip('Run with --experimental-test-module-mocks for isolated queue/logger/CLI boundaries')
  }
  const directory = await mkdtemp(join(tmpdir(), 'nomad-extract-job-'))
  const binary = join(directory, 'fake-pmtiles.mjs')
  const logicalSize = 128 * MiB
  await writeFile(binary, `
import { open, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const [output, gate, mode] = process.argv.slice(2);
process.on('SIGTERM', () => process.exit(42));
const file = await open(output, 'w');
await file.truncate(${logicalSize});
await file.write(Buffer.alloc(${MiB}, 1), 0, ${MiB}, 0);
await file.sync(); await file.close();
await writeFile(output + '.created', 'ready');
const timer = setInterval(() => {
  if (existsSync(gate)) { clearInterval(timer); process.exit(mode === 'failure' ? 7 : 0); }
}, 20);
`)
  let current: { gate: string; mode: string; cancelled: boolean }
  const redis = { get: async () => current.cancelled ? '1' : null, del: async () => 1 }
  context.mock.module('#services/queue_service', {
    namedExports: { QueueService: { getInstance: () => ({ getQueue: () => ({ client: Promise.resolve(redis) }) }) } },
  })
  context.mock.module('@adonisjs/core/services/logger', {
    defaultExport: { info() {}, warn() {}, debug() {}, error() {} },
  })
  context.mock.module(new URL('../../constants/map_regions.js', import.meta.url).href, {
    namedExports: {
      PMTILES_BINARY_PATH: process.execPath,
      buildPmtilesExtractArgs: ({ outputFilepath }: { outputFilepath: string }) =>
        [binary, outputFilepath, current.gate, current.mode],
    },
  })
  const { RunExtractPmtilesJob } = await import('../../app/jobs/run_extract_pmtiles_job.js')
  const waitUntil = async (condition: () => Promise<boolean> | boolean, description: string) => {
    const deadline = Date.now() + 12_000
    while (!await condition()) {
      if (Date.now() >= deadline) throw new Error('Timed out: ' + description)
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  try {
    for (const mode of ['success', 'cancel', 'failure']) {
      const output = join(directory, mode + '.pmtiles')
      const staging = output + '.tmp'
      await writeFile(output, 'previous verified map')
      current = { gate: join(directory, mode + '.finish'), mode, cancelled: false }
      const frames: { percent: number; downloadedBytes: number; totalBytes: number }[] = []
      const job = {
        id: mode,
        data: { sourceUrl: 'https://fixture.invalid/world.pmtiles', outputFilepath: output,
          regionFilepath: join(directory, 'region.geojson'), estimatedBytes: logicalSize, filetype: 'map' },
        updateProgress: async (frame: { percent: number; downloadedBytes: number; totalBytes: number }) => { frames.push(frame) },
      }
      const execution = new RunExtractPmtilesJob().handle(job as never).then(
        (result) => ({ result, error: undefined }), (error: Error) => ({ error, result: undefined }))
      try {
        await waitUntil(async () => { try { await access(staging + '.created'); return true } catch { return false } }, 'CLI output creation')
        await waitUntil(() => frames.length > 0, 'sparse progress tick')
        assert.ok(frames[0].downloadedBytes >= MiB)
        assert.ok(frames[0].downloadedBytes < logicalSize / 4)
        assert.ok(frames.every((frame) => frame.percent < 99), 'Pre-sized file must not look complete')
        assert.equal(await readFile(output, 'utf8'), 'previous verified map', 'Running extraction must keep the installed map')
        assert.equal((await stat(staging)).size, logicalSize)
        if (mode === 'cancel') current.cancelled = true
        else await writeFile(current.gate, 'finish')
        const outcome = await execution
        if (mode === 'success') {
          assert.equal(outcome.error, undefined)
          assert.equal(frames.at(-1)?.percent, 100)
          assert.equal(frames.at(-1)?.downloadedBytes, logicalSize, 'Finished archive keeps logical size accounting')
          assert.equal((await stat(output)).size, logicalSize)
        } else {
          assert.ok(outcome.error)
          assert.match(outcome.error.message, mode === 'cancel' ? /cancelled/i : /exited with code 7/)
          assert.equal(await readFile(output, 'utf8'), 'previous verified map')
          assert.ok(frames.every((frame) => frame.percent < 100))
        }
        await assert.rejects(access(staging), { code: 'ENOENT' })
        assert.equal(RunExtractPmtilesJob.childProcesses.has(mode), false)
      } finally {
        RunExtractPmtilesJob.childProcesses.get(mode)?.kill('SIGTERM')
        await execution
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
