import { useEffect, useState } from 'react'
import classNames from '~/lib/classNames'

interface CircularGaugeProps {
  value: number // percentage
  label: string
  icon?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  variant?: 'cpu' | 'memory' | 'disk' | 'default'
  subtext?: string
  animated?: boolean
}

export default function CircularGauge({
  value,
  label,
  icon,
  size = 'md',
  variant = 'default',
  subtext,
  animated = true,
}: CircularGaugeProps) {
  const [animatedValue, setAnimatedValue] = useState(animated ? 0 : value)

  useEffect(() => {
    if (animated) {
      const timeout = setTimeout(() => setAnimatedValue(value), 100)
      return () => clearTimeout(timeout)
    }
  }, [value, animated])

  const displayValue = animated ? animatedValue : value

  const sizes = {
    sm: {
      container: 'w-32 h-32',
      strokeWidth: 8,
      radius: 48,
      fontSize: 'text-xl',
      labelSize: 'text-xs',
    },
    md: {
      container: 'w-40 h-40',
      strokeWidth: 10,
      radius: 60,
      fontSize: 'text-2xl',
      labelSize: 'text-sm',
    },
    lg: {
      container: 'w-60 h-60',
      strokeWidth: 12,
      radius: 110,
      fontSize: 'text-4xl',
      labelSize: 'text-base',
    },
  }

  const config = sizes[size]
  const circumference = 2 * Math.PI * config.radius
  const offset = circumference - (displayValue / 100) * circumference

  const getColor = () => {
    if (value >= 90) return 'desert-red'
    if (value >= 75) return 'desert-orange'
    if (value >= 50) return 'desert-tan'
    return 'desert-olive'
  }

  const color = getColor()

  const center = config.radius + config.strokeWidth

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={classNames('relative', config.container)}>
        <svg
          className="transform -rotate-90"
          width={center * 2}
          height={center * 2}
          viewBox={`0 0 ${center * 2} ${center * 2}`}
        >
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={config.radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            className="text-desert-green-lighter opacity-30"
          />

          {/* Progress circle */}
          <circle
            cx={center}
            cy={center}
            r={config.radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={classNames(
              `text-${color}`,
              'transition-all duration-1000 ease-out',
              'drop-shadow-[0_0_1px_currentColor]'
            )}
            style={{
              filter: 'drop-shadow(0 0 1px currentColor)',
            }}
          />

          {/* Tick marks */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180
            const ringGap = 8
            const tickLength = 6
            const innerRadius = config.radius - config.strokeWidth - ringGap
            const outerRadius = config.radius - config.strokeWidth - ringGap - tickLength
            const x1 = center + innerRadius * Math.cos(angle)
            const y1 = center + innerRadius * Math.sin(angle)
            const x2 = center + outerRadius * Math.cos(angle)
            const y2 = center + outerRadius * Math.sin(angle)

            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth="2"
                className="text-desert-stone opacity-30"
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {icon && <div className="text-desert-green opacity-60 mb-1">{icon}</div>}
          <div className={classNames('font-bold text-desert-green', config.fontSize)}>
            {Math.round(displayValue)}%
          </div>
          {subtext && (
            <div className="text-xs text-desert-stone-dark opacity-70 font-mono mt-0.5">
              {subtext}
            </div>
          )}
        </div>
      </div>
      <div className={classNames('font-semibold text-desert-green text-center', config.labelSize)}>
        {label}
      </div>
    </div>
  )
}
