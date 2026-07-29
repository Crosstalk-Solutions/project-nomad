import { useState } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import DrugResultRow from './DrugResultRow'
import type { DrugSearchResult } from '../../../types/drug_reference'
import { PRODUCT_TYPES } from '../../../types/drug_reference'

export interface IngredientGrouping {
  key: string
  /** Display name (title-cased ingredient list). */
  label: string
  /** True when this group is a single active ingredient (ranked above combos). */
  single: boolean
  products: DrugSearchResult[]
}

/**
 * A collapsible "active ingredient → its products" group for the drug-name search.
 * A single-product group renders as a plain (ingredient-first) row; multi-product
 * groups collapse behind the ingredient name so the list stays scannable.
 */
export default function IngredientGroup({
  group,
  defaultOpen = false,
}: {
  group: IngredientGrouping
  /** Expand this group on first render (used for the top/first result group). */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  if (group.products.length === 1) {
    return <DrugResultRow result={group.products[0]} />
  }

  const anyOtc = group.products.some((p) => p.product_type === PRODUCT_TYPES.OTC)
  const anyRx = group.products.some((p) => p.product_type === PRODUCT_TYPES.RX)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-surface-secondary transition-colors"
      >
        <IconChevronDown
          size={16}
          className={`flex-shrink-0 text-desert-stone transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
        />
        <span className="font-semibold text-sm text-desert-green-darker truncate">{group.label}</span>
        {anyOtc && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-desert-olive/10 text-desert-olive-dark border border-desert-olive/30 flex-shrink-0">
            OTC
          </span>
        )}
        {anyRx && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-desert-orange/10 text-desert-orange-dark border border-desert-orange/30 flex-shrink-0">
            Rx
          </span>
        )}
        <span className="ml-auto text-xs text-desert-stone flex-shrink-0">
          {group.products.length} products
        </span>
      </button>
      {open && (
        <div className="divide-y divide-desert-stone-lighter/40 border-t border-desert-stone-lighter/30 bg-desert-sand/10">
          {group.products.map((d) => (
            <DrugResultRow key={d.id} result={d} brandFirst />
          ))}
        </div>
      )}
    </div>
  )
}
