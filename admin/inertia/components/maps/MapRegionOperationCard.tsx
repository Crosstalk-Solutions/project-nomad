import { useEffect, useRef, useState } from 'react'
import { Link } from '@inertiajs/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  IconAlertTriangle,
  IconCircle,
  IconCircleCheck,
  IconCircleDot,
  IconX,
} from '@tabler/icons-react'
import type { MapRegionComponent, MapRegionComponentState } from '../../../types/map_regions'
import {
  cancelMapRegion,
  retryMapRegion,
  MAP_OPERATIONS_KEY,
  MAP_REGIONS_KEY,
} from '~/lib/map_regions_api'
import { regionOperationBusy } from '~/lib/map_region_downloads'
import {
  formatOperationDuration,
  operationAge,
  operationIntentLabel,
  operationWorkLabel,
  operationStepProgress,
  operationWaitingLabel,
  regionOperationPresentation,
} from '~/lib/map_region_operation_ui'
import { mapApiErrorMessage } from '~/lib/map_api_error'
import { formatBytes } from '~/lib/util'
import StyledButton from '~/components/StyledButton'

type Props = {
  regionId: string
  name: string
  components: Partial<Record<MapRegionComponent, MapRegionComponentState>>
  showRegionLink?: boolean
  surface?: 'card' | 'inline'
  allowRetry?: boolean
}

