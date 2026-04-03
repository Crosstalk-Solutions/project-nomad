import { IconMapPinFilled } from '@tabler/icons-react'

interface MarkerPinProps {
  color?: string
  active?: boolean
}

export default function MarkerPin({ color = '#a84a12', active = false }: MarkerPinProps) {
  return (
    <div className="cursor-pointer" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}>
      <IconMapPinFilled
        size={active ? 36 : 32}
        style={{ color }}
      />
    </div>
  )
}
