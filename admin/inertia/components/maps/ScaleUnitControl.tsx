type ScaleUnit = 'imperial' | 'metric'

type ScaleUnitControlProps = {
  scaleUnit: ScaleUnit
  onChange: (unit: ScaleUnit) => void
}

export default function ScaleUnitControl({ scaleUnit, onChange }: ScaleUnitControlProps) {
  return (
    <div style={{ position: 'absolute', bottom: '30px', left: '10px', zIndex: 2 }}>
      <div
        style={{
          display: 'inline-flex',
          borderRadius: '4px',
          boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
          overflow: 'hidden',
          fontSize: '11px',
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (scaleUnit !== 'metric') onChange('metric')
          }}
          style={{
            background: scaleUnit === 'metric' ? '#424420' : 'white',
            color: scaleUnit === 'metric' ? 'white' : '#666',
            border: 'none',
            padding: '4px 8px',
            cursor: 'pointer',
          }}
        >
          Metric
        </button>

        <button
          type="button"
          onClick={() => {
            if (scaleUnit !== 'imperial') onChange('imperial')
          }}
          style={{
            background: scaleUnit === 'imperial' ? '#424420' : 'white',
            color: scaleUnit === 'imperial' ? 'white' : '#666',
            border: 'none',
            padding: '4px 8px',
            cursor: 'pointer',
          }}
        >
          Imperial
        </button>
      </div>
    </div>
  )
}
