import { useEffect, useRef, useState } from 'react'
import { IconCpu, IconServer, IconRobot, IconTemperature, IconDatabase, IconChartBar } from '@tabler/icons-react'
import StageRail from './StageRail'
import CoreGrid from './CoreGrid'
import Sparkline from './Sparkline'
import LiveReadout from './LiveReadout'
import type { BenchmarkRunHook } from '~/hooks/useBenchmarkRun'
import type { BenchmarkStatus } from '../../../types/benchmark'

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

function StageHero({ run }: { run: BenchmarkRunHook }) {
  const status = run.status
  const heroCard = 'bg-desert-white rounded-lg p-6 border border-desert-stone-light h-full min-h-[240px] flex flex-col'
  const title = 'text-sm font-semibold text-desert-green uppercase tracking-wide mb-4 flex items-center gap-2'

  if (status === 'running_ai') {
    return (
      <div className={heroCard}>
        <div className={title}><IconRobot className="w-4 h-4" /> AI Inference</div>
        <div className="flex-1 flex flex-col justify-center gap-4">
          <LiveReadout
            value={run.aiTokensPerSec}
            unit="tok/s"
            label="Tokens per Second"
            size="lg"
            sub={run.aiTtftMs !== null ? `First token in ${Math.round(run.aiTtftMs)} ms` : 'Waiting for first token...'}
          />
          <div className="text-desert-green">
            <Sparkline data={run.aiTokHistory} height={64} />
          </div>
        </div>
      </div>
    )
  }

  if (status === 'running_disk_read' || status === 'running_disk_write') {
    const isRead = status === 'running_disk_read'
    return (
      <div className={heroCard}>
        <div className={title}><IconServer className="w-4 h-4" /> {isRead ? 'Disk Read' : 'Disk Write'}</div>
        <div className="flex-1 flex flex-col justify-center gap-4">
          <LiveReadout
            value={isRead ? run.diskReadMbs : run.diskWriteMbs}
            unit="MB/s"
            label="System disk activity"
            size="lg"
          />
          <div className="text-desert-olive">
            <Sparkline data={isRead ? run.diskReadHistory : run.diskWriteHistory} height={64} />
          </div>
        </div>
      </div>
    )
  }

  if (status === 'calculating_score') {
    return (
      <div className={heroCard}>
        <div className={title}><IconChartBar className="w-4 h-4" /> Compiling Report</div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-desert-green">
            <div className="animate-spin h-6 w-6 border-2 border-desert-green border-t-transparent rounded-full" />
            <span className="text-lg font-medium">Calculating your NOMAD Score...</span>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'detecting_hardware' || status === 'starting' || status === null) {
    return (
      <div className={heroCard}>
        <div className={title}><IconCpu className="w-4 h-4" /> Identifying Hardware</div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-desert-stone-dark">
            <div className="animate-spin h-6 w-6 border-2 border-desert-green border-t-transparent rounded-full" />
            <span className="text-lg font-medium">Detecting your system...</span>
          </div>
        </div>
      </div>
    )
  }

  // CPU + memory stages: the core grid is the centrepiece.
  return (
    <div className={heroCard}>
      <div className={title}>
        <IconCpu className="w-4 h-4" /> {status === 'running_memory' ? 'Memory Throughput' : 'CPU Load'}
      </div>
      <div className="flex-1 flex flex-col justify-center">
        <CoreGrid loads={run.perCore} />
      </div>
    </div>
  )
}

/** Always-on host vitals, so something is moving between and during stages. */
function VitalsStrip({ run }: { run: BenchmarkRunHook }) {
  const card = 'bg-desert-white rounded-lg p-4 border border-desert-stone-light'
  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-center gap-2 text-xs font-semibold text-desert-stone-dark uppercase tracking-wide mb-2">
          <IconCpu className="w-4 h-4" /> CPU Load
        </div>
        <LiveReadout value={run.cpuOverall} unit="%" label="Overall" />
        <div className="text-desert-green mt-2">
          <Sparkline data={run.cpuHistory} height={36} max={100} />
        </div>
      </div>

      {run.tempC !== null && (
        <div className={card}>
          <div className="flex items-center gap-2 text-xs font-semibold text-desert-stone-dark uppercase tracking-wide mb-2">
            <IconTemperature className="w-4 h-4" /> Temperature
          </div>
          <LiveReadout value={run.tempC} unit="°C" label="CPU package" />
        </div>
      )}

      <div className={card}>
        <div className="flex items-center gap-2 text-xs font-semibold text-desert-stone-dark uppercase tracking-wide mb-2">
          <IconDatabase className="w-4 h-4" /> Disk
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LiveReadout value={run.diskReadMbs} unit="MB/s" label="Read" />
          <LiveReadout value={run.diskWriteMbs} unit="MB/s" label="Write" />
        </div>
      </div>
    </div>
  )
}

export default function BenchmarkRunView({ run }: { run: BenchmarkRunHook }) {
  // Elapsed clock, driven locally so it ticks even between telemetry frames.
  const startedAt = useRef<number>(Date.now())
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const activeStatus: BenchmarkStatus | null = run.status

  return (
    <div className="space-y-6">
      <StageRail
        stages={run.stages}
        stageIndex={run.stageIndex}
        status={activeStatus}
        progressPercent={run.progressPercent}
        message={run.message || 'Running benchmark...'}
        elapsedLabel={formatElapsed(Date.now() - startedAt.current)}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <StageHero run={run} />
        </div>
        <VitalsStrip run={run} />
      </div>
    </div>
  )
}
