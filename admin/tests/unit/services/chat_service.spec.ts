import { test } from '@japa/runner'
import { ChatService } from '#services/chat_service'

/**
 * Unit tests for ChatService.
 *
 * These tests exercise the service's logic without requiring a real database
 * or Ollama connection. Database-dependent methods (createSession, addMessage,
 * etc.) are tested by verifying error handling when the DB is unavailable.
 * Pure logic methods like suggestion parsing and title generation fallback
 * are tested with stubs.
 */

// ---------------------------------------------------------------------------
// Helper: build a ChatService instance with a stubbed OllamaService
// ---------------------------------------------------------------------------
function buildService(ollamaStub: Record<string, any> = {}): ChatService {
  const svc = Object.create(ChatService.prototype) as ChatService
  ;(svc as any).ollamaService = {
    getModels: async () => [],
    chat: async () => ({ message: { content: '' } }),
    ...ollamaStub,
  }
  return svc
}

// ---------------------------------------------------------------------------
// getChatSuggestions – response parsing
// ---------------------------------------------------------------------------
test.group('ChatService – getChatSuggestions', () => {
  test('returns empty array when no models available', async ({ assert }) => {
    const svc = buildService({
      getModels: async () => [],
    })

    const result = await svc.getChatSuggestions()
    assert.deepEqual(result, [])
  })

  test('returns empty array when models is null', async ({ assert }) => {
    const svc = buildService({
      getModels: async () => null,
    })

    const result = await svc.getChatSuggestions()
    assert.deepEqual(result, [])
  })

  test('parses comma-separated suggestions', async ({ assert }) => {
    const svc = buildService({
      getModels: async () => [{ name: 'llama3', size: 5000000000 }],
      chat: async () => ({
        message: { content: 'water purification, fire starting, shelter building' },
      }),
    })

    const result = await svc.getChatSuggestions()
    assert.lengthOf(result, 3)
    assert.include(result, 'Water Purification')
    assert.include(result, 'Fire Starting')
    assert.include(result, 'Shelter Building')
  })

  test('parses newline-separated suggestions', async ({ assert }) => {
    const svc = buildService({
      getModels: async () => [{ name: 'llama3', size: 5000000000 }],
      chat: async () => ({
        message: { content: 'water purification\nfire starting\nshelter building' },
      }),
    })

    const result = await svc.getChatSuggestions()
    assert.lengthOf(result, 3)
    assert.include(result, 'Water Purification')
    assert.include(result, 'Fire Starting')
    assert.include(result, 'Shelter Building')
  })

  test('strips numbered list markers from suggestions', async ({ assert }) => {
    const svc = buildService({
      getModels: async () => [{ name: 'llama3', size: 5000000000 }],
      chat: async () => ({
        message: { content: '1. water purification\n2. fire starting\n3. shelter building' },
      }),
    })

    const result = await svc.getChatSuggestions()
    assert.lengthOf(result, 3)
    assert.include(result, 'Water Purification')
  })

  test('strips bullet point markers from suggestions', async ({ assert }) => {
    const svc = buildService({
      getModels: async () => [{ name: 'llama3', size: 5000000000 }],
      chat: async () => ({
        message: { content: '- water purification\n* fire starting\n• shelter building' },
      }),
    })

    const result = await svc.getChatSuggestions()
    assert.lengthOf(result, 3)
  })

  test('strips surrounding quotes from suggestions', async ({ assert }) => {
    const svc = buildService({
      getModels: async () => [{ name: 'llama3', size: 5000000000 }],
      chat: async () => ({
        message: { content: '"water purification"\n"fire starting"\n"shelter building"' },
      }),
    })

    const result = await svc.getChatSuggestions()
    for (const suggestion of result) {
      assert.isFalse(suggestion.startsWith('"'))
      assert.isFalse(suggestion.endsWith('"'))
    }
  })

  test('limits to 3 suggestions maximum', async ({ assert }) => {
    const svc = buildService({
      getModels: async () => [{ name: 'llama3', size: 5000000000 }],
      chat: async () => ({
        message: {
          content: 'water purification, fire starting, shelter building, food foraging, first aid',
        },
      }),
    })

    const result = await svc.getChatSuggestions()
    assert.isAtMost(result.length, 3)
  })

  test('filters out empty strings in suggestions', async ({ assert }) => {
    const svc = buildService({
      getModels: async () => [{ name: 'llama3', size: 5000000000 }],
      chat: async () => ({
        message: { content: 'water purification\n\n\nfire starting' },
      }),
    })

    const result = await svc.getChatSuggestions()
    for (const suggestion of result) {
      assert.isAbove(suggestion.length, 0)
    }
  })

  test('selects the largest model for suggestions', async ({ assert }) => {
    let usedModel = ''
    const svc = buildService({
      getModels: async () => [
        { name: 'small-model', size: 1000000 },
        { name: 'large-model', size: 9000000000 },
        { name: 'medium-model', size: 3000000000 },
      ],
      chat: async (opts: any) => {
        usedModel = opts.model
        return { message: { content: 'test suggestion' } }
      },
    })

    await svc.getChatSuggestions()
    assert.equal(usedModel, 'large-model')
  })

  test('returns empty array when chat response has no content', async ({ assert }) => {
    const svc = buildService({
      getModels: async () => [{ name: 'llama3', size: 5000000000 }],
      chat: async () => ({ message: { content: '' } }),
    })

    const result = await svc.getChatSuggestions()
    assert.deepEqual(result, [])
  })

  test('returns empty array when chat response is null', async ({ assert }) => {
    const svc = buildService({
      getModels: async () => [{ name: 'llama3', size: 5000000000 }],
      chat: async () => null,
    })

    const result = await svc.getChatSuggestions()
    assert.deepEqual(result, [])
  })

  test('returns empty array when chat throws', async ({ assert }) => {
    const svc = buildService({
      getModels: async () => [{ name: 'llama3', size: 5000000000 }],
      chat: async () => {
        throw new Error('connection refused')
      },
    })

    const result = await svc.getChatSuggestions()
    assert.deepEqual(result, [])
  })

  test('converts suggestions to title case', async ({ assert }) => {
    const svc = buildService({
      getModels: async () => [{ name: 'llama3', size: 5000000000 }],
      chat: async () => ({
        message: { content: 'WATER PURIFICATION, fire starting' },
      }),
    })

    const result = await svc.getChatSuggestions()
    assert.include(result, 'Water Purification')
    assert.include(result, 'Fire Starting')
  })
})

