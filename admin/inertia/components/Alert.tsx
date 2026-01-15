import * as Icons from '@heroicons/react/24/solid'
import classNames from '~/lib/classNames'

export type AlertProps = React.HTMLAttributes<HTMLDivElement> & {
  title: string
  message?: string
  type: 'warning' | 'error' | 'success' | 'info'
  children?: React.ReactNode
  dismissible?: boolean
  onDismiss?: () => void
  icon?: keyof typeof Icons
  variant?: 'standard' | 'bordered' | 'solid'
}

export default function Alert({
  title,
  message,
  type,
  children,
  dismissible = false,
  onDismiss,
  icon,
  variant = 'standard',
  ...props
}: AlertProps) {
  const getDefaultIcon = (): keyof typeof Icons => {
    switch (type) {
      case 'warning':
        return 'ExclamationTriangleIcon'
      case 'error':
        return 'XCircleIcon'
      case 'success':
        return 'CheckCircleIcon'
      case 'info':
        return 'InformationCircleIcon'
      default:
        return 'InformationCircleIcon'
    }
  }

  const IconComponent = () => {
    const iconName = icon || getDefaultIcon()
    const Icon = Icons[iconName]
    if (!Icon) return null

    return <Icon aria-hidden="true" className={classNames('size-5 shrink-0', getIconColor())} />
  }

  const getIconColor = () => {
    if (variant === 'solid') return 'text-desert-white'
    switch (type) {
      case 'warning':
        return 'text-desert-orange'
      case 'error':
        return 'text-desert-red'
      case 'success':
        return 'text-desert-olive'
      case 'info':
        return 'text-desert-stone'
      default:
        return 'text-desert-stone'
    }
  }

  const getVariantStyles = () => {
    const baseStyles = 'rounded-md transition-all duration-200'
    const variantStyles: string[] = []

    switch (variant) {
      case 'bordered':
        variantStyles.push(
          type === 'warning'
            ? 'border-desert-orange'
            : type === 'error'
              ? 'border-desert-red'
              : type === 'success'
                ? 'border-desert-olive'
                : type === 'info'
                  ? 'border-desert-stone'
                  : ''
        )
        return classNames(baseStyles, 'border-2 bg-desert-white', ...variantStyles)
      case 'solid':
        variantStyles.push(
          type === 'warning'
            ? 'bg-desert-orange text-desert-white border-desert-orange-dark'
            : type === 'error'
              ? 'bg-desert-red text-desert-white border-desert-red-dark'
              : type === 'success'
                ? 'bg-desert-olive text-desert-white border-desert-olive-dark'
                : type === 'info'
                  ? 'bg-desert-green text-desert-white border-desert-green-dark'
                  : ''
        )
        return classNames(baseStyles, 'shadow-sm', ...variantStyles)
      default:
        variantStyles.push(
          type === 'warning'
            ? 'bg-desert-orange-lighter bg-opacity-20 border-desert-orange-light'
            : type === 'error'
              ? 'bg-desert-red-lighter bg-opacity-20 border-desert-red-light'
              : type === 'success'
                ? 'bg-desert-olive-lighter bg-opacity-20 border-desert-olive-light'
                : type === 'info'
                  ? 'bg-desert-green bg-opacity-20 border-desert-green-light'
                  : ''
        )
        return classNames(baseStyles, 'border shadow-sm', ...variantStyles)
    }
  }

  const getTitleColor = () => {
    if (variant === 'solid') return 'text-desert-white'

    switch (type) {
      case 'warning':
        return 'text-desert-orange-dark'
      case 'error':
        return 'text-desert-red-dark'
      case 'success':
        return 'text-desert-olive-dark'
      case 'info':
        return 'text-desert-stone-dark'
      default:
        return 'text-desert-stone-dark'
    }
  }

  const getMessageColor = () => {
    if (variant === 'solid') return 'text-desert-white text-opacity-90'

    switch (type) {
      case 'warning':
        return 'text-desert-orange-dark text-opacity-80'
      case 'error':
        return 'text-desert-red-dark text-opacity-80'
      case 'success':
        return 'text-desert-olive-dark text-opacity-80'
      case 'info':
        return 'text-desert-stone-dark text-opacity-80'
      default:
        return 'text-desert-stone-dark text-opacity-80'
    }
  }

  const getCloseButtonStyles = () => {
    if (variant === 'solid') {
      return 'text-desert-white hover:text-desert-white hover:bg-black hover:bg-opacity-20'
    }

    switch (type) {
      case 'warning':
        return 'text-desert-orange hover:text-desert-orange-dark hover:bg-desert-orange-lighter hover:bg-opacity-30'
      case 'error':
        return 'text-desert-red hover:text-desert-red-dark hover:bg-desert-red-lighter hover:bg-opacity-30'
      case 'success':
        return 'text-desert-olive hover:text-desert-olive-dark hover:bg-desert-olive-lighter hover:bg-opacity-30'
      case 'info':
        return 'text-desert-stone hover:text-desert-stone-dark hover:bg-desert-stone-lighter hover:bg-opacity-30'
      default:
        return 'text-desert-stone hover:text-desert-stone-dark hover:bg-desert-stone-lighter hover:bg-opacity-30'
    }
  }

  return (
    <div {...props} className={classNames(getVariantStyles(), 'p-4', props.className)} role="alert">
      <div className="flex gap-3">
        <IconComponent />

        <div className="flex-1 min-w-0">
          <h3 className={classNames('text-sm font-semibold', getTitleColor())}>{title}</h3>
          {message && (
            <div className={classNames('mt-1 text-sm', getMessageColor())}>
              <p>{message}</p>
            </div>
          )}
          {children && <div className="mt-3">{children}</div>}
        </div>

        {dismissible && (
          <button
            type="button"
            onClick={onDismiss}
            className={classNames(
              'shrink-0 rounded-md p-1.5 transition-colors duration-150',
              getCloseButtonStyles(),
              'focus:outline-none focus:ring-2 focus:ring-offset-2',
              type === 'warning' ? 'focus:ring-desert-orange' : '',
              type === 'error' ? 'focus:ring-desert-red' : '',
              type === 'success' ? 'focus:ring-desert-olive' : '',
              type === 'info' ? 'focus:ring-desert-stone' : ''
            )}
            aria-label="Dismiss alert"
          >
            <Icons.XMarkIcon className="size-5" />
          </button>
        )}
      </div>
    </div>
  )
}
