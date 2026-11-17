import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Layer, Marker, Source } from 'react-map-gl/maplibre'
import { ELEVATION_PROFILE_API, type ElevationProfileLookup, type ElevationProfileSample } from '../../../types/world_offline.js'
import { ELEVATION_SETTINGS_LINK, type MapPoint } from './ElevationInspection'

type Profile = Extract<ElevationProfileLookup, { status: 'ok' }>
type ProfileResult = ElevationProfileLookup | { status: 'loading' | 'error' }
type ProfileState =
  | { a: null; b: null; result: null }
  | { a: MapPoint; b: null; result: null }
  | { a: MapPoint; b: MapPoint; result: ProfileResult }

const INITIAL: ProfileState = { a: null, b: null, result: null }
const PROFILE_TIMEOUT_MS = 25_000
const CHART_WIDTH = 600
const CHART_HEIGHT = 150
const METER_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 0 })
const KM_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 3 })

function distanceText(meters: number) {
  return KM_FORMAT.format(meters / 1_000) + ' km'
}

function heightText(meters: number | null) {
  return meters === null ? 'No data' : METER_FORMAT.format(Math.round(meters) || 0) + ' m'
}

function readProfile(value: unknown): ElevationProfileLookup {
  const profile = value as ElevationProfileLookup
  if (profile?.status === 'not-installed' || profile?.status === 'no-data') return profile
  if (profile?.status === 'ok' && Number.isFinite(profile.distanceMeters) && profile.distanceMeters >= 0 &&
    Number.isFinite(profile.stepMeters) && profile.stepMeters >= 0 && Array.isArray(profile.samples) && profile.samples.length > 0 &&
    profile.samples.every((sample) => sample && Number.isFinite(sample.lat) && Number.isFinite(sample.lng) &&
      Number.isFinite(sample.distanceMeters) && (sample.elevationMeters === null || Number.isFinite(sample.elevationMeters)))) {
    return profile.samples.some((sample) => sample.elevationMeters !== null) ? profile : { status: 'no-data' }
  }
  throw new Error('Invalid elevation profile response')
}

export function useElevationProfile() {
  const [state, setState] = useState<ProfileState>(INITIAL)
  const [sampleIndex, setSampleIndex] = useState<number | null>(null)
  const [samePoint, setSamePoint] = useState(false)
  const pending = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    const previous = pending.current
    pending.current = null
    previous?.abort()
  }, [])

  const clear = useCallback(() => {
    cancel()
    setState(INITIAL)
    setSampleIndex(null)
    setSamePoint(false)
  }, [cancel])

  useEffect(() => cancel, [cancel])

  const request = useCallback(async (a: MapPoint, b: MapPoint) => {
    cancel()
    const controller = new AbortController()
    pending.current = controller
    setState({ a, b, result: { status: 'loading' } })
    setSampleIndex(null)
    const params = new URLSearchParams({
      latA: String(a.lat), lngA: String(a.lng), latB: String(b.lat), lngB: String(b.lng),
    })
    const timer = window.setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS)
    try {
      const response = await fetch(ELEVATION_PROFILE_API + '?' + params, { signal: controller.signal, cache: 'no-store' })
      if (!response.ok) throw new Error('Elevation profile failed')
      const result = readProfile(await response.json())
      if (pending.current === controller) setState({ a, b, result })
    } catch {
      if (pending.current === controller) setState({ a, b, result: { status: 'error' } })
    } finally {
      window.clearTimeout(timer)
      if (pending.current === controller) pending.current = null
    }
  }, [cancel])

  const select = useCallback((point: MapPoint) => {
    if (state.b) return
    if (!state.a) {
      setState({ a: point, b: null, result: null })
      return
    }
    if (state.a.lat === point.lat && state.a.lng === point.lng) {
      setSamePoint(true)
      return
    }
    setSamePoint(false)
    void request(state.a, point)
  }, [request, state.a, state.b])

  const retry = () => {
    if (state.a && state.b) void request(state.a, state.b)
  }

  return { state, samePoint, select, retry, clear, sampleIndex, setSampleIndex }
}

// Split the line at ±180° so a profile across the date line follows the shorter arc on the map.
function splitLine(points: MapPoint[]) {
  const segments: number[][][] = []
  let segment: number[][] = [[points[0].lng, points[0].lat]]
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1]
    const point = points[i]
    const delta = point.lng - before.lng
    if (Math.abs(delta) > 180) {
      const edge = delta > 0 ? -180 : 180
      const wrapped = point.lng - Math.sign(delta) * 360
      const ratio = wrapped === before.lng ? 1 : (edge - before.lng) / (wrapped - before.lng)
      const latitude = before.lat + (point.lat - before.lat) * ratio
      segment.push([edge, latitude])
      segments.push(segment)
      segment = [[-edge, latitude]]
    }
    segment.push([point.lng, point.lat])
  }
  segments.push(segment)
  return segments
}

