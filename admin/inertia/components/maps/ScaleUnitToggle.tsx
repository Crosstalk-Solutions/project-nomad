type ScaleUnit = 'imperial' | 'metric'

type ScaleUnitToggleProps = {
  scaleUnit: ScaleUnit
  onChange: (unit: ScaleUnit) => void
  onMouseEnter?: () => void
}

export default function ScaleUnitToggle({
  scaleUnit,
  onChange,
  onMouseEnter,
}: ScaleUnitToggleProps) {
  return (
    <div
      className="absolute bottom-[30px] left-[10px] z-[2]"
      onMouseEnter={onMouseEnter}
    >
      <div className="inline-flex overflow-hidden rounded text-[11px] font-semibold leading-none shadow-[0_0_0_2px_rgba(0,0,0,0.1)]">
        <button
          type="button"
          onClick={() => onChange('metric')}
          className="border-0 px-2 py-1"
          style={{
            background: scaleUnit === 'metric' ? '#424420' : 'white',
            color: scaleUnit === 'metric' ? 'white' : '#666',
          }}
        >
          Metric
        </button>

        <button
          type="button"
          onClick={() => onChange('imperial')}
          className="border-0 px-2 py-1"
          style={{
            background: scaleUnit === 'imperial' ? '#424420' : 'white',
            color: scaleUnit === 'imperial' ? 'white' : '#666',
          }}
        >
          Imperial
        </button>
      </div>
    </div>
  )
}
