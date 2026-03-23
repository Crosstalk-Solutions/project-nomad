import { useTranslation } from 'react-i18next'
import Alert from './Alert'
import { useDiskAlert } from '~/hooks/useDiskAlert'

export default function DiskAlertBanner() {
  const { t } = useTranslation('common')
  const { diskStatus, shouldShow, dismiss } = useDiskAlert()

  if (!shouldShow || !diskStatus) return null

  const isWarning = diskStatus.level === 'warning'

  return (
    <div className="px-4 pt-4">
      <Alert
        type={isWarning ? 'warning' : 'error'}
        variant="bordered"
        title={isWarning ? t('alerts.diskWarningTitle') : t('alerts.diskCriticalTitle')}
        message={t('alerts.diskMessage', {
          diskName: diskStatus.diskName,
          usage: diskStatus.highestUsage.toFixed(1),
        })}
        dismissible={true}
        onDismiss={dismiss}
      />
    </div>
  )
}
