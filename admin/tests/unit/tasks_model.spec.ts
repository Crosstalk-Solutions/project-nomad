/**
 * Tests for the tasks-model decision — which model runs ancillary AI work
 * (chat titles, chat suggestions) rather than the chat model the user picked.
 *
 * The decision is a pure function so the "configured model was deleted" path is
 * testable without an Ollama server; ChatService.resolveTasksModel does only the
 * KV read and the model listing around it.
 *
 * Pure functions only — no MySQL, Redis, Qdrant, or Ollama needed:
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { pickTasksModel } from '../../app/utils/misc.js'

const INSTALLED = ['llama3.1:8b', 'qwen2.5:3b', 'gpt-oss:20b']

test('tasks model: unset setting falls back to the caller default', () => {
  assert.deepEqual(pickTasksModel(null, INSTALLED, 'llama3.1:8b'), {
    model: 'llama3.1:8b',
    staleConfigured: null,
  })
  assert.deepEqual(pickTasksModel(undefined, INSTALLED, 'llama3.1:8b'), {
    model: 'llama3.1:8b',
    staleConfigured: null,
  })
})

test('tasks model: empty and whitespace-only settings count as unset', () => {
  // SystemService.updateSetting clears the row on an empty string, but a value
  // written before that behaviour (or by hand) must not select a "" model.
  assert.equal(pickTasksModel('', INSTALLED, 'llama3.1:8b').model, 'llama3.1:8b')
  assert.equal(pickTasksModel('   ', INSTALLED, 'llama3.1:8b').model, 'llama3.1:8b')
})

test('tasks model: a configured, installed model wins over the chat model', () => {
  assert.deepEqual(pickTasksModel('qwen2.5:3b', INSTALLED, 'gpt-oss:20b'), {
    model: 'qwen2.5:3b',
    staleConfigured: null,
  })
})

test('tasks model: surrounding whitespace is trimmed before matching', () => {
  assert.equal(pickTasksModel('  qwen2.5:3b  ', INSTALLED, 'gpt-oss:20b').model, 'qwen2.5:3b')
})

test('tasks model: an uninstalled configured model falls back and reports itself stale', () => {
  // The user deleted the model from /settings/models after selecting it here.
  // Requesting it would 404, so the caller's fallback runs and the name is
  // handed back for the warning log.
  assert.deepEqual(pickTasksModel('llama3.2:1b', INSTALLED, 'gpt-oss:20b'), {
    model: 'gpt-oss:20b',
    staleConfigured: 'llama3.2:1b',
  })
})

test('tasks model: model names match exactly, not by prefix', () => {
  // "llama3.1" is a family, not an installed tag; only "llama3.1:8b" is pullable.
  assert.equal(pickTasksModel('llama3.1', INSTALLED, 'gpt-oss:20b').model, 'gpt-oss:20b')
})

test('tasks model: nothing installed falls back', () => {
  assert.deepEqual(pickTasksModel('qwen2.5:3b', [], 'gpt-oss:20b'), {
    model: 'gpt-oss:20b',
    staleConfigured: 'qwen2.5:3b',
  })
})

test('tasks model: a null fallback stays null', () => {
  // getChatSuggestions has no model to fall back to when nothing is installed.
  assert.deepEqual(pickTasksModel(null, [], null), { model: null, staleConfigured: null })
  assert.deepEqual(pickTasksModel('qwen2.5:3b', [], null), {
    model: null,
    staleConfigured: 'qwen2.5:3b',
  })
})