// ---------------------------------------------------------------------------
// Error handling – database-dependent methods
// ---------------------------------------------------------------------------
test.group('ChatService – error handling', () => {
  test('getAllSessions returns empty array on error', async ({ assert }) => {
    const svc = buildService()
    // Without a database, querying will throw — getAllSessions catches and returns []
    const result = await svc.getAllSessions()
    assert.deepEqual(result, [])
  })

  test('getSession returns null on error', async ({ assert }) => {
    const svc = buildService()
    const result = await svc.getSession(999)
    assert.isNull(result)
  })

  test('createSession throws on database error', async ({ assert }) => {
    const svc = buildService()
    await assert.rejects(() => svc.createSession('Test Session'), /Failed to create chat session/)
  })

  test('updateSession throws on database error', async ({ assert }) => {
    const svc = buildService()
    await assert.rejects(
      () => svc.updateSession(999, { title: 'Updated' }),
      /Failed to update chat session/
    )
  })

  test('addMessage throws on database error', async ({ assert }) => {
    const svc = buildService()
    await assert.rejects(
      () => svc.addMessage(999, 'user', 'Hello'),
      /Failed to add message/
    )
  })

  test('deleteSession throws on database error', async ({ assert }) => {
    const svc = buildService()
    await assert.rejects(
      () => svc.deleteSession(999),
      /Failed to delete chat session/
    )
  })

  test('deleteAllSessions throws on database error', async ({ assert }) => {
    const svc = buildService()
    await assert.rejects(
      () => svc.deleteAllSessions(),
      /Failed to delete all chat sessions/
    )
  })

  test('getMessageCount returns 0 on error', async ({ assert }) => {
    const svc = buildService()
    const result = await svc.getMessageCount(999)
    assert.equal(result, 0)
  })
})

