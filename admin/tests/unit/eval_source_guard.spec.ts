/**
 * Tests for the eval-corpus leak guard.
 *
 * The eval corpus shares the `nomad_knowledge_base` Qdrant collection with the
 * developer's real documents, isolated by a `collection: __nomad_eval__` payload
 * filter. That filter is applied by Qdrant during search and does hold — but a
 * harness that depends on a filter must be able to *prove* the filter held, not
 * assume it.
 *
 * `docIdFromSource` is that proof: anything it cannot resolve to a corpus
 * document is counted as an unresolved chunk, and a non-zero count fails the
 * run. These tests exist because the first version checked only for a `.md`
 * extension, which silently accepted a developer's own markdown — and NOMAD
 * embeds its own `admin/docs/*.md` on first run, so that was not hypothetical.
 *
 *   npm run test:eval
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { join, resolve } from 'node:path'

import { docIdFromSource } from '../../app/utils/eval/corpus_source.js'

const CORPUS = resolve('/srv/nomad/admin/tests/eval/corpus')
const inCorpus = (name: string) => join(CORPUS, name)

const resolveId = (source: unknown) => docIdFromSource(source, CORPUS)

test('resolves a genuine corpus document', () => {
  assert.equal(resolveId(inCorpus('water-boiling.md')), 'water-boiling')
})

test('resolves every corpus document to its filename without the extension', () => {
  assert.equal(resolveId(inCorpus('regions-elevation-table.md')), 'regions-elevation-table')
  assert.equal(resolveId(inCorpus('equipment-tr88-pump.md')), 'equipment-tr88-pump')
})

test("rejects the developer's own markdown, even though it ends in .md", () => {
  // The regression this guard exists for. NOMAD embeds admin/docs/*.md into the
  // knowledge base on first run, so if the collection filter ever leaked, this
  // is the exact shape that would come back. Resolving it to "faq" would have
  // been counted as a merely-irrelevant chunk and quietly lowered precision
  // instead of failing the run.
  assert.equal(resolveId('/srv/nomad/admin/docs/faq.md'), null)
  assert.equal(resolveId('/srv/nomad/admin/docs/release-notes.md'), null)
})

test('rejects an uploaded knowledge-base file', () => {
  assert.equal(resolveId('/srv/nomad/admin/storage/kb_uploads/notes-abc123.txt'), null)
  assert.equal(resolveId('/srv/nomad/admin/storage/kb_uploads/notes-abc123.md'), null)
})

test('rejects a ZIM article source', () => {
  assert.equal(resolveId('/srv/nomad/admin/storage/zim/wikipedia_en_100_mini.zim'), null)
})

test('rejects a sibling directory whose path merely starts with the corpus path', () => {
  // "…/corpus-backup/x.md" shares a string prefix with "…/corpus". Without the
  // trailing separator in the check this would pass.
  assert.equal(resolveId('/srv/nomad/admin/tests/eval/corpus-backup/water-boiling.md'), null)
})

test('rejects a path that escapes the corpus via traversal', () => {
  assert.equal(resolveId(join(CORPUS, '..', '..', '..', 'docs', 'faq.md')), null)
})

test('rejects a non-markdown file inside the corpus directory', () => {
  assert.equal(resolveId(inCorpus('README.txt')), null)
})

test('rejects a missing or non-string source', () => {
  assert.equal(resolveId(undefined), null)
  assert.equal(resolveId(null), null)
  assert.equal(resolveId(42), null)
  assert.equal(resolveId(''), null)
})

test('rejects the corpus directory itself', () => {
  assert.equal(resolveId(CORPUS), null)
})

test('accepts a nested document, should the corpus ever grow subdirectories', () => {
  assert.equal(resolveId(inCorpus('water/boiling.md')), 'boiling')
})
