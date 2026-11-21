import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  CHAT_DELETION_TABLES,
  chatDeletionScope,
  parseChatSessionId,
} from '../../app/utils/chat_session_delete.js'

test('parses one positive session id and rejects ids that could widen a delete', () => {
  assert.equal(parseChatSessionId('4'), 4)
  assert.equal(parseChatSessionId(4), 4)
  assert.equal(parseChatSessionId('2foo'), null)
  assert.equal(parseChatSessionId('2 OR 1=1'), null)
  assert.equal(parseChatSessionId('01'), null)
  assert.equal(parseChatSessionId('0'), null)
  assert.equal(parseChatSessionId('-3'), null)
  assert.equal(parseChatSessionId('1.5'), null)
  assert.equal(parseChatSessionId(''), null)
  assert.equal(parseChatSessionId(' 4'), null)
  assert.equal(parseChatSessionId('4 '), null)
  assert.equal(parseChatSessionId(Number.NaN), null)
  assert.equal(parseChatSessionId(1.5), null)
  assert.equal(parseChatSessionId('9007199254740993'), null)
})

test('a chat deletion touches that session and its messages only', () => {
  const scope = chatDeletionScope(18)

  assert.equal(scope.sessionId, 18)
  assert.equal(scope.messageSessionId, 18)
  assert.deepEqual(scope.tables, ['chat_messages', 'chat_sessions'])
  assert.equal(scope.tables, CHAT_DELETION_TABLES)
  assert.equal(
    scope.tables.some((table) => /kb|rag|qdrant|drug|service/i.test(table)),
    false
  )
})

test('an invalid id never produces a deletion scope', () => {
  assert.throws(() => chatDeletionScope(0), /Invalid chat session id/)
  assert.throws(() => chatDeletionScope(Number.NaN), /Invalid chat session id/)
})
