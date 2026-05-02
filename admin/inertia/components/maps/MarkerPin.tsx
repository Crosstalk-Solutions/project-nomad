import { IconCircleFilled } from '@tabler/icons-react'
import * as TablerIcons from '@tabler/icons-react'
import type { IconProps } from '@tabler/icons-react'
import type { ComponentType } from 'react'

import { PIN_COLORS } from '~/hooks/useMapMarkers'
import type { PinColorId } from '~/hooks/useMapMarkers'

interface MarkerPinProps {
  color?: PinColorId | string | null
  customColor?: string | null
  icon?: string | null
  iconColor?: string | null
  visible?: boolean
  active?: boolean
}

const resolvePinColor = (color?: PinColorId | string | null, customColor?: string | null) => {
  if (customColor) return customColor
  if (!color) return '#a84a12'

  const preset = PIN_COLORS.find((pinColor) => pinColor.id === color)
  return preset?.hex ?? color
}

const getContrastingIconColor = (backgroundColor: string) => {
  const hex = backgroundColor.replace('#', '')

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return '#ffffff'
  }

  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255

  const luminance =
    0.2126 * r +
    0.7152 * g +
    0.0722 * b

  return luminance > 0.55 ? '#111827' : '#ffffff'
}

const resolveIcon = (icon?: string | null): ComponentType<IconProps> => {
  if (!icon) return IconCircleFilled

  const Icon = (TablerIcons as Record<string, unknown>)[icon]

  if (!Icon) return IconCircleFilled

  return Icon as ComponentType<IconProps>
}

export default function MarkerPin({
                                    color = 'orange',
                                    customColor,
                                    icon,
                                    iconColor,
                                    visible = true,
                                    active = false,
                                  }: MarkerPinProps) {
  if (!visible) return null

  const resolvedColor = resolvePinColor(color, customColor)
  const resolvedIconColor = iconColor ?? getContrastingIconColor(resolvedColor)
  const Icon = resolveIcon(icon)

  const width = active ? 42 : 36
  const height = active ? 52 : 46
  const iconSize = active ? 18 : 16

  return (
    <div
      className="relative cursor-pointer"
      style={{
        width,
        height,
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox="0 0 36 46"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M18 45 C18 45 4 27.5 4 16.5 C4 7.4 10.3 1 18 1 C25.7 1 32 7.4 32 16.5 C32 27.5 18 45 18 45 Z"
          fill={resolvedColor}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth="1.5"
        />

        <circle cx="18" cy="16.5" r="10.5" fill="rgba(255,255,255,0.18)" />
      </svg>

      <div
        className="pointer-events-none absolute flex items-center justify-center"
        style={{
          left: '50%',
          top: active ? 17 : 15,
          transform: 'translate(-50%, -50%)',
          width: iconSize,
          height: iconSize,
        }}
      >
        <Icon size={iconSize} color={resolvedIconColor} />
      </div>
    </div>
  )
}
