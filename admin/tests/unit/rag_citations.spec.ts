/**
 * The "Sources" list shown under an assistant answer (#1179).
 *
 * The rule these lock in is that a citation may only ever name a document the
 * model actually read. Offline there is no second opinion to check an answer
 * against, so a citation is the only provenance the user gets — and a wrong one
 * is worse than none, because it lends false weight to a fabricated answer.
 *
 * Pure functions only — no MySQL, Redis, Qdrant, or Ollama needed:
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCitations } from '../../app/utils/rag_prompt.js'

const chunk = (metadata: Record<string, any>) => ({ text: 'body', score: 0.5, metadata })

test('buildCitations collapses many chunks from one archive into a single entry', () => {
  const sources = buildCitations([
    chunk({ source: '/zim/survival.zim', archive_title: 'Survival Library' }),
    chunk({ source: '/zim/survival.zim', archive_title: 'Survival Library' }),
    chunk({ source: '/zim/survival.zim', archive_title: 'Survival Library' }),
  ])

  assert.equal(sources.length, 1)
  assert.equal(sources[0].title, 'Survival Library')
})

test('buildCitations dedupes on path, not title, so same-named archives stay distinct', () => {
  const sources = buildCitations([
    chunk({ source: '/zim/wikipedia_2024.zim', archive_title: 'Wikipedia' }),
    chunk({ source: '/zim/wikipedia_2026.zim', archive_title: 'Wikipedia' }),
  ])

  assert.equal(sources.length, 2)
  assert.deepEqual(
    sources.map((s) => s.source),
    ['/zim/wikipedia_2024.zim', '/zim/wikipedia_2026.zim']
  )
})

test('buildCitations prefers the archive title over per-article titles', () => {
  const [source] = buildCitations([
    chunk({
      source: '/zim/ifixit.zim',
      archive_title: 'iFixit Repair Guides',
      full_title: 'Replacing a MacBook battery',
      article_title: 'MacBook battery',
    }),
  ])

  assert.equal(source.title, 'iFixit Repair Guides')
})

test('buildCitations falls back through full_title then article_title', () => {
  assert.equal(
    buildCitations([chunk({ source: '/a.zim', full_title: 'Full', article_title: 'Article' })])[0]
      .title,
    'Full'
  )
  assert.equal(
    buildCitations([chunk({ source: '/b.zim', article_title: 'Article' })])[0].title,
    'Article'
  )
})

test('buildCitations names an untitled upload by its filename', () => {
  // A user-uploaded PDF carries no embedded metadata; the filename is what the
  // user chose and is the only label they will recognise.
  const [source] = buildCitations([chunk({ source: '/kb_uploads/well drilling notes.pdf' })])

  assert.equal(source.title, 'well drilling notes.pdf')
  assert.equal(source.source, '/kb_uploads/well drilling notes.pdf')
})

test('buildCitations carries the archive date when one is known', () => {
  const [withDate] = buildCitations([
    chunk({ source: '/zim/wiki.zim', archive_title: 'Wikipedia', archive_date: '2026-06' }),
  ])
  assert.equal(withDate.date, '2026-06')

  const [withoutDate] = buildCitations([chunk({ source: '/zim/wiki.zim', archive_title: 'Wikipedia' })])
  assert.equal(withoutDate.date, undefined)
})

test('buildCitations skips a chunk with neither a path nor a title', () => {
  // "Unknown source" is not a citation — it is a row the user cannot act on,
  // and it makes the answer look sourced when it is not.
  assert.deepEqual(buildCitations([chunk({ chunk_index: 3 })]), [])
})

test('buildCitations returns nothing when no context was injected', () => {
  // Retrieval skipped, or it declined because nothing cleared the relevance
  // floor. No context means no citations, not an empty-looking Sources header.
  assert.deepEqual(buildCitations([]), [])
})

test('buildCitations preserves injection order', () => {
  const sources = buildCitations([
    chunk({ source: '/zim/b.zim', archive_title: 'Second' }),
    chunk({ source: '/zim/a.zim', archive_title: 'First' }),
  ])

  assert.deepEqual(
    sources.map((s) => s.title),
    ['Second', 'First']
  )
})
