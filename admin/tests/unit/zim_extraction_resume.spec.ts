/**
 * Batched ZIM extraction resumes at the dirent cursor without gaps or repeats (#1185).
 *
 * A Japa spec, not a plain `node:test` file: ZIMExtractionService imports
 * '@adonisjs/core/services/logger' at module scope and needs a booted app.
 * Run with `node ace test unit`.
 */
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { test } from '@japa/runner'
import { ZIMExtractionService } from '../../app/services/zim_extraction_service.js'

const ZIM = fileURLToPath(new URL('../../../install/wikipedia_en_100_mini_2026-01.zim', import.meta.url))
const BATCH = 7

function articlePaths(chunks: { articlePath: string }[]) {
  return [...new Set(chunks.map((c) => c.articlePath))]
}

test('chained seek batches cover the archive exactly once', async () => {
  const service = new ZIMExtractionService()
  const whole = await service.extractZIMContent(ZIM)

  const batched: string[] = []
  let startOffset = 0
  let resumeAtDirent: number | undefined
  for (;;) {
    const r = await service.extractZIMContent(ZIM, { startOffset, batchSize: BATCH, resumeAtDirent })
    batched.push(...articlePaths(r.chunks))
    if (r.articlesProcessed < BATCH) break
    startOffset += r.articlesProcessed
    resumeAtDirent = r.resumeAtDirent
  }

  assert.ok(startOffset > BATCH, 'expected several batches')
  assert.deepEqual(batched, articlePaths(whole.chunks))
}).timeout(60000)

test('a legacy job without a cursor hands off the same cursor the seek path would', async () => {
  const service = new ZIMExtractionService()
  const first = await service.extractZIMContent(ZIM, { batchSize: BATCH })
  const seek = await service.extractZIMContent(ZIM, {
    startOffset: BATCH,
    batchSize: BATCH,
    resumeAtDirent: first.resumeAtDirent,
  })
  const legacy = await service.extractZIMContent(ZIM, { startOffset: BATCH, batchSize: BATCH })

  assert.deepEqual(articlePaths(legacy.chunks), articlePaths(seek.chunks))
  assert.equal(legacy.resumeAtDirent, seek.resumeAtDirent)
}).timeout(60000)
