import { IconInfoCircle } from '@tabler/icons-react'
import { useState } from 'react'

interface InfoTooltipProps {
  text: string
  className?: string
  // Which side of the icon the tooltip pops toward. Defaults to 'top' (existing behavior);
  // use 'bottom' when the icon sits near the top of the viewport so it isn't clipped.
  position?: 'top' | 'bottom'
  // Horizontal anchoring. 'center' (default) centers the bubble on the icon. Use 'right' when
  // the icon sits near the right edge so the bubble expands leftward into open space instead of
  // being squeezed against the viewport edge (which forces one-word-per-line wrapping).
  align?: 'center' | 'right'
}

export default function InfoTooltip({
  text,
  className = '',
  position = 'top',
  align = 'center',
}: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        className="text-desert-stone-dark hover:text-desert-green transition-colors p-0.5"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        aria-label="More information"
      >
        <IconInfoCircle className="w-4 h-4" />
      </button>
      {isVisible && (
        <div
          className={`absolute z-50 ${position === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'} ${
            align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'
          }`}
        >
          <div
            className={`bg-desert-stone-dark text-white text-xs rounded-lg px-3 py-2 whitespace-normal shadow-lg ${
              align === 'right' ? 'w-64' : 'max-w-xs'
            }`}
          >
            {text}
            <div
              className={`absolute border-4 border-transparent ${
                position === 'bottom'
                  ? 'bottom-full border-b-desert-stone-dark'
                  : 'top-full border-t-desert-stone-dark'
              } ${align === 'right' ? 'right-3' : 'left-1/2 -translate-x-1/2'}`}
            />
          </div>
        </div>
      )}
    </span>
  )
}
