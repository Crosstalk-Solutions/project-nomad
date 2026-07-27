import { Link } from '@inertiajs/react'
import type { DrugSearchResult } from '../../../types/drug_reference'
import { PRODUCT_TYPES } from '../../../types/drug_reference'

interface Props {
  result: DrugSearchResult
  /**
   * Inside an ingredient group the active ingredient is already the group header,
   * so lead with the brand (product identity) instead of repeating the ingredient.
   * Ungrouped (default) leads with the active ingredient — the thing users think in.
   */
  brandFirst?: boolean
}

/** Title-case an UPPERCASE ingredient string (IBUPROFEN → Ibuprofen). */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
}

/**
 * A single collapsed search result row. Leads with the active ingredient by
 * default (drug-first), or the brand when rendered inside an ingredient group.
 */
export default function DrugResultRow({ result, brandFirst = false }: Props) {
  const isRx = result.product_type === PRODUCT_TYPES.RX
  const isOtc = result.product_type === PRODUCT_TYPES.OTC

  const ingredient = result.generic_name ? titleCase(result.generic_name) : null
  const brand = result.brand_name ?? null

  // Headline vs sub-line depending on context.
  const headline = brandFirst
    ? (brand ?? ingredient ?? 'Unknown')
    : (ingredient ?? brand ?? 'Unknown')
  const subParts: string[] = []
  if (brandFirst) {
    if (result.manufacturer) subParts.push(result.manufacturer)
  } else {
    // Ingredient-first: show the brand (if it differs from the ingredient) + maker.
    if (brand && brand.toLowerCase() !== (ingredient ?? '').toLowerCase()) subParts.push(brand)
    if (result.manufacturer) subParts.push(result.manufacturer)
  }
  if (result.route) subParts.push(titleCase(result.route))

  return (
    <Link
      href={`/drug-reference/${result.id}`}
      className="flex items-center justify-between px-4 py-3 hover:bg-surface-secondary transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm text-text-primary group-hover:text-desert-green truncate">
            {headline}
          </span>

          {isRx && (
            <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-desert-orange/10 text-desert-orange-dark border border-desert-orange/30 flex-shrink-0">
              Rx
            </span>
          )}
          {isOtc && (
            <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-desert-olive/10 text-desert-olive-dark border border-desert-olive/30 flex-shrink-0">
              OTC
            </span>
          )}

          {result.labelCount > 1 && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-surface-secondary text-text-secondary flex-shrink-0">
              {result.labelCount} labels
            </span>
          )}
        </div>

        {subParts.length > 0 && (
          <div className="flex flex-wrap gap-x-3 mt-0.5 text-xs text-text-secondary">
            {subParts.map((p, i) => (
              <span key={i} className="truncate">
                {p}
              </span>
            ))}
          </div>
        )}
      </div>

      <span className="ml-3 text-text-muted text-xs flex-shrink-0">›</span>
    </Link>
  )
}
