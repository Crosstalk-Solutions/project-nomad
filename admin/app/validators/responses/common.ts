/*
|--------------------------------------------------------------------------
| Shared response schemas
|--------------------------------------------------------------------------
|
| Response schemas are authored as VineJS validators purely so the OpenAPI
| generator can turn them into documented response bodies via `toJSONSchema()`.
| They are not (currently) used to validate outgoing responses — though they
| could be asserted against in tests.
|
| Only add a schema here once its shape is verified against the controller /
| model it documents; a wrong response schema is worse than none.
|
*/
import vine from '@vinejs/vine'

/** `{ status: 'ok' }` health probes. */
export const healthResponse = vine.compile(
  vine.object({
    status: vine.string(),
  })
)

/** The `{ error: '...' }` envelope returned on most failure paths. */
export const errorResponse = vine.compile(
  vine.object({
    error: vine.string(),
  })
)

/** The `{ success, message? }` envelope used by many mutation endpoints. */
export const successMessageResponse = vine.compile(
  vine.object({
    success: vine.boolean(),
    message: vine.string().optional(),
  })
)
