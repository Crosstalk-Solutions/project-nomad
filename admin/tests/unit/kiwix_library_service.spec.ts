import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'

import { KiwixLibraryService } from '../../app/services/kiwix_library_service.js'

async function withTempCwd(callback: (dir: string) => Promise<void>) {
  const originalCwd = process.cwd()
  const dir = await mkdtemp(join(tmpdir(), 'kiwix-library-'))

  try {
    process.chdir(dir)
    await callback(dir)
  } finally {
    process.chdir(originalCwd)
    await rm(dir, { recursive: true, force: true })
  }
}

test.group('KiwixLibraryService.ensureReadableLibraryFile', () => {
  test('rebuilds the library XML when the file is missing', async ({ assert }) => {
    await withTempCwd(async () => {
      const service = new KiwixLibraryService()

      assert.isTrue(await service.ensureReadableLibraryFile())

      const xml = await readFile(service.getLibraryFilePath(), 'utf-8')
      assert.include(xml, '<library version="20110515">')
    })
  })

  test('rebuilds the library XML when the file is invalid', async ({ assert }) => {
    await withTempCwd(async (dir) => {
      const service = new KiwixLibraryService()
      await mkdir(join(dir, 'storage/zim'), { recursive: true })
      await writeFile(service.getLibraryFilePath(), '<library><book></library>', 'utf-8')

      assert.isTrue(await service.ensureReadableLibraryFile())

      const xml = await readFile(service.getLibraryFilePath(), 'utf-8')
      assert.include(xml, '<library version="20110515">')
    })
  })

  test('leaves a readable library XML untouched', async ({ assert }) => {
    await withTempCwd(async (dir) => {
      const service = new KiwixLibraryService()
      const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<library version="20110515"></library>'
      await mkdir(join(dir, 'storage/zim'), { recursive: true })
      await writeFile(service.getLibraryFilePath(), xml, 'utf-8')

      assert.isFalse(await service.ensureReadableLibraryFile())
      assert.equal(await readFile(service.getLibraryFilePath(), 'utf-8'), xml)
    })
  })
})
