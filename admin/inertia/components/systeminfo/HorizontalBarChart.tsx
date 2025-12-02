import classNames from '~/lib/classNames'

interface HorizontalBarChartProps {
  items: Array<{
    label: string
    value: number // percentage
    total: string
    used: string
    type?: string
  }>
  maxValue?: number
}

export default function HorizontalBarChart({ items, maxValue = 100 }: HorizontalBarChartProps) {
  const getBarColor = (value: number) => {
    if (value >= 90) return 'bg-desert-red'
    if (value >= 75) return 'bg-desert-orange'
    if (value >= 50) return 'bg-desert-tan'
    return 'bg-desert-olive'
  }

  const getGlowColor = (value: number) => {
    if (value >= 90) return 'shadow-desert-red/50'
    if (value >= 75) return 'shadow-desert-orange/50'
    if (value >= 50) return 'shadow-desert-tan/50'
    return 'shadow-desert-olive/50'
  }

  return (
    <div className="space-y-6">
      {items.map((item, index) => (
        <div key={index} className="space-y-2">
          <div className="flex justify-between items-baseline">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-desert-green">{item.label}</span>
              {item.type && (
                <span className="text-xs px-2 py-0.5 rounded bg-desert-stone-lighter text-desert-stone-dark font-mono">
                  {item.type}
                </span>
              )}
            </div>
            <div className="text-sm text-desert-stone-dark font-mono">
              {item.used} / {item.total}
            </div>
          </div>
          <div className="relative">
            <div className="h-8 bg-desert-green-lighter bg-opacity-20 rounded-lg border border-desert-stone-light overflow-hidden">
              <div
                className={classNames(
                  'h-full rounded-lg transition-all duration-1000 ease-out relative overflow-hidden',
                  getBarColor(item.value),
                  'shadow-lg',
                  getGlowColor(item.value)
                )}
                style={{
                  width: `${item.value}%`,
                  animationDelay: `${index * 100}ms`,
                }}
              >
                {/* Animated shine effect */}
                {/* <div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-20 animate-shimmer"
                  style={{
                    animation: 'shimmer 3s infinite',
                    animationDelay: `${index * 0.5}s`,
                  }}
                /> */}
                {/* <div
                  className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage: `repeating-linear-gradient(
                      90deg,
                      transparent,
                      transparent 10px,
                      rgba(255, 255, 255, 0.1) 10px,
                      rgba(255, 255, 255, 0.1) 11px
                    )`,
                  }}
                /> */}
              </div>
            </div>
            <div
              className={classNames(
                'absolute top-1/2 -translate-y-1/2 font-bold text-sm',
                item.value > 15
                  ? 'left-3 text-desert-white drop-shadow-md'
                  : 'right-3 text-desert-green'
              )}
            >
              {Math.round(item.value)}%
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={classNames(
                'w-2 h-2 rounded-full animate-pulse',
                item.value >= 90
                  ? 'bg-desert-red'
                  : item.value >= 75
                    ? 'bg-desert-orange'
                    : 'bg-desert-olive'
              )}
            />
            <span className="text-xs text-desert-stone">
              {item.value >= 90
                ? 'Critical - Disk Almost Full'
                : item.value >= 75
                  ? 'Warning - Usage High'
                  : 'Normal'}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
