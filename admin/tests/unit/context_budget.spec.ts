import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ELISION_MARKER,
  HISTORY_EVICTION_BLOCK,
  groupIntoTurns,
  planPrompt,
  type BudgetChunk,
  type BudgetInputs,
  type BudgetMessage,
} from '../../app/utils/context_budget.js'
import { estimateMessagesTokens } from '../../app/utils/token_estimate.js'

const renderRagBlock = (chunks: BudgetChunk[]) =>
  chunks.map((c, i) => `[Context ${i + 1}]\n${c.text}`).join('\n\n')

/** ~1 token per word, so budgets in these tests are legible. */
const words = (n: number, tag = 'w') => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ')

function makeInputs(overrides: Partial<BudgetInputs> = {}): BudgetInputs {
  return {
    systemBlocks: [{ role: 'system', content: 'You are helpful.' }],
    history: [],
    query: { role: 'user', content: 'What is the boiling time for water?' },
    ragChunks: [],
    renderRagBlock,
    contextWindow: 8192,
    ...overrides,
  }
}

function history(turnCount: number, wordsPerMessage = 20): BudgetMessage[] {
  const messages: BudgetMessage[] = []
  for (let i = 0; i < turnCount; i++) {
    messages.push({ role: 'user', content: `Question ${i}: ${words(wordsPerMessage, `q${i}`)}` })
    messages.push({ role: 'assistant', content: `Answer ${i}: ${words(wordsPerMessage, `a${i}`)}` })
  }
  return messages
}

test('groups messages into whole turns', () => {
  const turns = groupIntoTurns([
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'b' },
    { role: 'user', content: 'c' },
    { role: 'assistant', content: 'd' },
  ])
  assert.equal(turns.length, 2)
  assert.deepEqual(turns[0].map((m) => m.role), ['user', 'assistant'])
})

test('a leading assistant message does not start a phantom turn', () => {
  const turns = groupIntoTurns([
    { role: 'assistant', content: 'orphan' },
    { role: 'user', content: 'a' },
  ])
  assert.equal(turns.length, 2)
  assert.equal(turns[0][0].content, 'orphan')
})

test('short conversations pass through untouched', () => {
  const result = planPrompt(makeInputs({ history: history(2) }))
  assert.equal(result.trace.turnsDropped, 0)
  assert.equal(result.trace.historyElided, false)
  assert.ok(!result.messages.some((m) => m.content === ELISION_MARKER))
  // system + 4 history + query
  assert.equal(result.messages.length, 6)
})

test('never exceeds the prompt budget', () => {
  // 200 turns against a small window: the old code would have handed all of this
  // to the backend and let it truncate silently.
  const result = planPrompt(
    makeInputs({ history: history(200), contextWindow: 4096 })
  )
  assert.ok(
    result.trace.estimatedPromptTokens <= result.trace.promptBudget,
    `prompt ${result.trace.estimatedPromptTokens} exceeds budget ${result.trace.promptBudget}`
  )
  assert.ok(result.trace.turnsDropped > 0)
})

test('reserves room for the response and reports it as numPredict', () => {
  const result = planPrompt(makeInputs({ contextWindow: 4096 }))
  assert.equal(result.trace.responseReserve, result.numPredict)
  assert.equal(result.trace.promptBudget, 4096 - result.trace.responseReserve)
  assert.ok(result.numPredict > 0)
})

test('system blocks and the current question are never dropped', () => {
  const result = planPrompt(
    makeInputs({
      systemBlocks: [
        { role: 'system', content: 'NOMAD.md instructions' },
        { role: 'system', content: 'Formatting rules' },
      ],
      history: history(200),
      contextWindow: 4096,
    })
  )
  assert.ok(result.messages.some((m) => m.content === 'NOMAD.md instructions'))
  assert.ok(result.messages.some((m) => m.content === 'Formatting rules'))
  assert.equal(result.messages.at(-1)!.content, 'What is the boiling time for water?')
  assert.equal(result.trace.queryTruncated, false)
})

test('history is dropped oldest-first, keeping the most recent turns', () => {
  const result = planPrompt(makeInputs({ history: history(60), contextWindow: 4096 }))
  const kept = result.messages.filter((m) => m.role === 'user' && m.content.startsWith('Question'))
  const keptIndices = kept.map((m) => Number(m.content.match(/Question (\d+)/)![1]))
  // Whatever survived must be a contiguous run ending at the newest turn.
  assert.equal(keptIndices.at(-1), 59)
  for (let i = 1; i < keptIndices.length; i++) {
    assert.equal(keptIndices[i], keptIndices[i - 1] + 1)
  }
})

test('surviving history always starts on a user turn', () => {
  // Otherwise the transcript opens with the model answering a question it can no
  // longer see, which reads as an unprompted statement.
  const result = planPrompt(makeInputs({ history: history(60), contextWindow: 4096 }))
  const firstNonSystem = result.messages.find((m) => m.role !== 'system')
  assert.equal(firstNonSystem!.role, 'user')
})

test('an elision marker is inserted when turns are dropped', () => {
  const result = planPrompt(makeInputs({ history: history(60), contextWindow: 4096 }))
  assert.equal(result.trace.historyElided, true)
  assert.ok(result.messages.some((m) => m.content === ELISION_MARKER))
})

