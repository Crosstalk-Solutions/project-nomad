import { test } from '@japa/runner'
import { createSessionSchema, addMessageSchema } from '../../../app/validators/chat.js'

test.group('Validators | chat', () => {
  test('createSessionSchema: should validate correct payload', async ({ assert }) => {
    const payload = { title: 'New Chat', model: 'llama3' }
    const result = await createSessionSchema.validate(payload)
    
    assert.equal(result.title, 'New Chat')
    assert.equal(result.model, 'llama3')
  })

  test('createSessionSchema: should fail without title', async ({ assert }) => {
    const payload = { model: 'llama3' }
    await assert.rejects(() => createSessionSchema.validate(payload))
  })

  test('addMessageSchema: should validate correct roles', async ({ assert }) => {
    await assert.doesNotReject(() => addMessageSchema.validate({ role: 'user', content: 'Hello' }))
    await assert.doesNotReject(() => addMessageSchema.validate({ role: 'assistant', content: 'Hi' }))
    await assert.doesNotReject(() => addMessageSchema.validate({ role: 'system', content: 'Prompt' }))
  })

  test('addMessageSchema: should fail with invalid role or empty content', async ({ assert }) => {
    await assert.rejects(() => addMessageSchema.validate({ role: 'admin', content: 'Hello' }))
    await assert.rejects(() => addMessageSchema.validate({ role: 'user', content: '   ' })) 
    await assert.rejects(() => addMessageSchema.validate({ role: 'user' })) 
  })
})