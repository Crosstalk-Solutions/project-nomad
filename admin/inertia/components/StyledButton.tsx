import * as Icons from '@heroicons/react/24/outline'
import { useMemo } from 'react'

export interface StyledButtonProps extends React.HTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  // icon should be one of the HeroIcon names, e.g. ArrowTopRightOnSquareIcon
  icon?: keyof typeof Icons
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger' | 'action'
  loading?: boolean
}

const StyledButton: React.FC<StyledButtonProps> = ({
  children,
  icon,
  variant = 'primary',
  loading = false,
  ...props
}) => {
  const isDisabled = useMemo(() => {
    return props.disabled || loading
  }, [props.disabled, loading])

  const IconComponent = () => {
    if (!icon) return null
    const Icon = Icons[icon]
    return Icon ? <Icon className="h-4 w-4 mr-2" /> : null
  }

  const getBgColors = () => {
    // if primary, use desert-green
    if (variant === 'primary') {
      return 'bg-desert-green hover:bg-desert-green-light text-white hover:shadow-lg transition-all duration-200'
    }
    // if secondary, use outlined styles
    if (variant === 'secondary') {
      return 'bg-transparent border border-desert-green text-desert-green hover:bg-desert-green-light'
    }

    // if danger, use red styles
    if (variant === 'danger') {
      return 'bg-red-600 hover:bg-red-700 text-white'
    }

    // if action, use orange styles
    if (variant === 'action') {
      return 'bg-desert-orange hover:bg-desert-orange-light text-white'
    }
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
      className={`block rounded-md ${getBgColors()} px-3 py-2 text-center text-sm font-semibold shadow-sm cursor-pointer disabled:opacity-50 disabled:pointer-events-none`}
      {...props}
      disabled={isDisabled}
      onClick={onClickHandler}
    >
      {loading ? (
        <Icons.EllipsisHorizontalCircleIcon className="h-5 w-5 animate-spin text-white" />
      ) : icon ? (
        <div className="flex flex-row items-center justify-center">
          <IconComponent />
          {children}
        </div>
      ) : (
        children
      )}
    </button>
  )
}

export default StyledButton
