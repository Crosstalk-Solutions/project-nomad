import assert from 'node:assert/strict'
import test from 'node:test'
import { chatSchema } from '../../app/validators/ollama.js'

const message = (content: string) => ({ role: 'user' as const, content })

test('text-only chat validation preserves empty and long conversation histories', async () => {
  const empty = await chatSchema.validate({
    model: 'text-model',
    messages: [],
    stream: true,
  })
  const long = await chatSchema.validate({
    model: 'text-model',
    messages: Array.from({ length: 201 }, (_, index) => message(`Message ${index}`)),
  })

  assert.equal(empty.messages.length, 0)
  assert.equal(long.messages.length, 201)
})