export default function MapRegionOperationCard({
  regionId,
  name,
  components,
  showRegionLink = true,
  surface = 'card',
  allowRetry = true,
}: Props) {
  const client = useQueryClient()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [notice, setNotice] = useState('')
  const [lastAction, setLastAction] = useState<'cancel' | 'retry' | null>(null)
  const [now, setNow] = useState(Date.now())
  const confirmationRef = useRef<HTMLDivElement>(null)
  const cancelTriggerRef = useRef<HTMLDivElement>(null)
  const hadConfirmation = useRef(false)
  const routing = components.routing
  const presentation = regionOperationPresentation(
    routing
      ? {
          routing: {
            ...routing,
            operation: routing.operation
              ? { ...routing.operation, workflowComponents: ['routing'] }
              : undefined,
          },
        }
      : {}
  )
  const { entries, focus, stages, phase, waiting, unknown } = presentation
  const active = entries.filter(({ state }) => regionOperationBusy(state.status))
  const stopped = entries.filter(({ state }) => ['failed', 'cancelled'].includes(state.status))
  const retryable = stopped.filter(({ state }) => state.operation?.retryable === true)
  const cancelling = active.some(({ state }) => state.status === 'cancelling')
  const state = focus?.state
  const operation = state?.operation
  const workLabel = operationWorkLabel(phase, operation?.detail)
  const progressScope = operation?.detail ? 'this substep' : 'this step'
  const progress = operationStepProgress(state)
  const measurable =
    progress.percent !== undefined ||
    progress.bytes !== undefined ||
    operation?.recordsProcessed !== undefined
  const lastProgress = !waiting && operationAge(operation?.lastProgressAt, now)
  const heartbeat = !waiting && operationAge(operation?.heartbeatAt, now)
  const startedAt = operation?.startedAt ? Date.parse(operation.startedAt) : NaN
  const elapsed = Number.isFinite(startedAt)
    ? formatOperationDuration(Math.max(0, (now - startedAt) / 1000))
    : null
  useEffect(() => {
    if (!active.length) return
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [!!active.length])
  useEffect(() => {
    if (!active.length) setConfirmCancel(false)
  }, [!!active.length])
  useEffect(() => {
    if (confirmCancel) confirmationRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    else if (hadConfirmation.current)
      cancelTriggerRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    hadConfirmation.current = confirmCancel
  }, [confirmCancel])
  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: MAP_OPERATIONS_KEY }),
      client.invalidateQueries({ queryKey: MAP_REGIONS_KEY }),
      client.invalidateQueries({ queryKey: ['routing-coverage'] }),
    ])
  }
  const cancel = useMutation({
    mutationFn: () =>
      cancelMapRegion(
        regionId,
        active.map(({ component }) => component)
      ),
    onMutate: () => {
      setNotice('')
      setLastAction('cancel')
      setConfirmCancel(false)
    },
    onSuccess: async () => {
      setNotice('Cancellation requested. Waiting for remaining tasks to stop.')
      await invalidate()
    },
  })
  const retry = useMutation({
    mutationFn: () =>
      retryMapRegion(
        regionId,
        retryable.map(({ component }) => component)
      ),
    onMutate: () => {
      setNotice('')
      setLastAction('retry')
    },
    onSuccess: async () => {
      setNotice('The remaining tasks are queued again. Installed data is preserved.')
      await invalidate()
    },
  })
  const operationStates = entries.map(({ state: entry }) => entry.status).join('|')
  useEffect(() => {
    if (lastAction !== 'cancel' || !cancel.isSuccess || active.length) return
    setNotice(
      operationStates.includes('cancelled')
        ? 'Remaining tasks cancelled. Installed data and cached sources are preserved.'
        : 'The tasks have stopped. Their final state is shown here.'
    )
  }, [lastAction, cancel.isSuccess, active.length, operationStates])
  if (!entries.length) return null
  const pending = cancel.isPending || retry.isPending
  const cached = operation?.sourceMode === 'cached' || state?.searchRebuilding
  const canMeasure =
    !!state && regionOperationBusy(state.status) && !waiting && !unknown && !cancelling
  const interval =
    progress.etaMinimum !== undefined && progress.etaMaximum !== undefined
      ? [formatOperationDuration(progress.etaMinimum), formatOperationDuration(progress.etaMaximum)]
      : undefined
  const etaLabel = interval
    ? `About ${interval[0] === interval[1] ? interval[0] : interval.join('–')} remaining in ${progressScope}`
    : progress.measuredEta !== undefined
      ? `About ${formatOperationDuration(progress.measuredEta)} remaining in ${progressScope}`
      : undefined
  return (
    <article
      className={
        surface === 'inline'
          ? 'min-w-0 border-t border-border-subtle pt-4 text-sm'
          : 'rounded-lg border border-border-default bg-surface-primary p-4 text-sm shadow-sm'
      }
      aria-label={`${name} region tasks`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && confirmCancel) {
          event.preventDefault()
          event.stopPropagation()
          setConfirmCancel(false)
        }
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {showRegionLink && <p className="mb-1 font-semibold text-text-primary">{name}</p>}
          <h4 className="font-semibold text-text-primary" role="status">
            {presentation.title}
          </h4>
          {presentation.readiness && (
            <p className="mt-1 text-xs text-text-secondary">{presentation.readiness}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
          {stages.length > 0 && (
            <span>
              Step {presentation.step} of {stages.length}
            </span>
          )}
          {showRegionLink && (
            <Link
              href={`/settings/maps?region=${encodeURIComponent(regionId)}#offline-regions`}
              className="font-medium text-desert-green underline"
            >
              View region
            </Link>
          )}
        </div>
      </div>
      {canMeasure && (
        <>
          {workLabel !== presentation.title && (
            <p className="mt-2 text-text-secondary">{workLabel}</p>
          )}
          <progress
            max={100}
            {...(progress.percent !== undefined ? { value: progress.percent } : {})}
            className="mt-2 w-full accent-desert-green"
            aria-label={`${name}: ${workLabel}`}
          />
          {progress.percent !== undefined && (
            <p className="mt-1 text-xs text-text-secondary">
              {Math.floor(progress.percent)}% of {progressScope}
            </p>
          )}
          {progress.bytes !== undefined && (
            <p className="mt-2 tabular-nums text-text-secondary">
              {progress.downloading ? 'Downloaded: ' : `Processed in ${progressScope}: `}
              {formatBytes(progress.bytes)}
              {progress.total && progress.total > 0 ? ` / ${formatBytes(progress.total)}` : ''}
              {progress.speed && progress.speed > 0 ? ` · ≈ ${formatBytes(progress.speed)}/s` : ''}
            </p>
          )}
          {operation?.recordsProcessed !== undefined && (
            <p className="mt-2 tabular-nums text-text-secondary">
              {operation.recordsProcessed.toLocaleString()}
              {operation.recordsTotal ? ` / ${operation.recordsTotal.toLocaleString()}` : ''}{' '}
              records processed
              {progress.fresh && operation.recordsPerSecond && operation.recordsPerSecond > 0
                ? ` · ≈ ${Math.round(operation.recordsPerSecond).toLocaleString()}/s`
                : ''}
            </p>
          )}
          <p className="mt-1 text-xs text-text-muted">
            {etaLabel ||
              (phase === 'building_routing'
                ? 'This routing step has no reliable percentage or remaining-time estimate yet.'
                : progress.fresh
                  ? 'Estimating remaining time…'
                  : 'Remaining time is unavailable while progress is uncertain.')}
            {etaLabel && progress.etaBasis === 'history' ? ' · based on local history' : ''}
          </p>
        </>
      )}
      {waiting && state && (
        <p className="mt-2 text-text-secondary">{operationWaitingLabel(state)}</p>
      )}
      {unknown && (
        <p className="mt-2 text-desert-orange">
          The latest status is unavailable. Last known information is shown; refresh before starting
          another task.
        </p>
      )}
      {cached && !presentation.allReady && (
        <p className="mt-2 text-xs text-text-muted">
          Using the source already on this NOMAD. No source download is needed.
        </p>
      )}
      {operation?.transferComplete && !cached && !presentation.allReady && (
        <p className="mt-2 text-xs text-text-muted">
          Source download complete. Offline data is still being prepared and verified.
        </p>
      )}
      {canMeasure && elapsed && (
        <p className="mt-2 text-xs text-text-muted">Elapsed for this task: {elapsed}</p>
      )}
      {(lastProgress || heartbeat) && !presentation.allReady && (
        <p className="mt-1 text-xs text-text-muted">
          {lastProgress && measurable ? `Last progress measurement: ${lastProgress}` : ''}
          {lastProgress && measurable && heartbeat ? ' · ' : ''}
          {heartbeat
            ? `${operation?.telemetry === 'legacy' ? 'Service last responded' : 'Worker last responded'}: ${heartbeat}`
            : ''}
        </p>
      )}
      {!waiting && operation?.activity === 'no_recent_progress' && (
        <p className="mt-2 text-xs text-text-muted">
          No new progress measurement is available for this step. A responding worker does not
          provide a completion percentage; check Details for its last report.
        </p>
      )}
      {stages.length > 0 && (
        <ol className="mt-4 space-y-2" aria-label="Region task stages">
          {stages.map((stage) => {
            const Icon =
              stage.status === 'complete'
                ? IconCircleCheck
                : stage.status === 'current'
                  ? IconCircleDot
                  : stage.status === 'failed'
                    ? IconAlertTriangle
                    : stage.status === 'cancelled'
                      ? IconX
                      : IconCircle
            return (
              <li
                key={stage.id}
                aria-current={stage.status === 'current' ? 'step' : undefined}
                className={`flex items-start gap-2 text-xs ${stage.status === 'failed' ? 'text-desert-red' : stage.status === 'current' ? 'font-medium text-text-primary' : 'text-text-muted'}`}
              >
                <Icon size={15} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  {stage.label}
                  {stage.status === 'current'
                    ? ' · in progress'
                    : stage.status === 'failed'
                      ? ' · needs attention'
                      : stage.status === 'cancelled'
                        ? ' · cancelled'
                        : ''}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {(presentation.parallel || presentation.independent) && (
        <p className="mt-2 text-xs text-text-muted">
          These components have independent tasks. Each keeps its own preparation state.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {allowRetry && retryable.length > 0 && !unknown && (
          <StyledButton
            size="sm"
            variant="outline"
            loading={retry.isPending}
            disabled={pending || cancelling}
            onClick={() => retry.mutate()}
          >
            Retry
          </StyledButton>
        )}
        {active.length > 0 && !confirmCancel && (
          <div ref={cancelTriggerRef}>
            <StyledButton
              size="sm"
              variant="outline"
              loading={cancelling || cancel.isPending}
              disabled={pending || cancelling}
              onClick={() => setConfirmCancel(true)}
            >
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </StyledButton>
          </div>
        )}
        {(unknown || stopped.some(({ state: entry }) => entry.operation?.retryable !== true)) && (
          <StyledButton size="sm" variant="ghost" onClick={() => void invalidate()}>
            Refresh status
          </StyledButton>
        )}
      </div>
      {confirmCancel && (
        <div
          ref={confirmationRef}
          className="mt-3"
          role="group"
          aria-label={`Confirm cancelling remaining tasks for ${name}`}
        >
          <p className="text-xs text-text-secondary">
            Cancel the remaining tasks for {name}? Installed data and cached sources will be
            preserved.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StyledButton
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => cancel.mutate()}
            >
              Confirm cancellation
            </StyledButton>
            <StyledButton
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirmCancel(false)}
            >
              Keep running
            </StyledButton>
          </div>
        </div>
      )}
      <details className="mt-4 text-xs text-text-muted">
        <summary className="cursor-pointer">Details</summary>
        <div className="mt-2 space-y-3">
          {entries.map(({ component, state: entry }) => (
            <div key={component}>
              <p className="font-medium text-text-secondary">
                {component === 'search' ? 'Offline search' : 'Car and walking routes'} ·{' '}
                {operationIntentLabel(entry)}
              </p>
              <p className="mt-1">
                {operationWorkLabel(
                  entry.operation?.phase || entry.status,
                  entry.operation?.detail
                )}
              </p>
              {entry.operation?.detail && (
                <p className="mt-1 break-words">{entry.operation.detail}</p>
              )}
              {entry.operation?.attempt && entry.operation.attempt > 1 && (
                <p className="mt-1">Attempt {entry.operation.attempt}</p>
              )}
              {entry.operation?.lastProgressAt && (
                <p className="mt-1">
                  Last progress measurement: {operationAge(entry.operation.lastProgressAt, now)}
                </p>
              )}
              {entry.operation?.workBytes !== undefined && (
                <p className="mt-1">
                  Local working files: {formatBytes(entry.operation.workBytes)}
                </p>
              )}
              {entry.operation?.activityEvidence === 'output_growth' && (
                <p className="mt-1">Recent local file activity detected.</p>
              )}
              {entry.error && <p className="mt-1 break-words text-desert-red">{entry.error}</p>}
              {entry.installedVersion && !presentation.allReady && (
                <p className="mt-1">
                  The installed version remains available until its verified replacement is
                  published.
                </p>
              )}
            </div>
          ))}
        </div>
      </details>
      {stopped.some(({ state: entry }) => entry.status === 'failed') && (
        <p role="alert" className="mt-2 text-xs text-desert-red">
          {allowRetry
            ? 'A task did not finish. Open Details to review the error before retrying.'
            : 'This legacy attempt is stopped. Review Details or remove the task.'}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-2 text-xs text-text-secondary">
          {notice}
        </p>
      )}
      {((lastAction === 'cancel' && cancel.error) || (lastAction === 'retry' && retry.error)) && (
        <p role="alert" className="mt-2 text-xs text-desert-red">
          {mapApiErrorMessage(
            lastAction === 'cancel' ? cancel.error : retry.error,
            'The task could not be changed. Refresh its status and try again.'
          )}
        </p>
      )}
    </article>
  )
}
