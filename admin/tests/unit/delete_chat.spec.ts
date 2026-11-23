import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  CHAT_ROW_TRAILING_CONTROLS,
  DELETE_CHAT_CANCEL_TEXT,
  DELETE_CHAT_CONFIRM_TEXT,
  DELETE_CHAT_FAILURE_MESSAGE,
  DELETE_CHAT_LABEL,
  applyDeleteOutcome,
  canSubmitDelete,
  cancelDeleteConfirmation,
  deleteRequestSucceeded,
  deletionRequest,
  openDeleteConfirmation,
} from '../../inertia/components/chat/delete_chat.js'

const fieldNotes = { id: '9', title: 'Field notes' }
const water = { id: '4', title: 'Water treatment' }

test('confirm and cancel stay on the named chat until Delete chat is submitted', () => {
  const confirmation = openDeleteConfirmation(fieldNotes)

  assert.equal(DELETE_CHAT_LABEL, 'Delete chat')
  assert.equal(DELETE_CHAT_CONFIRM_TEXT, 'Delete chat')
  assert.equal(DELETE_CHAT_CANCEL_TEXT, 'Cancel')
  assert.equal(confirmation.sessionId, '9')
  assert.equal(confirmation.title, 'Field notes')
  assert.equal(canSubmitDelete(confirmation, false), true)
  assert.equal(cancelDeleteConfirmation(), null)
  assert.equal(canSubmitDelete(cancelDeleteConfirmation(), false), false)
})

test('a second confirm is ignored while a delete is already in flight', () => {
  const confirmation = openDeleteConfirmation(fieldNotes)

  assert.equal(canSubmitDelete(confirmation, true), false)
  assert.deepEqual(deletionRequest(confirmation), { sessionId: '9' })
  assert.deepEqual(Object.keys(deletionRequest(confirmation)), ['sessionId'])
})

test('the flame is the trailing control immediately after the title', () => {
  assert.deepEqual(CHAT_ROW_TRAILING_CONTROLS, ['delete-chat'])
  assert.equal(CHAT_ROW_TRAILING_CONTROLS[0], 'delete-chat')
})

test('success removes only the confirmed chat', () => {
  const messages = [{ id: 'm-water', content: 'Boil it.' }]
  const state = {
    sessions: [fieldNotes, water, { id: '5', title: 'Radio' }],
    view: { activeSessionId: '4', messages },
  }

  const after = applyDeleteOutcome(state, '9', 'success')

  assert.deepEqual(
    after.sessions.map((session) => session.id),
    ['4', '5']
  )
  assert.equal(after.view.activeSessionId, '4')
  assert.equal(after.view.messages, messages)
})

test('deleting the open chat returns to a clean new chat', () => {
  const state = {
    sessions: [fieldNotes, water],
    view: { activeSessionId: '9', messages: [{ id: 'm1', content: 'notes' }] },
  }

  const after = applyDeleteOutcome(state, '9', 'success')

  assert.deepEqual(
    after.sessions.map((session) => session.id),
    ['4']
  )
  assert.equal(after.view.activeSessionId, null)
  assert.deepEqual(after.view.messages, [])
})

test('a failed delete keeps every chat and the open conversation', () => {
  const messages = [{ id: 'm1', content: 'keep me' }]
  const sessions = [fieldNotes, water]
  const state = {
    sessions,
    view: { activeSessionId: '9', messages },
  }

  const after = applyDeleteOutcome(state, '9', 'failure')

  assert.equal(after, state)
  assert.equal(after.sessions, sessions)
  assert.equal(after.view.messages, messages)
  assert.equal(after.view.activeSessionId, '9')
  assert.equal(deleteRequestSucceeded(undefined), false)
  assert.equal(deleteRequestSucceeded(null), false)
  assert.equal(deleteRequestSucceeded({ success: false }), false)
  assert.equal(deleteRequestSucceeded({ success: true }), true)
  assert.match(DELETE_CHAT_FAILURE_MESSAGE, /Nothing was removed/)
})
