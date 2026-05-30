import vine from '@vinejs/vine'

export const localLibraryFilenameValidator = vine.compile(
  vine.object({
    params: vine.object({
      filename: vine.string().minLength(1).maxLength(255),
    }),
  })
)

export const localLibraryRenameValidator = vine.compile(
  vine.object({
    params: vine.object({
      filename: vine.string().minLength(1).maxLength(255),
    }),
    name: vine.string().trim().minLength(1).maxLength(255),
  })
)
