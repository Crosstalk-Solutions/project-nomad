import { useState } from 'react'
import { formatBytes } from '~/lib/util'
import type { CreatorPackWithStatus } from '../../types/collections'
import classNames from 'classnames'
import {
  IconChevronRight,
  IconCircleCheck,
  IconLoader2,
  IconMovie,
  IconTrash,
} from '@tabler/icons-react'

export interface CreatorPackCardProps {
  pack: CreatorPackWithStatus
  /** In-session wizard selection highlight (before anything is installed). */
  selected?: boolean
  onClick?: (pack: CreatorPackWithStatus) => void
  /** When set, an installed pack shows an uninstall control (settings surface only). */
  onUninstall?: (pack: CreatorPackWithStatus) => void
}

const CreatorPackCard: React.FC<CreatorPackCardProps> = ({ pack, selected, onClick, onUninstall }) => {
  const isInstalled = pack.status === 'installed'
  const isDownloading = pack.status === 'downloading'
  const hasUpdate = !!pack.available_update_version
  const sizeBytes = pack.size_mb * 1024 * 1024

  // Installed packs are inert unless a newer version is available (click = update).
  const clickable = selected || !isInstalled || hasUpdate
  const highlighted = selected || isDownloading || (isInstalled && !hasUpdate)

  // Prefer a catalog-supplied banner (future remote creators); otherwise the
  // banner bundled with the app by pack id. Both are the branded 1060x175 art we
  // build into the ZIM. Fall back to a simple header only if the image is absent.
  const [bannerFailed, setBannerFailed] = useState(false)
  const bannerSrc = pack.banner_url || `/creator-packs/${pack.id}.webp`

  const statusBadge = selected ? (
    <span className="flex items-center text-lime-600 dark:text-lime-400 text-sm font-medium">
      <IconCircleCheck className="w-5 h-5 mr-1" />
      Selected
    </span>
  ) : isDownloading ? (
    <span className="flex items-center text-lime-600 dark:text-lime-400 text-sm font-medium">
      <IconLoader2 className="w-5 h-5 mr-1 animate-spin" />
      Downloading
    </span>
  ) : isInstalled ? (
    <span className="flex items-center text-lime-600 dark:text-lime-400 text-sm font-medium">
      <IconCircleCheck className="w-5 h-5 mr-1" />
      Installed
    </span>
  ) : (
    <span className="flex items-center text-text-muted text-sm font-medium">
      Install
      <IconChevronRight className="w-5 h-5 ml-1" />
    </span>
  )

  return (
    <div
      className={classNames(
        'flex flex-col rounded-lg overflow-hidden bg-surface-primary border shadow-sm transition-shadow',
        highlighted ? 'border-lime-400 border-2' : 'border-border-subtle',
        clickable ? 'cursor-pointer hover:shadow-lg' : 'opacity-70 cursor-not-allowed'
      )}
      onClick={() => {
        if (!clickable) return
        onClick?.(pack)
      }}
    >
      {!bannerFailed ? (
        <img
          src={bannerSrc}
          alt={pack.name}
          className="w-full block aspect-[1060/175] object-cover"
          onError={() => setBannerFailed(true)}
        />
      ) : (
        <div className="flex items-center gap-2 bg-desert-green text-white px-5 py-6">
          <IconMovie className="w-6 h-6 shrink-0" />
          <h3 className="text-lg font-semibold truncate">{pack.name}</h3>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <p className="text-sm text-text-secondary truncate">
            {pack.video_count} videos &middot; {formatBytes(sizeBytes, 0)}
          </p>
          {hasUpdate && (
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-lime-500/20 text-lime-700 dark:text-lime-300">
              Update available
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {statusBadge}
          {onUninstall && isInstalled && (
            <button
              type="button"
              title="Uninstall pack"
              aria-label="Uninstall pack"
              className="p-1 rounded text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                onUninstall(pack)
              }}
            >
              <IconTrash className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CreatorPackCard
