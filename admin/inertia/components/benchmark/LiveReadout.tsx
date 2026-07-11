import classNames from '~/lib/classNames'

interface LiveReadoutProps {
  value: number | null
  unit?: string
  label: string
  /** Optional secondary line, e.g. a TTFT badge. */
  sub?: string
  size?: 'md' | 'lg'
  className?: string
}

/**
 * Big monospace numeric readout for live metrics (tokens/sec, MB/s, %).
 * Uses tabular figures so the digits don't jitter as the value updates.
 */
export default function LiveReadout({ value, unit, label, sub, size = 'md', className = 'text-desert-green' }: LiveReadoutProps) {
  const display = value === null ? '--' : value >= 100 ? Math.round(value).toString() : value.toFixed(1)

  return (
    <div className="flex flex-col">
      <div className={classNames('font-bold font-mono tabular-nums leading-none', size === 'lg' ? 'text-5xl' : 'text-3xl', className)}>
        {display}
        {unit && <span className="text-base font-semibold text-desert-stone-dark ml-1">{unit}</span>}
      </div>
      <div className="text-sm text-desert-stone-dark mt-1">{label}</div>
      {sub && <div className="text-xs text-desert-stone-dark/80 font-mono mt-0.5">{sub}</div>}
    </div>
  )
}
