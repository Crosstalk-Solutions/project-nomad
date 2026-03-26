import { test } from '@japa/runner'
import { MINIMAX_MODELS, MiniMaxService } from '#services/minimax_service'

test.group('MiniMaxService', () => {
  test('isMiniMaxModel returns true for MiniMax models', ({ assert }) => {
    const service = new MiniMaxService()
    assert.isTrue(service.isMiniMaxModel('MiniMax-M2.7'))
    assert.isTrue(service.isMiniMaxModel('MiniMax-M2.7-highspeed'))
  })

  test('isMiniMaxModel returns false for non-MiniMax models', ({ assert }) => {
    const service = new MiniMaxService()
    assert.isFalse(service.isMiniMaxModel('llama3.2:3b'))
    assert.isFalse(service.isMiniMaxModel('deepseek-r1:1.5b'))
    assert.isFalse(service.isMiniMaxModel('gpt-4o'))
  })

  test('MINIMAX_MODELS contains expected models', ({ assert }) => {
    const modelIds = MINIMAX_MODELS.map((m) => m.id)
    assert.include(modelIds, 'MiniMax-M2.7')
    assert.include(modelIds, 'MiniMax-M2.7-highspeed')
    assert.lengthOf(MINIMAX_MODELS, 2)
  })

  test('getModels returns empty array when API key is not set', ({ assert }) => {
    const service = new MiniMaxService()
    // When MINIMAX_API_KEY is not set, isAvailable() returns false
    if (!service.isAvailable()) {
      const models = service.getModels()
      assert.lengthOf(models, 0)
    }
  })

  test('getModels returns Ollama-compatible model objects', ({ assert }) => {
    const service = new MiniMaxService()
    // If API key is set, getModels returns model objects
    if (service.isAvailable()) {
      const models = service.getModels()
      assert.lengthOf(models, 2)

      for (const model of models) {
        assert.properties(model, ['name', 'model', 'modified_at', 'size', 'digest', 'details'])
        assert.equal(model.size, 0)
        assert.equal(model.digest, 'cloud')
        assert.equal(model.details.family, 'minimax')
        assert.equal(model.details.format, 'cloud')
      }
    }
  })

  test('chat throws when API key is not set', async ({ assert }) => {
    const service = new MiniMaxService()
    if (!service.isAvailable()) {
      await assert.rejects(
        () =>
          service.chat({
            model: 'MiniMax-M2.7',
            messages: [{ role: 'user', content: 'hello' }],
          }),
        'MINIMAX_API_KEY is not configured'
      )
    }
  })

  test('chatStream throws when API key is not set', async ({ assert }) => {
    const service = new MiniMaxService()
    if (!service.isAvailable()) {
      await assert.rejects(async () => {
        const gen = service.chatStream({
          model: 'MiniMax-M2.7',
          messages: [{ role: 'user', content: 'hello' }],
        })
        // Consume the first value to trigger the error
        await gen.next()
      }, 'MINIMAX_API_KEY is not configured')
    }
  })

  test('model names match expected format', ({ assert }) => {
    for (const model of MINIMAX_MODELS) {
      assert.isTrue(model.id.startsWith('MiniMax-'))
      assert.equal(model.id, model.name)
    }
  })
})
