interface SparklineProps {
  data: number[]
  height?: number
  /** Fixed y-axis max; when unset the sparkline auto-scales to the data. */
  max?: number
  fill?: boolean
  /** Tailwind text-color class drives both stroke and fill via currentColor. */
  className?: string
}

/**
 * Minimal self-contained SVG sparkline (no chart library). Colour comes from the
 * parent's text color so it inherits the desert palette.
 */
export default function Sparkline({ data, height = 48, max, fill = true, className = 'text-desert-green' }: SparklineProps) {
  const width = 240
  const hi = Math.max(max ?? 0, ...data, 1)

  let line = ''
  if (data.length >= 2) {
    line = data
      .map((v, i) => {
        const x = (i / (data.length - 1)) * width
        const y = height - (Math.min(Math.max(v, 0), hi) / hi) * height
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-hidden="true"
    >
      {fill && line && (
        <path d={`${line} L${width} ${height} L0 ${height} Z`} className="fill-current opacity-10" stroke="none" />
      )}
      {line && (
        <path
          d={line}
          fill="none"
          className="stroke-current"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}
