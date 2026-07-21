/*
|--------------------------------------------------------------------------
| Chat response schemas
|--------------------------------------------------------------------------
|
| Shapes mirror the serialized `ChatSession` / `ChatMessage` Lucid models
| (app/models/chat_session.ts, app/models/chat_message.ts). `messages` is only
| present when the relation is preloaded, so it is optional.
|
*/
import vine from '@vinejs/vine'

const chatMessage = vine.object({
  id: vine.number(),
  session_id: vine.number(),
  role: vine.enum(['system', 'user', 'assistant'] as const),
  content: vine.string(),
  created_at: vine.string(),
  updated_at: vine.string(),
})

const chatSession = vine.object({
  id: vine.number(),
  title: vine.string(),
  model: vine.string().nullable(),
  created_at: vine.string(),
  updated_at: vine.string(),
  messages: vine.array(chatMessage).optional(),
})

export const chatSessionResponse = vine.compile(chatSession)
export const chatSessionListResponse = vine.compile(vine.array(chatSession.clone()))
export const chatMessageResponse = vine.compile(chatMessage.clone())
