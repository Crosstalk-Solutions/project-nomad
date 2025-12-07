import vine from '@vinejs/vine'

export const downloadJobsByFiletypeSchema = vine.compile(
  vine.object({
    params: vine.object({
      filetype: vine.string(),
    }),
  })
)
