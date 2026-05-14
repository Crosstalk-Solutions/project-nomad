import { useEffect, useState } from 'react'
import useEmbedJobs from '~/hooks/useEmbedJobs'
import HorizontalBarChart from './HorizontalBarChart'
import StyledButton from './StyledButton'
import StyledSectionHeader from './StyledSectionHeader'
import {
  JOB_HEALTH_DISPLAY,
  computeJobHealth,
  formatTimeAgo,
} from '~/lib/kb_job_health_display'

interface ActiveEmbedJobsProps {
  withHeader?: boolean
}

const ActiveEmbedJobs = ({ withHeader = false }: ActiveEmbedJobsProps) => {
  const { data: jobs, invalidate, dataUpdatedAt } = useEmbedJobs()

  // Live "last refreshed Xs ago" tick. We re-render every 5s purely to keep
  // the relative timestamp current, without touching React Query state.
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      {withHeader && (
        <StyledSectionHeader title="Processing Queue" className="mt-12 mb-4" />
      )}

      {/* Refresh row — only shown when at least one job exists so the empty
          state stays clean. */}
      {jobs && jobs.length > 0 && (
        <div className="flex items-center justify-between mb-3 text-sm">
          <span className="text-text-muted">
            {dataUpdatedAt > 0
              ? `Last updated ${formatTimeAgo(dataUpdatedAt, tick)}`
              : 'Loading…'}
          </span>
          <StyledButton variant="ghost" size="sm" icon="IconRefresh" onClick={invalidate}>
            Refresh
          </StyledButton>
        </div>
      )}

      <div className="space-y-4">
        {jobs && jobs.length > 0 ? (
          jobs.map((job) => {
            const health = computeJobHealth({
              status: job.status,
              progress: job.progress,
              lastBatchAt: job.lastBatchAt,
              startedAt: job.startedAt,
              now: tick,
            })
            const display = JOB_HEALTH_DISPLAY[health]
            const lastActivityMs = job.lastBatchAt ?? job.startedAt
            return (
              <div
                key={job.jobId}
                className="bg-desert-white rounded-lg p-4 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${display.dot}`}
                    aria-label={display.ariaLabel}
                    title={display.ariaLabel}
                  />
                  <span className="text-sm font-medium text-text-primary">
                    {display.label}
                  </span>
                  {lastActivityMs !== undefined && (
                    <span className="text-xs text-text-muted">
                      · last activity {formatTimeAgo(lastActivityMs, tick)}
                    </span>
                  )}
                  {typeof job.chunks === 'number' && job.chunks > 0 && (
                    <span className="text-xs text-text-muted">
                      · {job.chunks.toLocaleString()} chunks
                    </span>
                  )}
                </div>
                <HorizontalBarChart
                  items={[
                    {
                      label: job.fileName,
                      value: job.progress,
                      total: '100%',
                      used: `${job.progress}%`,
                      type: job.status,
                    },
                  ]}
                />
              </div>
            )
          })
        ) : (
          <p className="text-text-muted">No files are currently being processed</p>
        )}
      </div>
    </>
  )
}

export default ActiveEmbedJobs
