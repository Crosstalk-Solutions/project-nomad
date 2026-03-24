import vine from '@vinejs/vine'

export const getJobStatusSchema = vine.compile(
  vine.object({
    filePath: vine.string().maxLength(500),
  })
)

export const deleteFileSchema = vine.compile(
  vine.object({
    source: vine.string(),
  })
)
