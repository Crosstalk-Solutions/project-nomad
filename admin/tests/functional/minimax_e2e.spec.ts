import { test } from '@japa/runner'

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY
const MINIMAX_BASE_URL = 'https://api.minimax.io/v1'

test.group('MiniMax E2E', (group) => {
  group.tap((t) => t.timeout(30_000))

  if (!MINIMAX_API_KEY) {
    test('skipped: MINIMAX_API_KEY not set', ({ assert }) => {
      assert.isTrue(true)
    })
    return
  }

  test('completes basic chat with MiniMax-M2.7', async ({ assert }) => {
    const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.7',
        messages: [{ role: 'user', content: 'Say "test passed" in exactly two words.' }],
        max_tokens: 20,
        temperature: 1.0,
      }),
    })

    assert.equal(response.status, 200)
    const data = await response.json()
    assert.isTrue(data.choices.length > 0)
    assert.isString(data.choices[0].message.content)
    assert.isTrue(data.choices[0].message.content.length > 0)
  })

  test('streams chat response from MiniMax-M2.7', async ({ assert }) => {
    const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.7',
        messages: [{ role: 'user', content: 'Say "hello"' }],
        max_tokens: 10,
        temperature: 1.0,
        stream: true,
      }),
    })

    assert.equal(response.status, 200)

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let receivedChunks = 0
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data:') && line.slice(5).trim() !== '[DONE]') {
          receivedChunks++
        }
      }
    }

    assert.isTrue(receivedChunks > 0)
  })

  test('handles system message correctly', async ({ assert }) => {
    const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.7',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say "ok"' },
        ],
        max_tokens: 10,
        temperature: 1.0,
      }),
    })

    assert.equal(response.status, 200)
    const data = await response.json()
    assert.isTrue(data.choices.length > 0)
    assert.isString(data.choices[0].message.content)
  })
})
