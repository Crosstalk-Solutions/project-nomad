import { InformationCircleIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'

interface InfoTooltipProps {
  text: string
  className?: string
}

export default function InfoTooltip({ text, className = '' }: InfoTooltipProps) {
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
        <InformationCircleIcon className="w-4 h-4" />
      </button>
      {isVisible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-desert-stone-dark text-white text-xs rounded-lg px-3 py-2 max-w-xs whitespace-normal shadow-lg">
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-desert-stone-dark" />
          </div>
        </div>
      )}
    </span>
  )
}