export function ElevationProfileMap({ state, sampleIndex }: {
  state: ProfileState
  sampleIndex: number | null
}) {
  const { a, b, result } = state
  const samples = result?.status === 'ok' ? result.samples : undefined
  const line = useMemo(() => {
    if (!a || !b) return null
    const points = samples && samples.length > 1 ? samples : [a, b]
    return {
      type: 'Feature' as const, properties: {},
      geometry: { type: 'MultiLineString' as const, coordinates: splitLine(points) },
    }
  }, [a, b, samples])
  const selected = sampleIndex === null ? undefined : samples?.[sampleIndex]
  return (
    <>
      {line && (
        <Source id="nomad-elevation-profile" type="geojson" data={line}>
          <Layer id="nomad-elevation-profile-outline" type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#fff', 'line-width': 5, 'line-opacity': 0.92 }} />
          <Layer id="nomad-elevation-profile-line" type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#a44513', 'line-width': 3 }} />
        </Source>
      )}
      {([{ point: a, label: 'A' }, { point: b, label: 'B' }] as const).map(({ point, label }) => point && (
        <Marker key={label} longitude={point.lng} latitude={point.lat} anchor="center">
          <span aria-label={'Profile point ' + label}
            className="pointer-events-none grid size-6 place-items-center rounded-full border-2 border-white bg-[#a44513] font-sans text-xs font-bold leading-none text-white shadow">
            {label}
          </span>
        </Marker>
      ))}
      {selected && (
        <Marker longitude={selected.lng} latitude={selected.lat} anchor="center">
          <span aria-hidden="true" data-profile-map-sample=""
            className="pointer-events-none block size-8 rounded-full border-2 border-[#a44513] ring-2 ring-white shadow" />
        </Marker>
      )}
    </>
  )
}

