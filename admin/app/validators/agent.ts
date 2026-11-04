import vine from '@vinejs/vine'

export const agentChatSchema = vine.compile(
  vine.object({
    model: vine.string().trim().minLength(1),
    messages: vine.array(
      vine.object({
        role: vine.enum(['user', 'assistant'] as const),
        content: vine.string(),
      })
    ),
    sessionId: vine.number().positive().optional(),
  })
)
