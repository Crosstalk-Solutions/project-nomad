import { ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/24/solid'
import { IconCircleCheck } from '@tabler/icons-react'
import classNames from '~/lib/classNames'

export type AlertProps = React.HTMLAttributes<HTMLDivElement> & {
  title: string
  message?: string
  type: 'warning' | 'error' | 'success'
  children?: React.ReactNode
}

export default function Alert({ title, message, type, children, ...props }: AlertProps) {
  const getIcon = () => {
    const Icon =
      type === 'warning'
        ? ExclamationTriangleIcon
        : type === 'error'
          ? XCircleIcon
          : IconCircleCheck
    const color =
      type === 'warning' ? 'text-yellow-400' : type === 'error' ? 'text-red-400' : 'text-green-400'

    return <Icon aria-hidden="true" className={`size-5 ${color}`} />
  }

  const getBackground = () => {
    return type === 'warning' ? 'bg-yellow-100' : type === 'error' ? 'bg-red-50' : 'bg-green-50'
  }

  const getTextColor = () => {
    return type === 'warning'
      ? 'text-yellow-800'
      : type === 'error'
        ? 'text-red-800'
        : 'text-green-800'
  }

  return (
    <div
      {...props}
      className={classNames(
        getBackground(),
        props.className,
        'border border-gray-200 rounded-md p-3 shadow-xs'
      )}
    >
      <div className="flex flex-row justify-between items-center">
        <div className="flex flex-row">
          <div className="shrink-0">{getIcon()}</div>
          <div className="ml-3">
            <h3 className={`text-sm font-medium ${getTextColor()}`}>{title}</h3>
            {message && (
              <div className={`mt-2 text-sm ${getTextColor()}`}>
                <p>{message}</p>
              </div>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
