import vine from '@vinejs/vine'

export const installServiceValidator = vine.compile(vine.object({
    service_name: vine.string().trim()
}))