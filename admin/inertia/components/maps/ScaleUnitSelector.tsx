type ScaleUnit = 'imperial' | 'metric'

type ScaleUnitSelectorProps = {
    scaleUnit: ScaleUnit
    onChange: (unit: ScaleUnit) => void
    onMouseEnter?: () => void
}

export default function ScaleUnitSelector({
                                              scaleUnit,
                                              onChange,
                                              onMouseEnter,
                                          }: ScaleUnitSelectorProps) {
    const getButtonStyle = (unit: ScaleUnit) => ({
        background: scaleUnit === unit ? '#424420' : 'white',
        color: scaleUnit === unit ? 'white' : '#666',
        cursor: 'pointer',
    })

    return (
        <div className="absolute bottom-[30px] left-[10px] z-[2]" onMouseEnter={onMouseEnter}>
            <div className="inline-flex overflow-hidden rounded text-[11px] font-semibold leading-none shadow-[0_0_0_2px_rgba(0,0,0,0.1)]">
                <button
                    type="button"
                    onClick={() => {
                        if (scaleUnit !== 'metric') onChange('metric')
                    }}
                    className="border-0 px-2 py-1"
                    style={getButtonStyle('metric')}
                >
                    Metric
                </button>

                <button
                    type="button"
                    onClick={() => {
                        if (scaleUnit !== 'imperial') onChange('imperial')
                    }}
                    className="border-0 px-2 py-1"
                    style={getButtonStyle('imperial')}
                >
                    Imperial
                </button>
            </div>
        </div>
    )
}
