import classNames from '~/lib/classNames'
import { formatBytes } from '~/lib/util'
import { IconAlertTriangle, IconServer } from '@tabler/icons-react'

interface StorageProjectionBarProps {
  totalSize: number // Total disk size in bytes
  currentUsed: number // Currently used space in bytes
  projectedAddition: number // Additional space that will be used in bytes
}

export default function StorageProjectionBar({
  totalSize,
  currentUsed,
  projectedAddition,
}: StorageProjectionBarProps) {
  const projectedTotal = currentUsed + projectedAddition
  const currentPercent = (currentUsed / totalSize) * 100
  const projectedPercent = (projectedAddition / totalSize) * 100
  const projectedTotalPercent = (projectedTotal / totalSize) * 100
  const remainingAfter = totalSize - projectedTotal
  const willExceed = projectedTotal > totalSize

  // Determine warning level based on projected total
  const getProjectedColor = () => {
    if (willExceed) return 'bg-desert-red'
    if (projectedTotalPercent >= 90) return 'bg-desert-orange'
    if (projectedTotalPercent >= 75) return 'bg-desert-tan'
    return 'bg-desert-olive'
  }

  const getProjectedGlow = () => {
    if (willExceed) return 'shadow-desert-red/50'
    if (projectedTotalPercent >= 90) return 'shadow-desert-orange/50'
    if (projectedTotalPercent >= 75) return 'shadow-desert-tan/50'
    return 'shadow-desert-olive/50'
  }

  return (
    <div className="bg-desert-stone-lighter/30 rounded-lg p-4 border border-desert-stone-light">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <IconServer size={20} className="text-desert-green" />
          <span className="font-semibold text-desert-green">Storage</span>
        </div>
        <div className="text-sm text-desert-stone-dark font-mono">
          {formatBytes(projectedTotal, 1)} / {formatBytes(totalSize, 1)}
          {projectedAddition > 0 && (
            <span className="text-desert-stone ml-2">
              (+{formatBytes(projectedAddition, 1)} selected)
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative">
        <div className="h-8 bg-desert-green-lighter/20 rounded-lg border border-desert-stone-light overflow-hidden">
          {/* Current usage - darker/subdued */}
          <div
            className="absolute h-full bg-desert-stone transition-all duration-300"
            style={{ width: `${Math.min(currentPercent, 100)}%` }}
          />
          {/* Projected addition - highlighted */}
          {projectedAddition > 0 && (
            <div
              className={classNames(
                'absolute h-full transition-all duration-300 shadow-lg',
                getProjectedColor(),
                getProjectedGlow()
              )}
              style={{
                left: `${Math.min(currentPercent, 100)}%`,
                width: `${Math.min(projectedPercent, 100 - currentPercent)}%`,
              }}
            />
          )}
        </div>

        {/* Percentage label */}
        <div
          className={classNames(
            'absolute top-1/2 -translate-y-1/2 font-bold text-sm',
            projectedTotalPercent > 15
              ? 'left-3 text-desert-white drop-shadow-md'
              : 'right-3 text-desert-green'
          )}
        >
          {Math.round(projectedTotalPercent)}%
        </div>
      </div>

      {/* Legend and warnings */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-desert-stone" />
            <span className="text-desert-stone-dark">Current ({formatBytes(currentUsed, 1)})</span>
          </div>
          {projectedAddition > 0 && (
            <div className="flex items-center gap-1.5">
              <div className={classNames('w-3 h-3 rounded', getProjectedColor())} />
              <span className="text-desert-stone-dark">
                Selected (+{formatBytes(projectedAddition, 1)})
              </span>
            </div>
          )}
        </div>

        {willExceed ? (
          <div className="flex items-center gap-1.5 text-desert-red text-xs font-medium">
            <IconAlertTriangle size={14} />
            <span>Exceeds available space by {formatBytes(projectedTotal - totalSize, 1)}</span>
          </div>
        ) : (
          <div className="text-xs text-desert-stone">
            {formatBytes(remainingAfter, 1)} will remain free
          </div>
        )}
      </div>
    </div>
  )
}
