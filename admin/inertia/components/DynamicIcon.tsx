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

  let Icon = icons[icon]

  // A name outside the registry can still arrive from data (e.g. a Custom App icon set
  // via the API). Show a generic box rather than an empty hole where the icon should be.
  if (!Icon) {
    console.warn(`Icon "${icon}" not found in icon map.`)
    Icon = icons.IconBox
  }

  return <Icon className={classNames('h-5 w-5', className)} strokeWidth={stroke ?? 2} onClick={onClick} />
}

export default DynamicIcon
