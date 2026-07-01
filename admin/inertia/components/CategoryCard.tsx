import { formatBytes } from '~/lib/util'
import DynamicIcon, { DynamicIconName } from './DynamicIcon'
import type { CategoryWithStatus, SpecTier } from '../../types/collections'
import classNames from 'classnames'
import { IconChevronRight, IconCircleCheck, IconLoader2 } from '@tabler/icons-react'

export interface CategoryCardProps {
  category: CategoryWithStatus
  selectedTier?: SpecTier | null
  onClick?: (category: CategoryWithStatus) => void
}

const CategoryCard: React.FC<CategoryCardProps> = ({ category, selectedTier, onClick }) => {
  // Calculate total size range across all tiers
  const getTierTotalSize = (tier: SpecTier, allTiers: SpecTier[]): number => {
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

  // Priority order for the prominent corner badge + lime border:
  //   1. selectedTier — in-session wizard pick (highest priority, reflects
  //      what the user is editing right now)
  //   2. downloadingTierSlug — backend-derived from in-flight downloads, so
  //      the card shows the user's intent immediately after Submit, before
  //      any single file has finished downloading
  //   3. installedTierSlug — fully on disk
  const downloadingTier = !selectedTier && category.downloadingTierSlug
    ? category.tiers.find((t) => t.slug === category.downloadingTierSlug)
    : null
  const installedTier = !selectedTier && !downloadingTier && category.installedTierSlug
    ? category.tiers.find((t) => t.slug === category.installedTierSlug)
    : null
  const badgeTier = selectedTier || downloadingTier || installedTier
  const badgeStatus: 'selected' | 'downloading' | 'installed' | null = selectedTier
    ? 'selected'
    : downloadingTier
      ? 'downloading'
      : installedTier
        ? 'installed'
        : null
  const highlightedTierSlug = badgeTier?.slug

  return (
    <div
      className={classNames(
        'flex flex-col bg-desert-green rounded-lg p-6 text-white border shadow-sm hover:shadow-lg transition-shadow cursor-pointer h-80',
        badgeTier ? 'border-lime-400 border-2' : 'border-desert-green'
      )}
      onClick={() => onClick?.(category)}
    >
      <div className="flex items-center mb-4">
        <div className="flex justify-between w-full items-center">
          <div className="flex items-center">
            <DynamicIcon icon={category.icon as DynamicIconName} className="w-6 h-6 mr-2" />
            <h3 className="text-lg font-semibold">{category.name}</h3>
          </div>
          {badgeTier ? (
            <div className="flex items-center">
              {badgeStatus === 'downloading' ? (
                <IconLoader2 className="w-5 h-5 text-lime-400 animate-spin" />
              ) : (
                <IconCircleCheck className="w-5 h-5 text-lime-400" />
              )}
              <span className="text-lime-400 text-sm ml-1">
                {badgeTier.name}
                {badgeStatus === 'downloading' && ' (downloading)'}
              </span>
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
