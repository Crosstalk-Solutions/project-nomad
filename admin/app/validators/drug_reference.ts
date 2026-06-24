import vine from '@vinejs/vine'
import { PRODUCT_TYPES } from '../../types/drug_reference.js'

/**
 * Drug Reference v1 — request validators.
 *
 * Mirrors the stl_library validators: vine, minimal, typed at the edge.
 */

const PRODUCT_TYPE_VALUES = Object.values(PRODUCT_TYPES) as [string, ...string[]]

/** GET /api/drug-reference/search */
export const searchDrugValidator = vine.compile(
  vine.object({
    q: vine.string().trim().minLength(1).maxLength(200),
    product_type: vine.enum(PRODUCT_TYPE_VALUES).optional(),
    // Administration-route filter (openFDA `route`, e.g. ORAL, TOPICAL). Matched
    // with LIKE because the column holds a comma-joined list; the UI sends
    // curated values, the cap just bounds free input.
    route: vine.string().trim().minLength(2).maxLength(40).optional(),
    sort: vine.enum(['relevance', 'name'] as const).optional(),
    limit: vine.number().min(1).max(200).optional(),
    offset: vine.number().min(0).optional(),
    scope: vine.enum(['name', 'indication'] as const).optional(),
  })
)

/**
 * GET /api/drug-reference/interactions?ids=1,2,3
 *
 * Accepts `ids` as a comma-separated string. The controller parses the actual
 * id values via parseCompareIds (dedupe, drop non-positive-int, cap at 5).
 * Vine validates only that `ids` is a non-empty string; the pure helper does
 * the real semantic validation so it can be unit-tested without a running app.
 */
export const interactionsValidator = vine.compile(
  vine.object({
    ids: vine.string().trim().minLength(1).maxLength(200).optional(),
  })
)
