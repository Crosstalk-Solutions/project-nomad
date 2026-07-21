import { Link } from '@inertiajs/react'
import type { DrugSearchResult } from '../../../types/drug_reference'
import { PRODUCT_TYPES } from '../../../types/drug_reference'

interface Props {
  result: DrugSearchResult
}

/**
 * A single collapsed search result row.
 *
 * Shows brand name, generic name, OTC/Rx badge, route, and a "N labels"
 * chip when more than one set_id collapsed into this result.
 */
export default function DrugResultRow({ result }: Props) {
  const isRx = result.product_type === PRODUCT_TYPES.RX
  const isOtc = result.product_type === PRODUCT_TYPES.OTC

  return (
    <Link
      href={`/drug-reference/${result.id}`}
      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm text-gray-900 group-hover:text-desert-green truncate">
            {result.brand_name ?? result.generic_name ?? 'Unknown'}
          </span>

          {/* OTC / Rx badge */}
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

          {/* Collapsed labels count */}
          {result.labelCount > 1 && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 flex-shrink-0">
              {result.labelCount} labels
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-gray-500">
          {result.brand_name && result.generic_name && (
            <span className="italic truncate">{result.generic_name}</span>
          )}
          {result.manufacturer && (
            <span className="truncate">{result.manufacturer}</span>
          )}
          {result.route && <span>{result.route}</span>}
        </div>
      </div>

      <span className="ml-3 text-gray-400 text-xs flex-shrink-0">›</span>
    </Link>
  )
}
