import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { shouldPaceEmbedding } from '../../app/utils/embedding_pacing.js'

test('embedding pacing: native Ollama paces only when embeddings run on CPU', () => {
  assert.equal(shouldPaceEmbedding(true, false), true)
  assert.equal(shouldPaceEmbedding(true, true), false)
})

test('embedding pacing: a non-Ollama backend (LM Studio, llama.cpp) is never paced', () => {
  assert.equal(shouldPaceEmbedding(false, false), false)
})

test('embedding pacing: an unidentified backend keeps the safe default', () => {
  assert.equal(shouldPaceEmbedding(null, false), true)
})
