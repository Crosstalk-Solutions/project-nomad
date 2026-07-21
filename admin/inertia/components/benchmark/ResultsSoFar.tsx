import { IconCheck } from '@tabler/icons-react'
import type { BenchmarkPartialResult } from '../../../types/benchmark'

/**
 * Horizontal strip of chips that fills in each stage's raw result as stages
 * complete during a live run. Renders nothing until the first result lands.
 */
export default function ResultsSoFar({ partials }: { partials: BenchmarkPartialResult[] }) {
  if (partials.length === 0) return null

  return (
    <div className="bg-desert-white rounded-lg p-4 border border-desert-stone-light">
      <div className="text-xs font-semibold text-desert-stone-dark uppercase tracking-wide mb-3">
        Results so far
      </div>
      <div className="flex flex-wrap gap-2">
        {partials.map((p) => (
          <div
            key={p.status}
            className="flex items-center gap-2 rounded-md border border-desert-stone-light bg-desert-white px-3 py-1.5"
          >
            <IconCheck className="w-4 h-4 text-desert-green" />
            <span className="text-xs font-semibold text-desert-stone-dark uppercase tracking-wide">
              {p.label}
            </span>
            <span className="text-sm font-bold font-mono tabular-nums text-desert-green">
              {p.value.toLocaleString()}
              <span className="text-xs font-semibold text-desert-stone-dark ml-1">{p.unit}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
