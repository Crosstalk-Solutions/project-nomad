/**
 * Tests for the embedding-model decision — which model the knowledge base is
 * embedded and searched with, from the `rag.embeddingModel` setting.
 *
 * The decision is a pure function; RagService does only the KV read around it.
 *
 * Pure functions only — no MySQL, Redis, Qdrant, or Ollama needed:
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { EMBEDDING_MODEL_NAME, EMBEDDING_MODELS, RAG_MIN_FINAL_SCORE } from '../../constants/ollama.js'
import { isEmbeddingModelName, isInstalledTagOf, pickEmbeddingModel } from '../../app/utils/misc.js'

test('embedding model: unset setting keeps nomic-embed-text, its prefixes and its floor', () => {
  for (const configured of [null, undefined, '', '   ']) {
    assert.deepEqual(pickEmbeddingModel(configured), {
      name: EMBEDDING_MODEL_NAME,
      dimension: 768,
      documentPrefix: 'search_document: ',
      queryPrefix: 'search_query: ',
      minFinalScore: RAG_MIN_FINAL_SCORE,
    })
  }
})

test('embedding model: bge-m3 is 1024-wide, takes no prefixes, and has its own floor', () => {
  const bge = pickEmbeddingModel('bge-m3')
  assert.equal(bge.name, 'bge-m3')
  assert.equal(bge.dimension, 1024)
  assert.equal(bge.documentPrefix, '')
  assert.equal(bge.queryPrefix, '')
  // bge-m3 scores relevant chunks where nomic scores unrelated ones; the nomic
  // floor drops a tenth of the golden set's answers under it.
  assert.ok(bge.minFinalScore < RAG_MIN_FINAL_SCORE)
})

test('embedding model: every listed model has a usable width and floor', () => {
  for (const [name, model] of Object.entries(EMBEDDING_MODELS)) {
    assert.ok(Number.isInteger(model.dimension) && model.dimension > 0, `${name} dimension`)
    assert.ok(model.minFinalScore > 0 && model.minFinalScore < 1, `${name} minFinalScore`)
  }
})

test('embedding model: surrounding whitespace is trimmed before matching', () => {
  assert.equal(pickEmbeddingModel('  bge-m3  ').name, 'bge-m3')
})

test('embedding model: an unknown model falls back to the default', () => {
  // A value written before a model was removed from EMBEDDING_MODELS, or by hand.
  // Its dimension and prefixes are unknown, so it cannot be embedded with safely.
  assert.equal(pickEmbeddingModel('mxbai-embed-large').name, EMBEDDING_MODEL_NAME)
})

test('embedding model: object prototype keys are not models', () => {
  // `'toString' in {}` is true; a lookup that used `in` would return a
  // profile with no dimension and create a collection of size undefined.
  assert.equal(pickEmbeddingModel('toString').name, EMBEDDING_MODEL_NAME)
  assert.equal(pickEmbeddingModel('constructor').name, EMBEDDING_MODEL_NAME)
})

test('embedding model names: bge-m3 is recognised with or without the :latest tag', () => {
  // Ollama lists a bare `ollama pull bge-m3` as bge-m3:latest, and the name has
  // no "embed" in it, so the chat model lists need this to leave it out.
  assert.equal(isEmbeddingModelName('bge-m3'), true)
  assert.equal(isEmbeddingModelName('bge-m3:latest'), true)
  assert.equal(isEmbeddingModelName(EMBEDDING_MODEL_NAME), true)
  assert.equal(isEmbeddingModelName('bge-m3:567m'), true)
})

test('embedding model names: chat models and prototype keys are not embedding models', () => {
  assert.equal(isEmbeddingModelName('llama3.1:8b'), false)
  assert.equal(isEmbeddingModelName('toString'), false)
})

test('installed tags: nomic-embed-text keeps its historical any-tag fallback', () => {
  assert.equal(isInstalledTagOf('nomic-embed-text:latest', EMBEDDING_MODEL_NAME), true)
  assert.equal(isInstalledTagOf('nomic-embed-text:v1.5', EMBEDDING_MODEL_NAME), true)
})

test('installed tags: other models match exactly or as :latest only', () => {
  assert.equal(isInstalledTagOf('bge-m3:latest', 'bge-m3'), true)
  assert.equal(isInstalledTagOf('qwen3-embedding:0.6b', 'qwen3-embedding:0.6b'), true)
  // A different size of the same family is a different model with a different
  // width; accepting it would build a 1024-d collection and embed 4096-d vectors.
  assert.equal(isInstalledTagOf('qwen3-embedding:8b', 'qwen3-embedding:0.6b'), false)
  assert.equal(isInstalledTagOf('qwen3-embedding:latest', 'qwen3-embedding:0.6b'), false)
})

test('embedding model: the qwen3 query instruction ends its line before the query', () => {
  // Qwen3-Embedding's documented format is `Instruct: <task>\nQuery:<query>`;
  // a literal backslash-n would still embed, just worse, with nothing failing.
  assert.match(pickEmbeddingModel('qwen3-embedding:0.6b').queryPrefix, /^Instruct: .+\nQuery:$/)
})
