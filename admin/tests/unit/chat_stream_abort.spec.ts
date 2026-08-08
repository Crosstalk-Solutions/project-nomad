import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  abortActiveStream,
  clearStreamIfCurrent,
  type StreamAbortRef,
} from '../../inertia/components/chat/stream_abort.js'

test('aborts and releases the active stream', () => {
  const controller = new AbortController()
  const ref: StreamAbortRef = { current: controller }

  assert.equal(abortActiveStream(ref), true)
  assert.equal(controller.signal.aborted, true)
  assert.equal(ref.current, null)
})

test('does nothing when no stream is active', () => {
  const ref: StreamAbortRef = { current: null }

  assert.equal(abortActiveStream(ref), false)
  assert.equal(ref.current, null)
})

test('clears the controller owned by the settling stream', () => {
  const controller = new AbortController()
  const ref: StreamAbortRef = { current: controller }

  assert.equal(clearStreamIfCurrent(ref, controller), true)
  assert.equal(ref.current, null)
})

test('does not clear a replacement stream controller', () => {
  const staleController = new AbortController()
  const replacementController = new AbortController()
  const ref: StreamAbortRef = { current: replacementController }

  assert.equal(clearStreamIfCurrent(ref, staleController), false)
  assert.equal(ref.current, replacementController)
})
