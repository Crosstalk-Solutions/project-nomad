import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { hasMoreArticleBatches } from '../../app/utils/zim_batch_decision.js'

const BATCH = 50

test('continues while the extractor keeps filling the batch', () => {
  assert.equal(hasMoreArticleBatches({ articlesProcessed: BATCH, batchSize: BATCH }), true)
})

test('stops once the extractor runs out of article entries', () => {
  assert.equal(hasMoreArticleBatches({ articlesProcessed: 12, batchSize: BATCH }), false)
})

test('stops on an archive smaller than one batch', () => {
  assert.equal(hasMoreArticleBatches({ articlesProcessed: 1, batchSize: BATCH }), false)
})

test('stops on an exhausted iterator that yielded nothing', () => {
  assert.equal(hasMoreArticleBatches({ articlesProcessed: 0, batchSize: BATCH }), false)
})

/**
 * Regression: Medicine LibreTexts (23,171 articles) embedded only 16 chunks.
 *
 * Its first 50 article entries are navigation and category pages; only 10 of
 * them produced any text. The previous gate counted articles that produced
 * chunks, so it evaluated `10 >= 50` -> false, never dispatched a continuation,
 * and abandoned the remaining 23,121 articles. A full batch was consumed, so the
 * ingestion must continue regardless of how little text came out of it.
 */
test('continues through a full batch that produced almost no text', () => {
  const articlesWithContent = 10
  assert.equal(
    hasMoreArticleBatches({ articlesProcessed: BATCH, batchSize: BATCH }),
    true,
    'a full batch must continue even when most of its articles are empty'
  )
  assert.equal(
    articlesWithContent >= BATCH,
    false,
    'the old chunk-derived gate stopped here — this is the bug being fixed'
  )
})

/**
 * Regression: a media archive (Canadian Prepper, 92 articles / 187 media files)
 * yields zero text chunks, but its articles still have to be walked to the end
 * rather than abandoned after the first batch.
 */
test('walks a zero-text archive to the end instead of stopping at batch one', () => {
  assert.equal(hasMoreArticleBatches({ articlesProcessed: BATCH, batchSize: BATCH }), true)
  assert.equal(hasMoreArticleBatches({ articlesProcessed: 42, batchSize: BATCH }), false)
})
