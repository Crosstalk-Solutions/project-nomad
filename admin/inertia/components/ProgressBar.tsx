import { useTranslation } from 'react-i18next'

const ProgressBar = ({ progress, speed }: { progress: number; speed?: string }) => {
  const { t } = useTranslation()
  if (progress >= 100) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-desert-green">{t('common.downloadComplete')}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="relative w-full h-2 bg-border-subtle rounded">
        <div
          className="absolute top-0 left-0 h-full bg-desert-green rounded"
          style={{ width: `${progress}%` }}
        />
      </div>
      {speed && (
        <div className="mt-1 text-sm text-text-muted">
          {t('common.estSpeed', { speed })}
        </div>
      )}
    </div>
  )
}

export default ProgressBar