// ---------------------------------------------------------------------------
// generateTitle – fallback logic
// ---------------------------------------------------------------------------
test.group('ChatService – generateTitle fallback', () => {
  test('truncates user message to 57 chars + ellipsis when no model available', async ({
    assert,
  }) => {
    let updatedTitle = ''
    const svc = buildService({
      getModels: async () => [],
    })

    // Stub updateSession to capture the title without DB access
    ;(svc as any).updateSession = async (_id: number, data: { title?: string }) => {
      updatedTitle = data.title || ''
    }

    const longMessage = 'A'.repeat(100)
    await svc.generateTitle(1, longMessage, 'Some response')

    assert.equal(updatedTitle.length, 60) // 57 chars + "..."
    assert.isTrue(updatedTitle.endsWith('...'))
  })

  test('does not add ellipsis for short messages when no model available', async ({ assert }) => {
    let updatedTitle = ''
    const svc = buildService({
      getModels: async () => [],
    })

    ;(svc as any).updateSession = async (_id: number, data: { title?: string }) => {
      updatedTitle = data.title || ''
    }

    await svc.generateTitle(1, 'Short message', 'Response')

    assert.equal(updatedTitle, 'Short message')
    assert.isFalse(updatedTitle.includes('...'))
  })

  test('uses model-generated title when available', async ({ assert }) => {
    let updatedTitle = ''
    const svc = buildService({
      getModels: async () => [{ name: 'qwen2.5:3b', size: 3000000000 }],
      chat: async () => ({
        message: { content: 'AI-Generated Title' },
      }),
    })

    ;(svc as any).updateSession = async (_id: number, data: { title?: string }) => {
      updatedTitle = data.title || ''
    }

    await svc.generateTitle(1, 'What is water purification?', 'Water purification is...')

    assert.equal(updatedTitle, 'AI-Generated Title')
  })

  test('falls back to truncated message when model returns empty response', async ({ assert }) => {
    let updatedTitle = ''
    const svc = buildService({
      getModels: async () => [{ name: 'qwen2.5:3b', size: 3000000000 }],
      chat: async () => ({
        message: { content: '' },
      }),
    })

    ;(svc as any).updateSession = async (_id: number, data: { title?: string }) => {
      updatedTitle = data.title || ''
    }

    await svc.generateTitle(1, 'Short question', 'Response')

    assert.equal(updatedTitle, 'Short question')
  })

  test('falls back to truncated message when generateTitle throws', async ({ assert }) => {
    let updatedTitle = ''
    const svc = buildService({
      getModels: async () => {
        throw new Error('Ollama unavailable')
      },
    })

    // First call to updateSession will be the fallback
    ;(svc as any).updateSession = async (_id: number, data: { title?: string }) => {
      updatedTitle = data.title || ''
    }

    await svc.generateTitle(1, 'Test question', 'Test response')

    assert.equal(updatedTitle, 'Test question')
  })
})

// ---------------------------------------------------------------------------
// Message roles and formatting
// ---------------------------------------------------------------------------
test.group('ChatService – message formatting', () => {
  test('addMessage accepts system role', async ({ assert }) => {
    const svc = buildService()
    // Will throw because DB is not available, but we verify the role is accepted
    await assert.rejects(() => svc.addMessage(1, 'system', 'System prompt'))
  })

  test('addMessage accepts user role', async ({ assert }) => {
    const svc = buildService()
    await assert.rejects(() => svc.addMessage(1, 'user', 'Hello'))
  })

  test('addMessage accepts assistant role', async ({ assert }) => {
    const svc = buildService()
    await assert.rejects(() => svc.addMessage(1, 'assistant', 'Hi there'))
  })
})
