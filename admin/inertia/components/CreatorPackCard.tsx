import { formatBytes } from '~/lib/util'
import type { CreatorPackWithStatus } from '../../types/collections'
import classNames from 'classnames'
import {
  IconChevronRight,
  IconCircleCheck,
  IconLoader2,
  IconMovie,
} from '@tabler/icons-react'

export interface CreatorPackCardProps {
  pack: CreatorPackWithStatus
  /** In-session wizard selection highlight (before anything is installed). */
  selected?: boolean
  onClick?: (pack: CreatorPackWithStatus) => void
}

const CreatorPackCard: React.FC<CreatorPackCardProps> = ({ pack, selected, onClick }) => {
  const isInstalled = pack.status === 'installed'
  const isDownloading = pack.status === 'downloading'
  const hasUpdate = !!pack.available_update_version
  const sizeBytes = pack.size_mb * 1024 * 1024

  // Installed packs are inert unless a newer version is available (click = update).
  // Selected (wizard) and available packs are always clickable.
  const clickable = selected || !isInstalled || hasUpdate

  const highlighted = selected || isDownloading || (isInstalled && !hasUpdate)

  return (
    <div
      className={classNames(
        'flex flex-col bg-desert-green rounded-lg p-6 text-white border shadow-sm transition-shadow h-80',
        highlighted ? 'border-lime-400 border-2' : 'border-desert-green',
        clickable ? 'cursor-pointer hover:shadow-lg' : 'opacity-65 cursor-not-allowed'
      )}
      onClick={() => {
        if (!clickable) return
        onClick?.(pack)
      }}
    >
      <div className="flex items-center mb-2">
        <div className="flex justify-between w-full items-center">
          <div className="flex items-center min-w-0">
            {pack.logo_url ? (
              <img
                src={pack.logo_url}
                alt=""
                className="w-6 h-6 mr-2 rounded object-cover shrink-0"
              />
            ) : (
              <IconMovie className="w-6 h-6 mr-2 shrink-0" />
            )}
            <h3 className="text-lg font-semibold truncate">{pack.name}</h3>
          </div>
          {selected ? (
            <div className="flex items-center shrink-0">
              <IconCircleCheck className="w-5 h-5 text-lime-400" />
              <span className="text-lime-400 text-sm ml-1">Selected</span>
            </div>
          ) : isDownloading ? (
            <div className="flex items-center shrink-0">
              <IconLoader2 className="w-5 h-5 text-lime-400 animate-spin" />
              <span className="text-lime-400 text-sm ml-1">Downloading</span>
            </div>
          ) : isInstalled ? (
            <div className="flex items-center shrink-0">
              <IconCircleCheck className="w-5 h-5 text-lime-400" />
              <span className="text-lime-400 text-sm ml-1">Installed</span>
            </div>
          ) : (
            <IconChevronRight className="w-5 h-5 text-white opacity-70 shrink-0" />
          )}
        </div>
      </div>

      <p className="text-gray-300 text-xs mb-3">by {pack.creator}</p>

      <p className="text-gray-200 grow">{pack.description}</p>

      {hasUpdate && (
        <span className="self-start mt-2 text-xs px-2 py-1 rounded bg-lime-500/30 text-lime-200">
          Update available
        </span>
      )}

      <div className="mt-4 pt-4 border-t border-white/20">
        <p className="text-gray-300 text-xs">
          {pack.video_count} videos | {formatBytes(sizeBytes, 0)}
        </p>
      </div>
    </div>
  )
}

export default CreatorPackCard
