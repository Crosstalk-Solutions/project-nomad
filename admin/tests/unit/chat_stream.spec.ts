import assert from 'node:assert/strict'
import test from 'node:test'
import { chatStreamErrorMessage } from '../../inertia/lib/chat_stream.js'

test('chat stream preserves an actionable server error message', () => {
  assert.equal(
    chatStreamErrorMessage({
      error: true,
      message:
        'NOMAD could not verify image support for this model. Verify that its vision projector is loaded.',
    }),
    'NOMAD could not verify image support for this model. Verify that its vision projector is loaded.'
  )
  assert.equal(
    chatStreamErrorMessage({ error: true }),
    'The model encountered an error. Please try again.'
  )
  assert.equal(chatStreamErrorMessage({ done: true }), null)
})
