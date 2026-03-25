import { IconCircleCheck, IconCircleX } from '@tabler/icons-react'
import classNames from '~/lib/classNames'
import { useTranslation } from 'react-i18next'

export type InstallActivityFeedProps = {
  activity: Array<{
    service_name: string
    type:
      | 'initializing'
      | 'pulling'
      | 'pulled'
      | 'creating'
      | 'created'
      | 'preinstall'
      | 'preinstall-complete'
      | 'starting'
      | 'started'
      | 'finalizing'
      | 'completed'
      | 'update-pulling'
      | 'update-stopping'
      | 'update-creating'
      | 'update-starting'
      | 'update-complete'
      | 'update-rollback'
    timestamp: string
    message: string
  }>
  className?: string
  withHeader?: boolean
}

const InstallActivityFeed: React.FC<InstallActivityFeedProps> = ({ activity, className, withHeader = false }) => {
  const { t } = useTranslation()
  return (
    <div className={classNames('bg-surface-primary shadow-sm rounded-lg p-6', className)}>
      {withHeader && <h2 className="text-lg font-semibold text-text-primary">{t('common.installationActivity')}</h2>}
      <ul role="list" className={classNames("space-y-6 text-desert-green", withHeader ? 'mt-6' : '')}>
        {activity.map((activityItem, activityItemIdx) => (
          <li key={activityItem.timestamp} className="relative flex gap-x-4">
            <div
              className={classNames(
                activityItemIdx === activity.length - 1 ? 'h-6' : '-bottom-6',
                'absolute left-0 top-0 flex w-6 justify-center'
              )}
            >
              <div className="w-px bg-border-subtle" />
            </div>
            <>
              <div className="relative flex size-6 flex-none items-center justify-center bg-transparent">
                {activityItem.type === 'completed' || activityItem.type === 'update-complete' ? (
                  <IconCircleCheck aria-hidden="true" className="size-6 text-indigo-600" />
                ) : activityItem.type === 'update-rollback' ? (
                  <IconCircleX aria-hidden="true" className="size-6 text-red-500" />
                ) : (
                  <div className="size-1.5 rounded-full bg-surface-secondary ring-1 ring-border-default" />
                )}
              </div>
              <p className="flex-auto py-0.5 text-xs/5 text-text-muted">
                <span className="font-semibold text-text-primary">{activityItem.service_name}</span> -{' '}
                {activityItem.type.charAt(0).toUpperCase() + activityItem.type.slice(1)}
              </p>
              <time
                dateTime={activityItem.timestamp}
                className="flex-none py-0.5 text-xs/5 text-text-muted"
              >
                {activityItem.timestamp}
              </time>
            </>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default InstallActivityFeed
