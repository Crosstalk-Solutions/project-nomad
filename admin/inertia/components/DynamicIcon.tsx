import classNames from 'classnames'
import { icons } from '../lib/icons'

export type { DynamicIconName } from '../lib/icons'

interface DynamicIconProps {
  icon?: keyof typeof icons
  className?: string
  stroke?: number
  onClick?: () => void
}

const DynamicIcon: React.FC<DynamicIconProps> = ({ icon, className, stroke, onClick }) => {
  if (!icon) return null

  const Icon = icons[icon]

  if (!Icon) {
    console.warn(`Icon "${icon}" not found in icon map.`)
    return null
  }

  return <Icon className={classNames('h-5 w-5', className)} strokeWidth={stroke ?? 2} onClick={onClick} />
}

export default DynamicIcon
