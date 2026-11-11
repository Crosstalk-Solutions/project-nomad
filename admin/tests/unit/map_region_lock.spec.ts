import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withMapRegionLock } from '../../app/utils/map_region_lock.js'

test('an owner holds the shared lock across clock changes, then another writer can enter', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nomad-region-lock-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'routing.sqlite')
  const events: string[] = []
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const first = withMapRegionLock(path, async () => {
    events.push('first entered')
    await held
    events.push('first exited')
  })
  const clock = Date.now()
  t.mock.method(Date, 'now', () => clock + 130000)
  const second = withMapRegionLock(path, async () => {
    events.push('second entered')
  })
  try {
    await setTimeout(60)
    assert.deepEqual(events, ['first entered'])
  } finally {
    release()
    await Promise.all([first, second])
  }
  assert.deepEqual(events, ['first entered', 'first exited', 'second entered'])
})

test(
  'a killed process releases the region lock for the next writer',
  { timeout: 5000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'nomad-region-lock-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const path = join(root, 'routing.sqlite')
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import Database from 'better-sqlite3'
       const lock = new Database(process.argv[1])
       lock.exec('BEGIN IMMEDIATE')
       process.stdout.write('locked')
       setInterval(() => {}, 1000)`,
        path,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] }
    )
    const exited = once(child, 'exit')
    try {
      const result = await Promise.race([
        once(child.stdout, 'data'),
        exited.then(() => {
          throw new Error('Lock holder exited before acquiring the lock')
        }),
      ])
      assert.equal(String(result[0]), 'locked')
    } finally {
      child.kill('SIGKILL')
      await exited
    }
    assert.equal(await withMapRegionLock(path, async () => 'recovered'), 'recovered')
  }
)
