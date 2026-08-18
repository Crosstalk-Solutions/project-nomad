import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ThinkTagSplitter,
  normalizeNonStreamed,
  partialTagSuffix,
  splitThinkTags,
} from '../../app/utils/think_stream.js'

/**
 * Characterization tests for the <think> tag splitter extracted out of
 * OllamaService.chatStream. The behaviour under test is the chunk-boundary
 * handling: a tag can arrive split across any number of stream chunks, and text
 * that might still turn out to be a tag must not be emitted early.
 */

/** Feed a whole string through the splitter one chunk at a time. */
function stream(chunks: string[]) {
  const splitter = new ThinkTagSplitter()
  let content = ''
  let thinking = ''
  for (const chunk of chunks) {
    const out = splitter.push(chunk)
    content += out.content
    thinking += out.thinking
  }
  const tail = splitter.flush()
  return { content: content + tail.content, thinking: thinking + tail.thinking }
}

test('partialTagSuffix finds how much trailing text could start a tag', () => {
  assert.equal(partialTagSuffix('<think>', 'hello<thi'), 4)
  assert.equal(partialTagSuffix('<think>', 'hello<'), 1)
  assert.equal(partialTagSuffix('<think>', 'hello'), 0)
  // A complete tag is not a *partial* tag — the caller handles that case via indexOf.
  assert.equal(partialTagSuffix('<think>', '<think>'), 0)
})

test('passes through text with no tags', () => {
  assert.deepEqual(stream(['Hello ', 'world']), { content: 'Hello world', thinking: '' })
})

test('separates a complete think block arriving in one chunk', () => {
  assert.deepEqual(stream(['<think>reasoning</think>answer']), {
    content: 'answer',
    thinking: 'reasoning',
  })
})

test('handles an opening tag split across chunks', () => {
  assert.deepEqual(stream(['<thi', 'nk>reasoning</think>answer']), {
    content: 'answer',
    thinking: 'reasoning',
  })
})

test('handles a closing tag split across chunks', () => {
  assert.deepEqual(stream(['<think>reasoning</thi', 'nk>answer']), {
    content: 'answer',
    thinking: 'reasoning',
  })
})

test('handles tags split one character at a time', () => {
  const chunks = '<think>abc</think>xyz'.split('')
  assert.deepEqual(stream(chunks), { content: 'xyz', thinking: 'abc' })
})

test('never emits a partial tag as content before it resolves', () => {
  const splitter = new ThinkTagSplitter()
  // "<thi" could still become "<think>", so it must be held back, not emitted.
  assert.deepEqual(splitter.push('answer<thi'), { content: 'answer', thinking: '' })
  assert.deepEqual(splitter.push('nk>hidden</think>'), { content: '', thinking: 'hidden' })
})

test('flushes a dangling partial tag rather than swallowing it', () => {
  // "<thi" that never completes was never a tag. Dropping it would silently
  // truncate the answer, which is what the pre-extraction code did.
  assert.deepEqual(stream(['answer<thi']), { content: 'answer<thi', thinking: '' })
})

test('flushes an unterminated think block to the thinking channel', () => {
  assert.deepEqual(stream(['<think>cut off mid-thought']), {
    content: '',
    thinking: 'cut off mid-thought',
  })
})

test('handles multiple think blocks in one stream', () => {
  assert.deepEqual(stream(['<think>one</think>a<think>two</think>b']), {
    content: 'ab',
    thinking: 'onetwo',
  })
})

test('splitThinkTags handles the non-streaming case', () => {
  assert.deepEqual(splitThinkTags('<think>why</think>because'), {
    content: 'because',
    thinking: 'why',
  })
  assert.deepEqual(splitThinkTags('no tags here'), { content: 'no tags here', thinking: '' })
})

// --- normalizeNonStreamed ----------------------------------------------------
//
// The non-streaming path feeds every ancillary call: chat titles, suggestion
// chips, and — the one that matters — the query that gets embedded and sent to
// Qdrant. Reasoning reaching any of those is the bug this exists to close.

test('normalizeNonStreamed: inline tags are split out of content', () => {
  assert.deepEqual(normalizeNonStreamed('<think>weighing it up</think>Boiling Water'), {
    content: 'Boiling Water',
    thinking: 'weighing it up',
  })
})

test('normalizeNonStreamed: a structured thinking field passes through untouched', () => {
  assert.deepEqual(normalizeNonStreamed('Boiling Water', 'weighing it up'), {
    content: 'Boiling Water',
    thinking: 'weighing it up',
  })
})

test('normalizeNonStreamed: structured and inline reasoning merge into one channel', () => {
  // Ollama reports reasoning natively AND the model emits literal tags in content.
  assert.deepEqual(normalizeNonStreamed('<think>then this</think>Answer', 'first this '), {
    content: 'Answer',
    thinking: 'first this then this',
  })
})

test('normalizeNonStreamed: reasoning truncated mid-thought leaves no content', () => {
  // What a reasoning model does under QUERY_REWRITE_MAX_TOKENS: it spends the whole
  // budget thinking and never closes the tag. Callers must treat this as "no answer"
  // rather than embedding the empty string.
  assert.deepEqual(normalizeNonStreamed('<think>still working on it'), {
    content: '',
    thinking: 'still working on it',
  })
})

test('normalizeNonStreamed: text with no tags is passed through exactly', () => {
  assert.deepEqual(normalizeNonStreamed('  How do I purify water?  '), {
    content: '  How do I purify water?  ',
    thinking: '',
  })
})

test('normalizeNonStreamed: tolerates a missing content field', () => {
  assert.deepEqual(normalizeNonStreamed(undefined as unknown as string), {
    content: '',
    thinking: '',
  })
})
