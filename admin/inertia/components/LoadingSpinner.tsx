import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  if (!fullscreen) {
    return (
      <div className="flex flex-col items-center justify-center">
        <div
          className={`w-8 h-8 border-[3px] ${light ? 'border-white' : 'border-text-muted'} border-t-transparent rounded-full animate-spin ${className || ''}`}
        ></div>
        {!iconOnly && (
          <div className={light ? 'text-white mt-2' : 'text-text-primary mt-2'}>
            {text || t('common.loadingEllipsis')}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="ui active inverted dimmer">
        <div className="ui text loader">{!iconOnly && <span>{text || t('common.loading')}</span>}</div>
      </div>
    </div>
  )
}

export default LoadingSpinner
