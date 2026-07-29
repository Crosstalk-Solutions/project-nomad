import { useEffect, useRef, useState } from 'react'
import { IconChartBar, IconCpu, IconDatabase, IconRobot, IconServer } from '@tabler/icons-react'
import CircularGauge from '~/components/systeminfo/CircularGauge'
import StyledButton from '~/components/StyledButton'
import { getScoreDisplay } from '~/lib/benchmarkScore'
import BenchmarkResult from '#models/benchmark_result'

interface ScoreRevealProps {
  result: BenchmarkResult
  scoreScale?: { max: number; caption: string }
  onDone: () => void
}

// Same thresholds as the NOMAD Score section on the benchmark page.
const getScoreColor = (score: number) => {
  if (score >= 70) return 'text-green-600'
  if (score >= 40) return 'text-yellow-600'
  return 'text-red-600'
}

// AI tokens/sec normalized to 0-100 (30 tok/s = 50, 60 tok/s = 100),
// mirroring the benchmark page's getAIScore.
const getAIScore = (tokensPerSecond: number): number =>
  Math.min(100, Math.max(0, (tokensPerSecond / 60) * 100))

/** rAF count-up from 0 to `target` with ease-out, for the big score number. */
function useCountUp(target: number, durationMs = 1200): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(target * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])
  return value
}

/**
 * End-of-run score reveal. Replaces the abrupt unmount of the live run view
 * with a deliberate report: big NOMAD score gauge + count-up number, then the
 * sub-score gauges cascading in. Dismisses via the Continue button or an
 * auto-dismiss timer.
 */
export default function ScoreReveal({
  result,
  scoreScale = { max: 100, caption: 'out of 100' },
  onDone,
}: ScoreRevealProps) {
  const displayScore = useCountUp(result.nomad_score)
  // A partial (System/AI Only) run is not the NOMAD Score -- relabel + flag it.
  const scoreInfo = getScoreDisplay(result.benchmark_type)

  // Sub-score gauges, mirroring the System Performance / AI Performance grids.
  const gauges: {
    label: string
    value: number
    variant: 'cpu' | 'memory' | 'disk'
    icon: React.ReactNode
  }[] = [
    { label: 'CPU', value: result.cpu_score * 100, variant: 'cpu', icon: <IconCpu className="w-6 h-6" /> },
    { label: 'Memory', value: result.memory_score * 100, variant: 'memory', icon: <IconDatabase className="w-6 h-6" /> },
    { label: 'Disk Read', value: result.disk_read_score * 100, variant: 'disk', icon: <IconServer className="w-6 h-6" /> },
    { label: 'Disk Write', value: result.disk_write_score * 100, variant: 'disk', icon: <IconServer className="w-6 h-6" /> },
  ]
  if (result.ai_tokens_per_second) {
    gauges.push({
      label: 'AI Score',
      value: getAIScore(result.ai_tokens_per_second),
      variant: 'cpu',
      icon: <IconRobot className="w-6 h-6" />,
    })
  }

  // Cascade: mount one gauge every 150ms; each CircularGauge animates 0→value
  // on mount, so staggered mounts produce the cascade.
  const [visibleCount, setVisibleCount] = useState(0)
  useEffect(() => {
    if (visibleCount >= gauges.length) return
    const id = setTimeout(() => setVisibleCount((n) => n + 1), 150)
    return () => clearTimeout(id)
  }, [visibleCount, gauges.length])

  // Dismiss exactly once, whether via the button or the auto-dismiss timer.
  const doneRef = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const fireDone = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDoneRef.current()
  }
  useEffect(() => {
    const id = setTimeout(fireDone, 5000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      <div className="bg-desert-white rounded-lg border border-desert-stone-light overflow-hidden">
        <div className="bg-desert-olive px-6 py-2 flex items-center gap-2">
          <div className="w-1 h-4 bg-desert-green" />
          <span className="text-xs font-semibold text-white uppercase tracking-wide">Report</span>
          {scoreInfo.isPartial && (
            <span className="ml-auto px-2 py-0.5 rounded-full bg-desert-white/20 text-white text-xs font-semibold uppercase tracking-wide">
              Partial
            </span>
          )}
        </div>

        <div className="p-8">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="shrink-0">
              <CircularGauge
                value={Math.min(100, (result.nomad_score / scoreScale.max) * 100)}
                label={scoreInfo.label}
                size="lg"
                variant="cpu"
                subtext={scoreScale.caption}
                muted={scoreInfo.isPartial}
                icon={<IconChartBar className="w-8 h-8" />}
              />
            </div>
            <div className="flex-1 space-y-4">
              <div
                className={`text-5xl font-bold font-mono tabular-nums ${
                  scoreInfo.isPartial ? 'text-desert-stone-dark' : getScoreColor(result.nomad_score)
                }`}
              >
                {displayScore.toFixed(1)}
              </div>
              <p className="text-desert-stone-dark">
                {scoreInfo.isPartial
                  ? scoreInfo.cta
                  : 'Your NOMAD Score is a weighted composite of all benchmark results.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 mt-8">
            {gauges.slice(0, visibleCount).map((g) => (
              <div
                key={g.label}
                className="bg-desert-white rounded-lg p-4 border border-desert-stone-light"
              >
                <CircularGauge value={g.value} label={g.label} size="md" variant={g.variant} icon={g.icon} />
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-end">
            <StyledButton onClick={fireDone} icon="IconArrowRight">
              Continue
            </StyledButton>
          </div>
        </div>
      </div>
    </div>
  )
}
