import vine from '@vinejs/vine'

/**
 * "When to use what" — request validators.
 *
 * Mirrors the drug_reference validators: vine, minimal, typed at the edge.
 */

/**
 * GET /api/conditions/drugs
 *
 * Resolve OTC drugs for either a curated condition (`slug`) or a free-text
 * situation (`q`). Both are optional at the schema level; the controller
 * requires exactly one and 400s otherwise, so the error message is specific
 * ("provide slug or q") rather than a generic vine union failure.
 */
export const conditionDrugsValidator = vine.compile(
  vine.object({
    slug: vine.string().trim().minLength(1).maxLength(80).optional(),
    q: vine.string().trim().minLength(1).maxLength(200).optional(),
    limit: vine.number().min(1).max(200).optional(),
    route: vine.string().trim().minLength(1).maxLength(40).optional(),
    sort: vine.enum(['relevance', 'name']).optional(),
  })
)
