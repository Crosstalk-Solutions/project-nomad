import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import JSZip from 'jszip'

import {
  assertZipWithinLimits,
  checkZipSize,
  ZipLimitError,
  ZIP_MAX_UNCOMPRESSED_BYTES,
} from '../../app/utils/zip_limits.js'

const MB = 1024 * 1024

test('checkZipSize accepts normal documents', () => {
  assert.equal(checkZipSize(2 * MB, 8 * MB), null)
  // small but very repetitive XML: high ratio, tiny absolute size
  assert.equal(checkZipSize(10 * 1024, 5 * MB), null)
})

test('checkZipSize rejects above the absolute cap and above the ratio', () => {
  assert.match(checkZipSize(100 * MB, ZIP_MAX_UNCOMPRESSED_BYTES + 1)!, /MB/)
  assert.match(checkZipSize(100 * 1024, 50 * MB)!, /ratio/)
})

async function zipOf(files: Record<string, Buffer | string>): Promise<Buffer> {
  const zip = new JSZip()
  for (const [name, data] of Object.entries(files)) zip.file(name, data)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

test('assertZipWithinLimits passes a normal archive', async () => {
  const buf = await zipOf({ 'word/document.xml': '<w:t>hello</w:t>'.repeat(1000) })
  await assertZipWithinLimits(await JSZip.loadAsync(buf), buf.length)
})

test('assertZipWithinLimits rejects a highly compressed bomb', async () => {
  const buf = await zipOf({ 'a.xml': Buffer.alloc(30 * MB) })
  await assert.rejects(assertZipWithinLimits(await JSZip.loadAsync(buf), buf.length), ZipLimitError)
})

test('assertZipWithinLimits catches a header that under-declares the size', async () => {
  const buf = await zipOf({ 'a.xml': Buffer.alloc(30 * MB) })
  const zip = await JSZip.loadAsync(buf)
  // Simulate a forged central directory: declared size says 1 KB
  ;(zip.files['a.xml'] as any)._data.uncompressedSize = 1024
  // The declared check passes; the streamed count (or JSZip's own size check) rejects it
  await assert.rejects(assertZipWithinLimits(zip, buf.length))
})