function ProfileChart({ profile, sampleIndex, onSample }: {
  profile: Profile
  sampleIndex: number | null
  onSample: (index: number | null) => void
}) {
  const sliderRef = useRef<HTMLInputElement>(null)
  const { samples, distanceMeters, stepMeters } = profile
  const elevations = samples.flatMap((sample) => sample.elevationMeters === null ? [] : [sample.elevationMeters])
  const low = Math.min(...elevations)
  const high = Math.max(...elevations)
  const padding = Math.max((high - low) * 0.08, 5)
  const bottom = low - padding
  const top = high + padding
  const x = (distance: number) => distanceMeters ? (distance / distanceMeters) * CHART_WIDTH : 0
  const y = (height: number) => CHART_HEIGHT - (height - bottom) / (top - bottom) * CHART_HEIGHT
  const runs: Array<Array<[number, number]>> = []
  let run: Array<[number, number]> = []
  for (const sample of samples) {
    if (sample.elevationMeters === null) {
      if (run.length) runs.push(run)
      run = []
    } else {
      run.push([x(sample.distanceMeters), y(sample.elevationMeters)])
    }
  }
  if (run.length) runs.push(run)

  const selected = samples[sampleIndex ?? 0]
  const describedSample = (sample: ElevationProfileSample) => distanceText(sample.distanceMeters) + ' from A · ' + heightText(sample.elevationMeters)
  const stats = [
    ['Point A', heightText(samples[0].elevationMeters)],
    ['Point B', heightText(samples[samples.length - 1].elevationMeters)],
    ['Lowest', heightText(low)], ['Highest', heightText(high)],
  ]

  const handlePointer = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const distance = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * distanceMeters
    const nearest = samples.reduce((best, sample, i) => (
      Math.abs(sample.distanceMeters - distance) < Math.abs(samples[best].distanceMeters - distance) ? i : best
    ), 0)
    onSample(nearest)
  }

  return (
    <>
      <div className="flex flex-wrap gap-x-2 text-xs text-text-secondary">
        <span>Straight-line distance {distanceText(distanceMeters)}</span>
        {stepMeters > 0 && <span>· Samples ≈ {heightText(stepMeters)} apart</span>}
      </div>
      <dl className="grid grid-cols-4 gap-1 rounded-md bg-surface-secondary px-2 py-1.5 text-xs tabular-nums">
        {stats.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-text-secondary">{label}</dt>
            <dd className="font-semibold text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>
      {elevations.length > 0 && (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-[11px] tabular-nums text-text-secondary">
          <div className="flex flex-col justify-between text-right" aria-hidden="true">
            {[top, (top + bottom) / 2, bottom].map((height) => <span key={height}>{heightText(height)}</span>)}
          </div>
          <svg role="img" aria-label="Elevation profile chart"
            aria-description="Elevation in meters by distance in kilometers. Use the sample control to inspect points."
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none"
            className="h-[clamp(5.5rem,19dvh,10rem)] w-full overflow-visible bg-surface-secondary text-desert-orange"
            onPointerDown={handlePointer} onPointerMove={handlePointer}
            onPointerLeave={() => { if (document.activeElement !== sliderRef.current) onSample(null) }}>
            {[0, CHART_HEIGHT / 2, CHART_HEIGHT].map((height) => (
              <line key={height} x1="0" x2={CHART_WIDTH} y1={height} y2={height}
                stroke="var(--color-border-default)" vectorEffect="non-scaling-stroke" />
            ))}
            {runs.map((segment) => segment.length === 1 ? (
              <circle key={segment[0][0]} cx={segment[0][0]} cy={segment[0][1]} r="3" fill="currentColor" />
            ) : (
              <polyline key={segment[0][0]} points={segment.map(([sx, sy]) => sx + ',' + sy).join(' ')}
                fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
            {sampleIndex !== null && (
              <line x1={x(selected.distanceMeters)} x2={x(selected.distanceMeters)} y1="0" y2={CHART_HEIGHT}
                stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          <div />
          <div className="flex justify-between pt-1" aria-hidden="true">
            <span>0 km · A</span><span>{distanceText(distanceMeters)} · B</span>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-2 text-xs">
        <label htmlFor="nomad-profile-sample" className="font-medium text-text-primary">Inspect sample</label>
        <input ref={sliderRef} id="nomad-profile-sample" type="range" min={0} max={samples.length - 1} step={1}
          disabled={samples.length <= 1} value={sampleIndex ?? 0} aria-valuetext={describedSample(selected)}
          className="min-h-7 min-w-24 flex-1 accent-desert-orange focus-visible:outline-2 focus-visible:outline-primary"
          onFocus={() => onSample(sampleIndex ?? 0)} onBlur={() => onSample(null)}
          onChange={(event) => onSample(Number(event.currentTarget.value))} />
        <span className="text-text-secondary">{describedSample(selected)}</span>
      </div>
      {samples.some((sample) => sample.elevationMeters === null) && (
        <p className="text-xs text-text-secondary">Gaps indicate missing elevation data.</p>
      )}
      <a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener noreferrer"
        className="inline-block rounded text-xs text-text-secondary underline underline-offset-2 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-primary">
        Elevation data © Mapterhorn
      </a>
    </>
  )
}

const controlClass = 'inline-flex min-h-8 items-center rounded px-2 text-xs font-semibold hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-primary'

export function ElevationProfilePanel({ state, samePoint, sampleIndex, onSample, onUseCenter, onClear, onClose, onRetry }: {
  state: ProfileState
  samePoint: boolean
  sampleIndex: number | null
  onSample: (index: number | null) => void
  onUseCenter: () => void
  onClear: () => void
  onClose: () => void
  onRetry: () => void
}) {
  const { a, b, result } = state
  const point = a ? 'B' : 'A'
  return (
    <section aria-label="Elevation profile"
      className="absolute bottom-14 left-3 right-3 z-[4] max-h-[calc(100dvh-10rem)] max-w-[37rem] space-y-2 overflow-y-auto overscroll-contain rounded-lg border border-border-subtle bg-surface-primary px-3 py-2 text-text-primary shadow-lg">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-2">
        <h2 className="text-sm font-semibold">Elevation profile A–B</h2>
        <div className="flex items-center gap-1">
          {a && <button type="button" onClick={onClear} className={controlClass}>New line</button>}
          <button type="button" aria-label="Close elevation profile" onClick={onClose} className={controlClass}>Done</button>
        </div>
      </div>
      {!b && (
        <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs">
          <p role="status">{samePoint ? 'Choose a different location for point B.' : 'Click the map to set point ' + point + '.'}</p>
          <button type="button" onClick={onUseCenter} className={controlClass}>Use map center</button>
        </div>
      )}
      {result?.status === 'loading' && <p role="status" className="text-sm text-text-secondary">Sampling elevations…</p>}
      {result?.status === 'no-data' && <p role="status" className="text-sm">No elevation data along this line.</p>}
      {result?.status === 'not-installed' && (
        <>
          <p role="status" className="text-sm">Elevation data is not installed.</p>
          <a href={ELEVATION_SETTINGS_LINK} className="inline-flex min-h-8 items-center rounded text-sm font-semibold text-desert-orange underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary">
            Download elevation data
          </a>
        </>
      )}
      {result?.status === 'error' && (
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          <p role="alert" className="text-sm">Could not load the elevation profile.</p>
          <button type="button" className={controlClass} onClick={onRetry}>Retry</button>
        </div>
      )}
      {result?.status === 'ok' && <ProfileChart profile={result} sampleIndex={sampleIndex} onSample={onSample} />}
    </section>
  )
}
