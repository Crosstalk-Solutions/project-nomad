import assert from 'node:assert/strict'
import test from 'node:test'
import { visionAttachmentGuidance } from '../../inertia/lib/vision_guidance.js'

test('vision guidance makes temporary image handling explicit', () => {
  const guidance = visionAttachmentGuidance('supported')

  assert.match(guidance, /only with this request/i)
  assert.match(guidance, /not saved/i)
  assert.match(guidance, /reload/i)
})

test('unknown vision guidance explains the user choice without backend jargon', () => {
  const guidance = visionAttachmentGuidance('unknown')

  assert.match(guidance, /cannot confirm/i)
  assert.match(guidance, /try/i)
  assert.match(guidance, /request will fail/i)
  assert.doesNotMatch(guidance, /backend|metadata|projector/i)
})

test('unsupported vision guidance points users to a compatible model', () => {
  assert.match(visionAttachmentGuidance('unsupported'), /supports images/i)
})
