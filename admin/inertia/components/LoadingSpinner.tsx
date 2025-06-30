interface LoadingSpinnerProps {
  text?: string
  fullscreen?: boolean
  iconOnly?: boolean
  light?: boolean
  className?: string
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  text,
  fullscreen = true,
  iconOnly = false,
  light = false,
  className,
}) => {
  if (!fullscreen) {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`}>
        <div
          className={`w-8 h-8 border-[3px] ${light ? 'border-white' : 'border-slate-400'} border-t-transparent rounded-full animate-spin`}
        ></div>
        {!iconOnly && (
          <div className={light ? 'text-white mt-2' : 'text-slate-800 mt-2'}>
            {text || 'Loading...'}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="ui active inverted dimmer">
        <div className="ui text loader">{!iconOnly && <span>{text || 'Loading'}</span>}</div>
      </div>
    </div>
  )
}

export default LoadingSpinner
