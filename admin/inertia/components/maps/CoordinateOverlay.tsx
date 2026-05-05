type CoordinateOverlayProps = {
  latitude: number
  longitude: number
  x: number
  y: number
}

export default function CoordinateOverlay({
  latitude,
  longitude,
  x,
  y,
}: CoordinateOverlayProps) {
  return (
    <div
      className="pointer-events-none absolute z-[9999] -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-2 py-1 font-mono text-[11px] text-white"
      style={{
        left: x,
        top: y - 36,
      }}
    >
      {latitude.toFixed(6)}, {longitude.toFixed(6)}
    </div>
  )
}