test('turns are evicted in blocks so the prefix stays stable', () => {
  // Dropping one turn per request would shift the prefix every turn and force a
  // full re-prefill each time. Eviction lands on a block boundary instead.
  const result = planPrompt(makeInputs({ history: history(60), contextWindow: 4096 }))
  assert.equal(result.trace.turnsDropped % HISTORY_EVICTION_BLOCK, 0)
})

test('growing the conversation keeps the retained prefix stable across turns', () => {
  // The KV-cache property, asserted directly: as turns accumulate between
  // evictions, the set of retained older turns must not change.
  const seen: string[] = []
  for (let turnCount = 40; turnCount < 44; turnCount++) {
    const result = planPrompt(makeInputs({ history: history(turnCount), contextWindow: 8192 }))
    const oldest = result.messages.find((m) => m.role === 'user' && m.content.startsWith('Question'))
    seen.push(oldest!.content)
  }
  assert.equal(new Set(seen).size, 1, `prefix shifted between turns: ${JSON.stringify(seen)}`)
})

test('retrieved chunks are kept whole, best-first, within their share', () => {
  const chunks: BudgetChunk[] = [
    { text: words(100, 'best') },
    { text: words(100, 'good') },
    { text: words(100, 'ok') },
    { text: words(100, 'meh') },
  ]
  const result = planPrompt(makeInputs({ ragChunks: chunks, contextWindow: 4096 }))
  const ragMessage = result.messages.find((m) => m.content.includes('[Context 1]'))!
  assert.ok(ragMessage.content.includes('best0'), 'the best chunk must survive')
  // Every chunk present must be present in full — no mid-sentence cuts.
  for (const chunk of chunks) {
    if (ragMessage.content.includes(chunk.text.slice(0, 20))) {
      assert.ok(ragMessage.content.includes(chunk.text), 'chunks must not be truncated')
    }
  }
  assert.equal(result.trace.chunksKept + result.trace.chunksDropped, chunks.length)
})

test('retrieved context does not starve history, and vice versa', () => {
  const result = planPrompt(
    makeInputs({
      history: history(40),
      ragChunks: [{ text: words(300, 'ctx') }],
      contextWindow: 8192,
    })
  )
  assert.ok(result.trace.ragTokens > 0, 'context should be present')
  assert.ok(result.trace.historyTokens > 0, 'history should be present')
  assert.ok(result.trace.estimatedPromptTokens <= result.trace.promptBudget)
})

test('tail placement puts retrieved context just before the question', () => {
  const result = planPrompt(
    makeInputs({ history: history(3), ragChunks: [{ text: 'boil for one minute' }] })
  )
  assert.equal(result.trace.ragPlacement, 'tail')
  const ragIndex = result.messages.findIndex((m) => m.content.includes('[Context 1]'))
  assert.equal(ragIndex, result.messages.length - 2)
  assert.equal(result.messages.at(-1)!.role, 'user')
})

test('front placement reproduces the historical ordering', () => {
  const result = planPrompt(
    makeInputs({
      history: history(3),
      ragChunks: [{ text: 'boil for one minute' }],
      ragPlacement: 'front',
    })
  )
  const ragIndex = result.messages.findIndex((m) => m.content.includes('[Context 1]'))
  const firstHistory = result.messages.findIndex((m) => m.content.startsWith('Question'))
  assert.ok(ragIndex < firstHistory, 'front placement puts context ahead of history')
  assert.equal(result.messages.at(-1)!.role, 'user')
})

test('placement does not change what survives the budget', () => {
  // Only the ordering should differ, so an eval comparison isolates the KV-cache
  // effect rather than a difference in retained content.
  const base = { history: history(30), ragChunks: [{ text: words(200, 'ctx') }], contextWindow: 8192 }
  const tail = planPrompt(makeInputs({ ...base, ragPlacement: 'tail' }))
  const front = planPrompt(makeInputs({ ...base, ragPlacement: 'front' }))
  assert.equal(tail.trace.chunksKept, front.trace.chunksKept)
  assert.equal(tail.trace.turnsKept, front.trace.turnsKept)
  assert.equal(tail.messages.length, front.messages.length)
})

test('an oversized question is truncated visibly rather than silently', () => {
  const result = planPrompt(
    makeInputs({ query: { role: 'user', content: words(20000, 'q') }, contextWindow: 4096 })
  )
  assert.equal(result.trace.queryTruncated, true)
  assert.match(result.messages.at(-1)!.content, /truncated because it exceeds the context window/)
  assert.ok(result.trace.estimatedPromptTokens <= result.trace.contextWindow)
})

test('the calibration ratio tightens the budget', () => {
  // A model that tokenizes more finely must be given less text, not the same text
  // with a wrong estimate attached.
  const base = { history: history(80), contextWindow: 8192 }
  const uncalibrated = planPrompt(makeInputs({ ...base, ratio: 1 }))
  const finer = planPrompt(makeInputs({ ...base, ratio: 1.3 }))
  assert.ok(finer.trace.turnsKept <= uncalibrated.trace.turnsKept)
})

test('trace token accounting matches an independent estimate', () => {
  const result = planPrompt(
    makeInputs({ history: history(10), ragChunks: [{ text: words(50, 'c') }] })
  )
  assert.equal(result.trace.estimatedPromptTokens, estimateMessagesTokens(result.messages, 1))
})

test('empty history and no chunks still produces a valid prompt', () => {
  const result = planPrompt(makeInputs())
  assert.equal(result.messages.length, 2)
  assert.equal(result.trace.chunksKept, 0)
  assert.equal(result.trace.turnsKept, 0)
  assert.equal(result.trace.historyElided, false)
})
