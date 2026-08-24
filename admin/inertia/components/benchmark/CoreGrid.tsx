import { useTranslation } from 'react-i18next'
import classNames from '~/lib/classNames'

interface CoreGridProps {
  /** Per-thread load, 0-100. */
  loads: number[]
}

const MAX_CELLS = 64

// Colour ramp by load: idle olive -> warm orange -> hot red. Cells transition
// smoothly as load climbs, so a single-thread pass lights one cell and an
// all-threads pass lights the whole grid.
function cellClass(load: number): string {
  if (load >= 80) return 'bg-desert-red'
  if (load >= 55) return 'bg-desert-orange'
  if (load >= 25) return 'bg-desert-olive'
  if (load >= 8) return 'bg-desert-green'
  return 'bg-desert-green/15'
}

export default function CoreGrid({ loads }: CoreGridProps) {
  const { t } = useTranslation()

  // Fold very high core counts down to MAX_CELLS by averaging groups.
  let cells = loads
  let grouped = 1
  if (loads.length > MAX_CELLS) {
    grouped = Math.ceil(loads.length / MAX_CELLS)
    cells = []
    for (let i = 0; i < loads.length; i += grouped) {
      const slice = loads.slice(i, i + grouped)
      cells.push(slice.reduce((a, b) => a + b, 0) / slice.length)
    }
  }

  const cols = Math.min(cells.length, 16) || 1

  return (
    <div className="space-y-2">
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {cells.map((load, i) => (
          <div
            key={i}
            title={t('benchmark.core_grid.thread_tooltip', { thread: i + 1, load: Math.round(load) })}
            className={classNames(
              'aspect-square rounded-sm transition-colors duration-300',
              cellClass(load)
            )}
          />
        ))}
      </div>
      <div className="text-xs text-desert-stone-dark font-mono">
        {t('benchmark.core_grid.thread_count', { count: loads.length })}
        {grouped > 1 ? t('benchmark.core_grid.grouped_per_cell', { grouped }) : ''}
      </div>
    </div>
  )
}
