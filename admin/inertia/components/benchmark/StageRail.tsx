import { IconCheck } from '@tabler/icons-react'
import classNames from '~/lib/classNames'
import type { BenchmarkStageDescriptor, BenchmarkStatus } from '../../../types/benchmark'

interface StageRailProps {
  stages: BenchmarkStageDescriptor[]
  stageIndex: number
  status: BenchmarkStatus | null
  progressPercent: number
  message: string
  elapsedLabel: string
}

type NodeState = 'pending' | 'active' | 'complete' | 'error'

export default function StageRail({ stages, stageIndex, status, progressPercent, message, elapsedLabel }: StageRailProps) {
  const done = status === 'completed'
  const pct = done ? 100 : Math.min(100, Math.max(0, progressPercent))

  const stateFor = (i: number): NodeState => {
    if (done || (stageIndex >= 0 && i < stageIndex)) return 'complete'
    if (i === stageIndex) return status === 'error' ? 'error' : 'active'
    return 'pending'
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <div className="flex items-start gap-1 min-w-max pb-1">
          {stages.map((stage, i) => {
            const state = stateFor(i)
            const nodeClass = {
              complete: 'bg-desert-green border-desert-green text-desert-white',
              active: 'border-desert-green text-desert-green animate-pulse',
              error: 'border-desert-red text-desert-red',
              pending: 'border-desert-stone-light text-desert-stone',
            }[state]
            return (
              <div key={stage.status} className="flex items-start">
                <div className="flex flex-col items-center gap-2 w-24">
                  <div
                    className={classNames(
                      'flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors',
                      nodeClass
                    )}
                  >
                    {state === 'complete' ? (
                      <IconCheck className="w-5 h-5" />
                    ) : (
                      <span className="text-xs font-mono font-bold">{i + 1}</span>
                    )}
                  </div>
                  <span
                    className={classNames(
                      'text-[11px] leading-tight text-center',
                      state === 'active' ? 'text-desert-green font-semibold' : 'text-desert-stone-dark'
                    )}
                  >
                    {stage.label}
                  </span>
                </div>
                {i < stages.length - 1 && (
                  <div
                    className={classNames(
                      'h-0.5 w-6 mt-4 transition-colors',
                      state === 'complete' ? 'bg-desert-green' : 'bg-desert-stone-light'
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-sm text-desert-stone-dark mb-1">
          <span>{message}</span>
          <span className="font-mono">{elapsedLabel}</span>
        </div>
        <div className="w-full bg-desert-stone-lighter rounded-full h-3 overflow-hidden">
          <div
            className={classNames(
              'h-full transition-all duration-700 ease-out',
              status === 'error' ? 'bg-desert-red' : 'bg-desert-green'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
