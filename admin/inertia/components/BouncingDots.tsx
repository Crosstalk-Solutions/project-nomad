import clsx from 'clsx'

interface BouncingDotsProps {
  text: string
  containerClassName?: string
  textClassName?: string
}

export default function BouncingDots({ text, containerClassName, textClassName }: BouncingDotsProps) {
  return (
    <div className={clsx("flex items-center justify-center gap-2", containerClassName)}>
      <span className={clsx("text-gray-600", textClassName)}>{text}</span>
      <span className="flex gap-1 mt-1">
        <span
          className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </span>
    </div>
  )
}
