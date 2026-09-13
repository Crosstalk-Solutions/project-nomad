import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { seedOpenHopNomadContext } from '../../app/services/openhop_nomad_context.js'

for (const existing of [null, '', '# My instructions\nUse metric units.  ', 'Custom instructions\r\n']) {
  test(`seeds shared NOMAD.md preserving existing content: ${JSON.stringify(existing)}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'nomad-context-'))
    const path = join(root, 'storage', 'NOMAD.md')
    try {
      if (existing !== null) {
        await mkdir(join(root, 'storage'))
        await writeFile(path, existing)
      }
      await seedOpenHopNomadContext(path)
      const content = await readFile(path, 'utf8')
      assert.ok(content.startsWith(existing ?? ''))
      assert.match(content, /## openHop/)
      assert.match(content, /optional NOMAD Bridge plugin/)
      assert.match(content, /direct messages, not channel chat/)
      assert.match(content, /Do not infer.*unsupported.*knowledge-base/)
      await seedOpenHopNomadContext(path)
      assert.equal(await readFile(path, 'utf8'), content)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

test('preserves an existing user-authored openHop section without duplicating it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nomad-context-'))
  const path = join(root, 'NOMAD.md')
  const content = '# Instructions\n\n## openHop\nMy own radio instructions.\n'
  try {
    await writeFile(path, content)
    await seedOpenHopNomadContext(path)
    assert.equal(await readFile(path, 'utf8'), content)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('propagates read failures rather than treating them as an empty file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nomad-context-'))
  try {
    await assert.rejects(seedOpenHopNomadContext(root), { code: 'EISDIR' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
