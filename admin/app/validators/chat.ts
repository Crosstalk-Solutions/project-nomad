import vine from '@vinejs/vine'

export const createSessionSchema = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(200),
    model: vine.string().trim().optional(),
  })
)

export const updateSessionSchema = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(200).optional(),
    model: vine.string().trim().optional(),
  })
)

export const addMessageSchema = vine.compile(
  vine.object({
    role: vine.enum(['system', 'user', 'assistant'] as const),
    // chat_messages.content is MEDIUMTEXT (16 MB); a million characters stays
    // under it even at 4 bytes per character.
    content: vine.string().trim().minLength(1).maxLength(1_000_000),
  })
)