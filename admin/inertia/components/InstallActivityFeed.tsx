import { CheckCircleIcon } from '@heroicons/react/24/outline'
import classNames from '~/lib/classNames'

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
    timestamp: string
    message: string
  }>
  className?: string
}

const InstallActivityFeed: React.FC<InstallActivityFeedProps> = ({ activity, className }) => {
  return (
    <div className={classNames('bg-white shadow-sm rounded-lg p-6', className)}>
      <h2 className="text-lg font-semibold text-gray-900">Installation Activity</h2>
      <ul role="list" className="mt-6 space-y-6 text-desert-green">
        {activity.map((activityItem, activityItemIdx) => (
          <li key={activityItem.timestamp} className="relative flex gap-x-4">
            <div
              className={classNames(
                activityItemIdx === activity.length - 1 ? 'h-6' : '-bottom-6',
                'absolute left-0 top-0 flex w-6 justify-center'
              )}
            >
              <div className="w-px bg-gray-200" />
            </div>
            <>
              <div className="relative flex size-6 flex-none items-center justify-center bg-transparent">
                {activityItem.type === 'completed' ? (
                  <CheckCircleIcon aria-hidden="true" className="size-6 text-indigo-600" />
                ) : (
                  <div className="size-1.5 rounded-full bg-gray-100 ring-1 ring-gray-300" />
                )}
              </div>
              <p className="flex-auto py-0.5 text-xs/5 text-gray-500">
                <span className="font-semibold text-gray-900">{activityItem.service_name}</span> -{' '}
                {activityItem.type.charAt(0).toUpperCase() + activityItem.type.slice(1)}
              </p>
              <time
                dateTime={activityItem.timestamp}
                className="flex-none py-0.5 text-xs/5 text-gray-500"
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
