import * as Icons from '@tabler/icons-react'
import classNames from '~/lib/classNames'
import DynamicIcon from './DynamicIcon'
import StyledButton, { StyledButtonProps } from './StyledButton'

export type AlertProps = React.HTMLAttributes<HTMLDivElement> & {
  title: string
  message?: string
  type: 'warning' | 'error' | 'success' | 'info'
  children?: React.ReactNode
  dismissible?: boolean
  onDismiss?: () => void
  icon?: keyof typeof Icons
  variant?: 'standard' | 'bordered' | 'solid'
  buttonProps?: StyledButtonProps
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
  buttonProps,
  ...props
}: AlertProps) {
  const getDefaultIcon = (): keyof typeof Icons => {
    switch (type) {
      case 'warning':
        return 'IconAlertTriangle'
      case 'error':
        return 'IconXboxX'
      case 'success':
        return 'IconCircleCheck'
      case 'info':
        return 'IconInfoCircle'
      default:
        return 'IconInfoCircle'
    }
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
    const baseStyles = 'rounded-lg transition-all duration-200'
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
        return classNames(baseStyles, 'border-2 bg-desert-white shadow-md', ...variantStyles)
      case 'solid':
        variantStyles.push(
          type === 'warning'
            ? 'bg-desert-orange text-desert-white border border-desert-orange-dark'
            : type === 'error'
              ? 'bg-desert-red text-desert-white border border-desert-red-dark'
              : type === 'success'
                ? 'bg-desert-olive text-desert-white border border-desert-olive-dark'
                : type === 'info'
                  ? 'bg-desert-green text-desert-white border border-desert-green-dark'
                  : ''
        )
        return classNames(baseStyles, 'shadow-lg', ...variantStyles)
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
        return classNames(baseStyles, 'border-l-4 border-y border-r shadow-sm', ...variantStyles)
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
    <div {...props} className={classNames(getVariantStyles(), 'p-5', props.className)} role="alert">
      <div className="flex gap-4 items-center">
        <div className="flex-shrink-0 mt-0.5">
          <DynamicIcon icon={icon || getDefaultIcon()} className={classNames(getIconColor(), 'size-6')} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className={classNames('text-base font-semibold leading-tight', getTitleColor())}>{title}</h3>
          {message && (
            <div className={classNames('mt-2 text-sm leading-relaxed', getMessageColor())}>
              <p>{message}</p>
            </div>
          )}
          {children && <div className="mt-3">{children}</div>}
        </div>

        {buttonProps && (
          <div className="flex-shrink-0 ml-auto">
            <StyledButton {...buttonProps} />
          </div>
        )}

        {dismissible && (
          <button
            type="button"
            onClick={onDismiss}
            className={classNames(
              'flex-shrink-0 rounded-lg p-1.5 transition-all duration-200',
              getCloseButtonStyles(),
              'focus:outline-none focus:ring-2 focus:ring-offset-1',
              type === 'warning' ? 'focus:ring-desert-orange' : '',
              type === 'error' ? 'focus:ring-desert-red' : '',
              type === 'success' ? 'focus:ring-desert-olive' : '',
              type === 'info' ? 'focus:ring-desert-stone' : ''
            )}
            aria-label="Dismiss alert"
          >
            <DynamicIcon icon="IconX" className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
