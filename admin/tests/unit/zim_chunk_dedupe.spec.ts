import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { chunkTextHash, dedupeZimChunks } from '../../app/utils/zim_chunk_dedupe.js'

test('chunkTextHash ignores whitespace differences only', () => {
  assert.equal(
    chunkTextHash('Official  websites use .gov'),
    chunkTextHash(' Official websites\nuse .gov ')
  )
  assert.notEqual(
    chunkTextHash('Official websites use .gov'),
    chunkTextHash('Official websites use .GOV')
  )
})

test('dedupeZimChunks keeps the first copy of a text within a batch (#1438)', () => {
  const banner =
    'Official websites use .gov. A .gov website belongs to an official government organization.'
  const chunks = [
    { text: 'Aspirin is used to treat pain.', articleTitle: 'Aspirin' },
    { text: banner, articleTitle: 'Aspirin' },
    { text: 'Ibuprofen is an NSAID.', articleTitle: 'Ibuprofen' },
    { text: banner, articleTitle: 'Ibuprofen' },
    { text: banner, articleTitle: 'Warfarin' },
  ]

  const result = dedupeZimChunks(chunks, new Set())

  assert.deepEqual(
    result.kept.map((k) => k.chunk.articleTitle + ': ' + k.chunk.text.slice(0, 8)),
    ['Aspirin: Aspirin ', 'Aspirin: Official', 'Ibuprofen: Ibuprofe']
  )
  assert.equal(result.droppedInBatch, 2)
  assert.equal(result.droppedStored, 0)
  assert.equal(result.kept[1].hash, chunkTextHash(banner))
})

test('dedupeZimChunks drops texts an earlier batch already stored', () => {
  const disclaimer =
    'The information on this site should not be used as a substitute for professional medical care.'
  const chunks = [{ text: disclaimer }, { text: disclaimer }, { text: 'Take with food.' }]

  const result = dedupeZimChunks(chunks, new Set([chunkTextHash(disclaimer)]))

  assert.deepEqual(
    result.kept.map((k) => k.chunk.text),
    ['Take with food.']
  )
  // The second in-batch copy counts against the batch, not the store: it would
  // have been dropped either way, and the counts should add up to the input.
  assert.equal(result.droppedStored, 1)
  assert.equal(result.droppedInBatch, 1)
  assert.equal(result.kept.length + result.droppedStored + result.droppedInBatch, chunks.length)
})

test('dedupeZimChunks passes unique chunks through untouched', () => {
  const chunks = [{ text: 'a' }, { text: 'b' }, { text: 'c' }]
  const result = dedupeZimChunks(chunks, new Set())
  assert.deepEqual(
    result.kept.map((k) => k.chunk),
    chunks
  )
  assert.equal(result.droppedInBatch + result.droppedStored, 0)
})
