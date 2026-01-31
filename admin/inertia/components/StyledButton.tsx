import { useMemo } from 'react'
import clsx from 'clsx'
import DynamicIcon, { DynamicIconName} from './DynamicIcon'
import { IconRefresh } from '@tabler/icons-react'

export interface StyledButtonProps extends React.HTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  icon?: DynamicIconName
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger' | 'action' | 'success' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
}

const StyledButton: React.FC<StyledButtonProps> = ({
  children,
  icon,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  ...props
}) => {
  const isDisabled = useMemo(() => {
    return props.disabled || loading
  }, [props.disabled, loading])

  const getIconSize = () => {
    switch (size) {
      case 'sm':
        return 'h-3.5 w-3.5 mr-1.5'
      case 'lg':
        return 'h-5 w-5 mr-2.5'
      default:
        return 'h-4 w-4 mr-2'
    }
  }

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-2.5 py-1.5 text-xs'
      case 'lg':
        return 'px-4 py-3 text-base'
      default:
        return 'px-3 py-2 text-sm'
    }
  }

  const getVariantClasses = () => {
    const baseTransition = 'transition-all duration-200 ease-in-out'
    const baseHover = 'hover:shadow-md active:scale-[0.98]'

    switch (variant) {
      case 'primary':
        return clsx(
          'bg-desert-green text-desert-white',
          'hover:bg-desert-green-dark hover:shadow-lg',
          'active:bg-desert-green-darker',
          'disabled:bg-desert-green-light disabled:text-desert-stone-light',
          baseTransition,
          baseHover
        )

      case 'secondary':
        return clsx(
          'bg-desert-tan text-desert-white',
          'hover:bg-desert-tan-dark hover:shadow-lg',
          'active:bg-desert-tan-dark',
          'disabled:bg-desert-tan-lighter disabled:text-desert-stone-light',
          baseTransition,
          baseHover
        )

      case 'danger':
        return clsx(
          'bg-desert-red text-desert-white',
          'hover:bg-desert-red-dark hover:shadow-lg',
          'active:bg-desert-red-dark',
          'disabled:bg-desert-red-lighter disabled:text-desert-stone-light',
          baseTransition,
          baseHover
        )

      case 'action':
        return clsx(
          'bg-desert-orange text-desert-white',
          'hover:bg-desert-orange-light hover:shadow-lg',
          'active:bg-desert-orange-dark',
          'disabled:bg-desert-orange-lighter disabled:text-desert-stone-light',
          baseTransition,
          baseHover
        )

      case 'success':
        return clsx(
          'bg-desert-olive text-desert-white',
          'hover:bg-desert-olive-dark hover:shadow-lg',
          'active:bg-desert-olive-dark',
          'disabled:bg-desert-olive-lighter disabled:text-desert-stone-light',
          baseTransition,
          baseHover
        )

      case 'ghost':
        return clsx(
          'bg-transparent text-desert-green',
          'hover:bg-desert-sand hover:text-desert-green-dark',
          'active:bg-desert-green-lighter',
          'disabled:text-desert-stone-light',
          baseTransition
        )

      case 'outline':
        return clsx(
          'bg-transparent border-2 border-desert-green text-desert-green',
          'hover:bg-desert-green hover:text-desert-white hover:border-desert-green-dark',
          'active:bg-desert-green-dark active:border-desert-green-darker',
          'disabled:border-desert-green-lighter disabled:text-desert-stone-light',
          baseTransition,
          baseHover
        )

      default:
        return ''
    }
  }

  const getLoadingSpinner = () => {
    const spinnerSize = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
    return (
      <IconRefresh
        className={clsx(spinnerSize, 'animate-spin')}
      />
    )
  }

  const onClickHandler = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isDisabled) {
      e.preventDefault()
      return
    }
    props.onClick?.(e)
  }

  return (
    <button
      type="button"
      className={clsx(
        fullWidth ? 'flex w-full' : 'inline-flex',
        getSizeClasses(),
        getVariantClasses(),
        isDisabled ? 'pointer-events-none opacity-60' : 'cursor-pointer',
        'items-center justify-center rounded-md font-semibold focus:outline-none focus:ring-2 focus:ring-desert-green-light focus:ring-offset-2 focus:ring-offset-desert-sand disabled:cursor-not-allowed disabled:shadow-none'
      )}
      {...props}
      disabled={isDisabled}
      onClick={onClickHandler}
    >
      {loading ? (
        getLoadingSpinner()
      ) : (
        <>
          {icon && <DynamicIcon icon={icon} className={getIconSize()} />}
          {children}
        </>
      )}
    </button>
  )
}

export default StyledButton
