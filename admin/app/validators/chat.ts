import vine from '@vinejs/vine'
import { PERSONA_KEYS } from '../../constants/ollama.js'

export const createSessionSchema = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(200),
    model: vine.string().trim().optional(),
    persona: vine.enum(PERSONA_KEYS).optional(),
  })
)

export const updateSessionSchema = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(200).optional(),
    model: vine.string().trim().optional(),
    persona: vine.enum(PERSONA_KEYS).optional(),
  })
)

export const addMessageSchema = vine.compile(
  vine.object({
    role: vine.enum(['system', 'user', 'assistant'] as const),
    content: vine.string().trim().minLength(1),
  })
)
