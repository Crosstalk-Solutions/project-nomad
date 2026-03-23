import Alert from './Alert'
import { useDiskAlert } from '~/hooks/useDiskAlert'

export default function DiskAlertBanner() {
  const { diskStatus, shouldShow, dismiss } = useDiskAlert()

  if (!shouldShow || !diskStatus) return null

  const isWarning = diskStatus.level === 'warning'

  return (
    <div className="px-4 pt-4">
      <Alert
        type={isWarning ? 'warning' : 'error'}
        variant="bordered"
        title={isWarning ? 'Disk Space Running Low' : 'Disk Space Critically Low'}
        message={`Disk "${diskStatus.diskName}" is ${diskStatus.highestUsage.toFixed(1)}% full. Free up space to avoid issues with downloads and services.`}
        dismissible={true}
        onDismiss={dismiss}
      />
    </div>
  )
}
