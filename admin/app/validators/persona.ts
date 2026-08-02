import vine from '@vinejs/vine'

/**
 * Persona override payload. All fields optional — only the ones present are
 * applied. Use null explicitly to clear an override field; omit to leave it
 * unchanged.
 */
export const updatePersonaOverrideSchema = vine.compile(
  vine.object({
    label: vine.string().trim().minLength(1).maxLength(60).nullable().optional(),
    description: vine.string().trim().maxLength(500).nullable().optional(),
    systemPrompt: vine.string().trim().maxLength(20000).nullable().optional(),
  })
)
