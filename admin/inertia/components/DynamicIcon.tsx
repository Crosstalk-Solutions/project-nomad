import classNames from 'classnames'
import * as TablerIcons from '@tabler/icons-react'

export type DynamicIconName = keyof typeof TablerIcons

interface DynamicIconProps {
  icon?: DynamicIconName
  className?: string
  stroke?: number
  onClick?: () => void
}

/**
 * Renders a dynamic icon from the TablerIcons library based on the provided icon name.
 * @param icon - The name of the icon to render.
 * @param className - Optional additional CSS classes to apply to the icon.
 * @param stroke - Optional stroke width for the icon.
 * @returns A React element representing the icon, or null if no matching icon is found.
 */
const DynamicIcon: React.FC<DynamicIconProps> = ({ icon, className, stroke, onClick }) => {
  if (!icon) return null

  const Icon = TablerIcons[icon]

  if (!Icon) {
    console.warn(`Icon "${icon}" not found in TablerIcons.`)
    return null
  }

  return (
    // @ts-ignore
    <Icon className={classNames('h-5 w-5', className)} stroke={stroke || 2} onClick={onClick} />
  )
}

export default DynamicIcon
