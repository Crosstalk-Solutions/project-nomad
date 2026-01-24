import { formatBytes } from '~/lib/util'
import DynamicIcon, { DynamicIconName } from './DynamicIcon'
import { CuratedCategory, CategoryTier } from '../../types/downloads'
import classNames from 'classnames'
import { IconChevronRight, IconCircleCheck } from '@tabler/icons-react'

export interface CategoryCardProps {
  category: CuratedCategory
  selectedTier?: CategoryTier | null
  onClick?: (category: CuratedCategory) => void
}

const CategoryCard: React.FC<CategoryCardProps> = ({ category, selectedTier, onClick }) => {
  // Calculate total size range across all tiers
  const getTierTotalSize = (tier: CategoryTier, allTiers: CategoryTier[]): number => {
    let total = tier.resources.reduce((acc, r) => acc + r.size_mb * 1024 * 1024, 0)

    // Add included tier sizes recursively
    if (tier.includesTier) {
      const includedTier = allTiers.find(t => t.slug === tier.includesTier)
      if (includedTier) {
        total += getTierTotalSize(includedTier, allTiers)
      }
    }

    return total
  }

  const minSize = getTierTotalSize(category.tiers[0], category.tiers)
  const maxSize = getTierTotalSize(category.tiers[category.tiers.length - 1], category.tiers)

  // Determine which tier to highlight: selectedTier (wizard) > installedTierSlug (persisted)
  const highlightedTierSlug = selectedTier?.slug || category.installedTierSlug

  return (
    <div
      className={classNames(
        'flex flex-col bg-desert-green rounded-lg p-6 text-white border shadow-sm hover:shadow-lg transition-shadow cursor-pointer h-80',
        selectedTier ? 'border-lime-400 border-2' : 'border-desert-green'
      )}
      onClick={() => onClick?.(category)}
    >
      <div className="flex items-center mb-4">
        <div className="flex justify-between w-full items-center">
          <div className="flex items-center">
            <DynamicIcon icon={category.icon as DynamicIconName} className="w-6 h-6 mr-2" />
            <h3 className="text-lg font-semibold">{category.name}</h3>
          </div>
          {selectedTier ? (
            <div className="flex items-center">
              <IconCircleCheck className="w-5 h-5 text-lime-400" />
              <span className="text-lime-400 text-sm ml-1">{selectedTier.name}</span>
            </div>
          ) : (
            <IconChevronRight className="w-5 h-5 text-white opacity-70" />
          )}
        </div>
      </div>

      <p className="text-gray-200 grow">{category.description}</p>

      <div className="mt-4 pt-4 border-t border-white/20">
        <p className="text-sm text-gray-300 mb-2">
          {category.tiers.length} tiers available
          {!highlightedTierSlug && (
            <span className="text-gray-400"> - Click to choose</span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {category.tiers.map((tier) => {
            const isInstalled = tier.slug === highlightedTierSlug
            return (
              <span
                key={tier.slug}
                className={classNames(
                  'text-xs px-2 py-1 rounded',
                  isInstalled
                    ? 'bg-lime-500/30 text-lime-200'
                    : 'bg-white/10 text-gray-300',
                  selectedTier?.slug === tier.slug && 'ring-2 ring-lime-400'
                )}
              >
                {tier.name}
              </span>
            )
          })}
        </div>
        <p className="text-gray-300 text-xs mt-3">
          Size: {formatBytes(minSize, 1)} - {formatBytes(maxSize, 1)}
        </p>
      </div>
    </div>
  )
}

export default CategoryCard
