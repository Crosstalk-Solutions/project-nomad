import vine from '@vinejs/vine'

export const getJobStatusSchema = vine.compile(
  vine.object({
    filePath: vine.string(),
  })
)

export const deleteFileSchema = vine.compile(
  vine.object({
    source: vine.string(),
  })
)

export const estimateBatchSchema = vine.compile(
  vine.object({
    files: vine
      .array(
        vine.object({
          filename: vine.string().minLength(1).maxLength(255),
          sizeBytes: vine.number().min(0),
        })
      )
      .minLength(1)
      .maxLength(500),
  })
)
