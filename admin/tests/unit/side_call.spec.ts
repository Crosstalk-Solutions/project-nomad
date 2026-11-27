/**
 * Ancillary calls on the chat model must ask for the chat's own num_ctx and
 * keep_alive, or Ollama reloads the model twice per turn.
 *
 *   node --import ts-node-maintained/register/esm --test tests/unit/side_call.spec.ts
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { sideCallResidency } from '../../app/utils/side_call.js'

const chat = { numCtx: 16384, keepAlive: '15m' }

test('side call on the chat model gets the chat residency', () => {
  assert.deepEqual(sideCallResidency('llama3.1:8b', 'llama3.1:8b', chat), chat)
})

test('side call on a separate tasks model gets nothing', () => {
  assert.deepEqual(sideCallResidency('qwen2.5:3b', 'llama3.1:8b', chat), {})
})

test('unknown chat model gets nothing', () => {
  assert.deepEqual(sideCallResidency('llama3.1:8b', null, chat), {})
})

test('unset chat values are not sent', () => {
  assert.deepEqual(sideCallResidency('m', 'm', {}), {})
})
