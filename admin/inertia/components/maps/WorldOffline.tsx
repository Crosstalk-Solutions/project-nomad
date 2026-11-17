import axios from 'axios'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { IconCheck, IconChevronDown } from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Alert from '~/components/Alert'
import StyledButton from '~/components/StyledButton'
import StyledModal from '~/components/StyledModal'
import ActiveDownloads from '~/components/ActiveDownloads'
import { WORLD_OFFLINE_API } from '../../../types/world_offline.js'

const API = WORLD_OFFLINE_API
const QUERY_KEY = ['world-offline'] as const
const WORLD_CIRCUMFERENCE_METERS = 40_075_016.68557849
const MONTH_COUNT = 12
const MONTH_FORMAT = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' })

type ZoomLevel = 8 | 9 | 10 | 11 | 12
type FamilyKey = 'marble' | 'satellite' | 'earth'
type WorldPackId =
  | 'blue-marble-z4' | 'blue-marble' | 'blue-marble-z8'
  | `satellite-z${ZoomLevel}` | `earth-relief-z${ZoomLevel}`
type PackId = WorldPackId | 'relief' | 'terrain' | `topo-z${Exclude<ZoomLevel, 8>}`
type PackStatus = { downloadBytes: number; installedBytes?: number; installed: boolean }
type WorldPack = PackStatus & {
  id: WorldPackId
  maxZoom: number
  metersPerPixel: number
  covered?: boolean
  additionalDownloadBytes?: number
  estimatedInstalledBytes?: number
  requiredFreeBytes?: number
  temporaryBytes?: number
  reclaimBytes?: number
  resumable?: boolean
}
type Pack = WorldPack | (PackStatus & { id: Exclude<PackId, WorldPackId> })
type Stage = 'queued' | 'downloading' | 'preparing' | 'verifying' | 'ready' | 'failed' | 'cancelled' | 'paused' | 'discarded'
type Job = {
  id: string
  packIds: PackId[]
  operation?: 'install' | 'upgrade' | 'downgrade' | 'migrate'
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused' | 'discarded'
  stage: Stage
  completedMonths: number
  currentMonth?: number
  bytesDownloaded: number
  totalBytes: number
  speedBytesPerSecond: number
  message?: string
  pauseRequested?: boolean
  cancelRequested?: boolean
}
type WorldState = { packs: Pack[]; job?: Job | null; freeBytes?: number; serviceUnavailable?: boolean; canPause?: boolean }
type Request =
  | { action: 'download'; packIds: WorldPackId[] }
  | { action: 'remove'; packId: WorldPackId }
  | { action: 'cancel' | 'retry' | 'pause' | 'resume' | 'discard'; id: string }
type OperationReply = { freedDiskBytes?: number }
type ReviewMode = 'install' | 'local' | 'upgrade' | 'resume' | 'reduce' | 'remove'
type Review = { family: FamilyKey; mode: ReviewMode; zoom: number }

type Family = {
  key: FamilyKey
  prefix: string
  anchor: string
  title: string
  name: string
  openMap: string
  mapHref: string
  description?: string
}
type FamilyPacks = {
  family: Family
  packs: WorldPack[]
  installed?: WorldPack
  lowerPacks: WorldPack[]
}

const FAMILIES: Family[] = [
  {
    key: 'marble', prefix: 'blue-marble', anchor: 'world-offline-blue-marble',
    title: 'Blue Marble 2004', name: 'Blue Marble', openMap: 'Open Blue Marble',
    mapHref: '/maps?layer=blue-marble&lat=0&lng=0',
    description: 'NASA · worldwide imagery for all 12 months',
  },
  {
    key: 'satellite', prefix: 'satellite-z', anchor: 'world-offline-satellite',
    title: 'Worldwide satellite', name: 'satellite', openMap: 'Open satellite map',
    mapHref: '/maps?layer=aerial&lat=0&lng=0',
  },
  {
    key: 'earth', prefix: 'earth-relief-z', anchor: 'world-offline-topography',
    title: 'Earth Relief', name: 'Earth Relief', openMap: 'Open map',
    mapHref: '/maps?layer=topographic&lat=-32.653&lng=-70.01&street=0',
    description: 'Worldwide shaded relief by VersaTiles',
  },
]

const STAGES: Record<Stage, string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  preparing: 'Preparing local maps',
  verifying: 'Verifying files',
  ready: 'Ready offline',
  failed: 'Download failed',
  cancelled: 'Download cancelled',
  paused: 'Paused',
  discarded: 'Partial files removed',
}

const REVIEW_LABELS: Record<ReviewMode, string> = {
  install: 'Review download',
  local: 'Review install',
  upgrade: 'Upgrade',
  resume: 'Resume upgrade',
  reduce: 'Reduce detail',
  remove: 'Remove',
}

function isActive(job: Job | null | undefined) {
  return job?.status === 'queued' || job?.status === 'running'
}

function formatSize(bytes: number) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB'
  if (bytes >= 1e6) return Math.round(bytes / 1e6) + ' MB'
  if (bytes >= 1000) return Math.round(bytes / 1000) + ' KB'
  return bytes + ' B'
}

function formatResolution(meters: number) {
  return meters >= 1000 ? Number((meters / 1000).toFixed(2)) + ' km/pixel' : Math.round(meters) + ' m/pixel'
}

function mapResolution(pack: WorldPack, family: Family) {
  const meters = family.key === 'marble' ? WORLD_CIRCUMFERENCE_METERS / (256 * 2 ** pack.maxZoom) : pack.metersPerPixel
  return formatResolution(meters)
}

function remainingTransfer(pack: WorldPack) {
  return pack.additionalDownloadBytes ?? pack.downloadBytes
}

function jobLabel(job: Job) {
  if (job.operation === 'downgrade') {
    if (job.stage === 'preparing') return 'Reducing local detail'
    if (job.stage === 'failed') return 'Could not reduce detail'
    if (job.stage === 'cancelled') return 'Update cancelled'
  }
  return STAGES[job.stage] ?? STAGES.queued
}

function reviewCopy(name: string, mode: ReviewMode) {
  switch (mode) {
    case 'install': return { title: 'Confirm ' + name + ' download', confirm: 'Start download' }
    case 'local': return { title: 'Install ' + name, confirm: 'Install ' + name }
    case 'upgrade': return { title: 'Confirm ' + name + ' upgrade', confirm: 'Start upgrade' }
    case 'resume': return { title: 'Resume ' + name + ' upgrade', confirm: 'Resume upgrade' }
    case 'reduce': return { title: 'Reduce ' + name + ' detail', confirm: 'Reduce detail' }
    case 'remove': return { title: 'Remove ' + name, confirm: 'Remove ' + name }
  }
}

function groupPacks(family: Family, inventory: Pack[]): FamilyPacks {
  const packs = inventory.filter((pack): pack is WorldPack => 'maxZoom' in pack && pack.id.startsWith(family.prefix))
    .sort((a, b) => a.maxZoom - b.maxZoom)
  const installed = packs.find((pack) => pack.installed)
  const lowerPacks = installed ? packs.filter((pack) => pack.maxZoom < installed.maxZoom) : []
  return { family, packs, installed, lowerPacks }
}

function PackageTable({ group, job, disabled, onReview, legacyEarth, freeBytes }: {
  group: FamilyPacks
  job?: Job | null
  disabled: boolean
  onReview: (review: Review) => void
  legacyEarth: boolean
  freeBytes?: number
}) {
  const { family, packs, installed, lowerPacks } = group
  const reduction = lowerPacks.at(-1)
  const titleId = family.anchor + '-title'
  if (!packs.length) return null

  return (
    <section id={family.anchor} aria-labelledby={titleId}
      className="scroll-mt-4 space-y-3 rounded-md border border-border-default p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h4 id={titleId} tabIndex={-1} className="text-base font-semibold text-text-primary">{family.title}</h4>
          {family.description && <p className="text-sm text-text-muted">{family.description}</p>}
        </div>
        {installed && (
          <a href={family.mapHref + '&zoom=' + (family.key === 'earth' ? installed.maxZoom : 2)}
            aria-label={family.openMap}
            className="inline-flex min-h-9 items-center rounded px-1 text-sm font-medium text-text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary">
            Open map
          </a>
        )}
      </div>
      {legacyEarth && !installed && (
        <p className="text-sm text-text-muted">Verified zoom files from the previous worldwide map can be reused.</p>
      )}
      <table role="table" className="block w-full border-collapse text-left text-sm text-text-primary sm:table sm:table-fixed">
        <caption className="sr-only">{family.title} packages</caption>
        <thead className="hidden text-xs text-text-muted sm:table-header-group">
          <tr>
            <th scope="col" className="w-[12%] px-1 pb-2 font-medium">Zoom</th>
            <th scope="col" className="w-[22%] px-2 pb-2 font-medium">Resolution</th>
            <th scope="col" className="w-[18%] px-2 pb-2 text-right font-medium">Full download</th>
            <th scope="col" className="w-[17%] px-2 pb-2 text-right font-medium">On disk</th>
            <th scope="col" className="px-1 pb-2 text-right font-medium">Status / actions</th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="block sm:table-row-group">
          {packs.map((pack) => {
            const covered = pack.covered || lowerPacks.includes(pack)
            const currentJob = job?.packIds.includes(pack.id) ? job : undefined
            const transfer = remainingTransfer(pack)
            const lowSpace = freeBytes !== undefined && (pack.requiredFreeBytes ?? 0) > freeBytes
            const onDisk = pack.installed ? pack.installedBytes : covered ? undefined : pack.estimatedInstalledBytes
            const mode = installed ? (pack.resumable && transfer > 0 ? 'resume' : 'upgrade')
              : transfer === 0 ? 'local' : 'install'
            return (
              <tr key={pack.id} role="row" className={'grid grid-cols-2 items-start gap-x-2 gap-y-1.5 border-t border-border-default px-1 py-2 sm:table-row sm:p-0 ' + (pack.installed ? 'bg-surface-secondary' : '')}>
                <th scope="row" role="rowheader" className="font-medium whitespace-nowrap sm:px-1 sm:py-2">
                  <span className="block text-xs font-normal text-text-muted sm:hidden" aria-hidden="true">Zoom</span>
                  0–{pack.maxZoom}
                </th>
                <td role="cell" className="min-w-0 tabular-nums sm:px-2 sm:py-2">
                  <span className="block text-xs text-text-muted sm:hidden">Resolution</span>
                  <span className="whitespace-nowrap">{mapResolution(pack, family)}</span>
                  {family.key === 'marble' && (
                    <span className="block text-xs text-text-muted">{formatResolution(pack.metersPerPixel)} NASA source</span>
                  )}
                </td>
                <td role="cell" className="tabular-nums sm:px-2 sm:py-2 sm:text-right">
                  <span className="block text-xs text-text-muted sm:hidden">Full download</span>
                  {formatSize(pack.downloadBytes)}
                </td>
                <td role="cell" className="tabular-nums sm:px-2 sm:py-2 sm:text-right">
                  <span className="block text-xs text-text-muted sm:hidden">On disk</span>
                  {onDisk === undefined ? '—' : (pack.installed ? '' : 'About ') + formatSize(onDisk)}
                </td>
                <td role="cell" className="col-span-2 sm:px-1 sm:py-2 sm:text-right">
                  {pack.installed ? (
                    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                      <span className="inline-flex items-center gap-1 rounded-full bg-desert-green px-2 py-1 text-xs font-semibold text-white">
                        <IconCheck aria-hidden="true" size={14} stroke={2.5} /> Installed
                      </span>
                      <Menu>
                        <MenuButton aria-label={'Manage ' + family.name} disabled={disabled}
                          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border-default bg-surface-primary px-2 text-xs font-semibold text-text-primary hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-desert-orange disabled:opacity-60">
                          Manage <IconChevronDown aria-hidden="true" size={14} />
                        </MenuButton>
                        <MenuItems modal={false} anchor="bottom end" className="z-40 min-w-44 rounded-md border border-border-default bg-surface-primary p-1 text-sm shadow-lg outline-none [--anchor-gap:4px]">
                          {reduction && (
                            <MenuItem as="button" type="button" className="block w-full rounded px-3 py-2 text-left text-text-primary data-[focus]:bg-surface-secondary"
                              onClick={() => onReview({ family: family.key, mode: 'reduce', zoom: reduction.maxZoom })}>
                              Reduce detail…
                            </MenuItem>
                          )}
                          <MenuItem as="button" type="button" className="block w-full rounded px-3 py-2 text-left text-desert-red data-[focus]:bg-surface-secondary"
                            onClick={() => onReview({ family: family.key, mode: 'remove', zoom: pack.maxZoom })}>
                            Remove {family.name}…
                          </MenuItem>
                        </MenuItems>
                      </Menu>
                    </div>
                  ) : currentJob && (isActive(currentJob) || currentJob.status === 'paused') ? (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:justify-end">
                      <span className="font-medium text-text-primary">{jobLabel(currentJob)}</span>
                      <a href="#world-download-status" className="text-text-primary underline underline-offset-2">
                        Progress
                      </a>
                    </div>
                  ) : covered ? (
                    <span className="text-xs text-text-muted">Included in zoom {installed?.maxZoom}</span>
                  ) : (
                    <>
                      <StyledButton size="sm" variant="outline" className="min-h-8" disabled={disabled}
                        onClick={() => onReview({ family: family.key, mode, zoom: pack.maxZoom })}>
                        {lowSpace ? 'Review storage' : REVIEW_LABELS[mode]}
                      </StyledButton>
                      {lowSpace && <p className="mt-1 text-xs text-desert-red">More free space needed</p>}
                      {transfer < pack.downloadBytes && (
                        <p className="mt-1 text-xs text-text-muted">
                          {transfer === 0 ? 'Ready to install locally' : formatSize(transfer) + ' remaining'}
                        </p>
                      )}
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function PackageReview({ review, group, disabled, freeBytes, pending, error, onClose, onZoomChange, onConfirm }: {
  review: Review
  group: FamilyPacks
  disabled: boolean
  freeBytes?: number
  pending: boolean
  error: string
  onClose: () => void
  onZoomChange: (zoom: number) => void
  onConfirm: (request: Request) => void
}) {
  const { family, packs, installed, lowerPacks } = group
  const pack = packs.find((item) => item.maxZoom === review.zoom)
  const reduce = review.mode === 'reduce'
  const remove = review.mode === 'remove'
  const valid = pack && (remove ? pack.installed : reduce ? lowerPacks.includes(pack)
    : !pack.installed && !pack.covered && !lowerPacks.includes(pack))
  const copy = reviewCopy(family.name, review.mode)
  const transfer = pack && !reduce && !remove ? remainingTransfer(pack) : 0
  const required = pack?.requiredFreeBytes
  const insufficient = !remove && required !== undefined && freeBytes !== undefined && required > freeBytes
  const stats: [string, string | undefined][] = [
    ['Download remaining', transfer ? formatSize(transfer) : 'None'],
    ['Estimated installed size', pack?.estimatedInstalledBytes === undefined ? undefined : formatSize(pack.estimatedInstalledBytes)],
    ['Temporary preparation space', !reduce && pack?.temporaryBytes ? formatSize(pack.temporaryBytes) : undefined],
    ['Total free space needed', required ? formatSize(required) : undefined],
    ['Available on disk', freeBytes === undefined ? undefined : formatSize(freeBytes)],
  ]

  return (
    <StyledModal open title={copy.title} confirmText={copy.confirm}
      confirmVariant={remove ? 'danger' : 'action'}
      confirmDisabled={!valid || disabled || insufficient}
      onClose={onClose} onCancel={onClose} confirmLoading={pending} cancelLoading={pending}
      onConfirm={() => pack && onConfirm(remove ? { action: 'remove', packId: pack.id } : { action: 'download', packIds: [pack.id] })}>
      <div className="space-y-3 text-sm text-text-muted">
        {!valid || !pack ? (
          <p role="alert">Map availability changed. Close this window and check the current zooms.</p>
        ) : remove ? (
          <>
            <p>{family.key === 'marble' ? 'Remove all 12 Blue Marble months from this NOMAD?'
              : 'Remove ' + family.title + ' for zooms 0–' + pack.maxZoom + ' from this NOMAD?'}</p>
            {pack.installedBytes !== undefined && (
              <p className="font-medium text-text-primary">{formatSize(pack.installedBytes)} will be freed.</p>
            )}
          </>
        ) : (
          <>
            {reduce ? (
              <label className="block text-text-primary">
                <span className="block font-medium">Maximum zoom</span>
                <select value={review.zoom} disabled={pending} onChange={(event) => onZoomChange(Number(event.currentTarget.value))}
                  className="mt-1 min-h-9 w-full rounded-md border border-border-default bg-surface-primary px-2 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-desert-orange sm:w-auto">
                  {lowerPacks.map((item) => <option key={item.id} value={item.maxZoom}>Zoom 0–{item.maxZoom}</option>)}
                </select>
              </label>
            ) : (
              <p>{family.title} · zoom 0–{pack.maxZoom} · {mapResolution(pack, family)} at the equator
                {family.key === 'marble' && ' · ' + formatResolution(pack.metersPerPixel) + ' NASA source'}</p>
            )}
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
              {stats.flatMap(([label, value]) => value === undefined ? [] : [
                <dt key={label + '-term'} className={insufficient && label === 'Total free space needed' ? 'font-medium text-desert-red' : undefined}>{label}</dt>,
                <dd key={label + '-value'} className="text-right tabular-nums text-text-primary">{value}</dd>,
              ])}
            </dl>
            {reduce && (
              <p>{family.key === 'marble' ? 'Keep all 12 months at a lower zoom using local map files.'
                : 'Keep the lower zooms using map files already on this NOMAD.'}
                {pack.reclaimBytes !== undefined && pack.reclaimBytes > 0 && ' About ' + formatSize(pack.reclaimBytes) + ' will be freed.'}</p>
            )}
            {installed && <p>Your current map stays available until the new files are verified.</p>}
          </>
        )}
        {error && <p role="alert" className="text-desert-red">{error}</p>}
      </div>
    </StyledModal>
  )
}

function useWorldState() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async ({ signal }) => (await axios.get<WorldState>(API, { signal })).data,
    refetchInterval: ({ state: query }) => isActive(query.data?.job) ? 1_500 : 12_000,
    refetchIntervalInBackground: false,
  })
}

export default function WorldOffline() {
  const queryClient = useQueryClient()
  const [review, setReview] = useState<Review>()
  const [announcement, announce] = useState('')
  const state = useWorldState()
  const inventory = state.data?.packs ?? []
  const groups = FAMILIES.map((family) => groupPacks(family, inventory))
  const reviewGroup = review && groups.find(({ family }) => family.key === review.family)
  const legacyEarth = inventory.some((pack) => pack.id.startsWith('topo-z') && pack.installed)
  const reportedJob = state.data?.job
  const legacyJob = reportedJob?.packIds.every((id) => id === 'relief' || id === 'terrain' || id.startsWith('topo-z'))
  const obsoleteJob = reportedJob?.status === 'completed' || reportedJob?.status === 'discarded'
    || (legacyJob && !isActive(reportedJob) && reportedJob?.status !== 'paused')
  const job = obsoleteJob ? undefined : reportedJob
  const busy = isActive(job)
  const paused = job?.status === 'paused'
  const unavailable = state.isError || !!state.data?.serviceUnavailable
  const freeBytes = state.data?.freeBytes

  const mutate = useMutation({
    mutationFn: async (request: Request) => {
      const body = request.action === 'download' ? { packIds: request.packIds }
        : request.action === 'remove' ? { packId: request.packId } : { id: request.id }
      return (await axios.post<OperationReply>(API + '/' + request.action, body)).data
    },
    onSuccess: async (_, request) => {
      const focusTarget = reviewGroup?.family.anchor
      setReview(undefined)
      announce(request.action === 'remove' ? 'Package removed.' : 'Task added to Active Downloads.')
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      if (request.action === 'remove' && focusTarget) {
        window.requestAnimationFrame(() => document.getElementById(focusTarget)?.querySelector('h4')?.focus())
      }
    },
    onError: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const mutationError = mutate.isError
    ? (axios.isAxiosError<{ message?: string }>(mutate.error) && mutate.error.response?.data?.message)
      || 'Could not update the world map. Try again.'
    : ''
  const actionsDisabled = busy || paused || unavailable || mutate.isPending

  return (
    <section id="world-offline" aria-labelledby="world-offline-title"
      className="mb-4 scroll-mt-4 space-y-3 rounded-lg border border-border-default bg-surface-primary p-4 sm:p-5">
      <span role="status" className="sr-only">{announcement}</span>
      <h3 id="world-offline-title" className="text-lg font-semibold text-text-primary">World offline</h3>
      {state.isPending && <p role="status" className="text-sm text-text-muted">Loading worldwide maps…</p>}
      {groups.map((group) => (
        <PackageTable key={group.family.key} group={group} job={job} disabled={actionsDisabled} freeBytes={freeBytes}
          legacyEarth={group.family.key === 'earth' && legacyEarth}
          onReview={(next) => { mutate.reset(); setReview(next) }} />
      ))}
      {groups.some(({ packs }) => packs.length) && (
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-text-muted">
          <p>Reference resolution at the equator.</p>
          {freeBytes !== undefined && <p>{formatSize(freeBytes)} available on disk</p>}
        </div>
      )}
      {unavailable && (
        <Alert type="info" variant="bordered" title="World download service unavailable"
          message="You can still open installed maps. Refresh to check the download service again.">
          <StyledButton size="sm" variant="secondary" onClick={() => void state.refetch()}>Refresh status</StyledButton>
        </Alert>
      )}
      {mutationError && !review && <p role="alert" className="text-sm text-desert-red">{mutationError}</p>}
      {review && reviewGroup && (
        <PackageReview review={review} group={reviewGroup} disabled={actionsDisabled}
          freeBytes={freeBytes} pending={mutate.isPending} error={mutationError}
          onClose={() => { if (!mutate.isPending) { setReview(undefined); mutate.reset() } }}
          onZoomChange={(zoom) => setReview({ ...review, zoom })}
          onConfirm={mutate.mutate} />
      )}
    </section>
  )
}

export function WorldOfflineDownloads() {
  const state = useWorldState()
  const queryClient = useQueryClient()
  const [discard, setDiscard] = useState(false)
  const [announcement, announce] = useState('')
  const job = state.data?.job
  const busy = isActive(job)
  const paused = job?.status === 'paused'
  const unavailable = state.isError || !!state.data?.serviceUnavailable
  const legacyJob = job?.packIds.every((id) => id === 'relief' || id === 'terrain' || id.startsWith('topo-z'))
  const inventory = state.data?.packs ?? []
  const groups = FAMILIES.map((family) => groupPacks(family, inventory))
  const mutate = useMutation({
    mutationFn: async ({ action, id }: { action: 'cancel' | 'pause' | 'resume' | 'retry' | 'discard'; id: string }) =>
      (await axios.post<OperationReply>(API + '/' + action, { id })).data,
    onSuccess: (result, request) => {
      if (request.action === 'discard') {
        setDiscard(false)
        announce(result.freedDiskBytes ? formatSize(result.freedDiskBytes) + ' freed.' : 'Partial files cleared.')
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
  const message = mutate.isError
    ? (axios.isAxiosError<{ message?: string }>(mutate.error) && mutate.error.response?.data?.message)
      || 'Could not update this task. Refresh and try again.'
    : ''
  const downloading = busy && job?.stage === 'downloading' && job.totalBytes > 0
  const preparing = busy && (job?.stage === 'preparing' || job?.stage === 'verifying')
  const jobGroup = groups.find(({ packs }) => packs.some((pack) => job?.packIds.includes(pack.id)))
  const jobPack = jobGroup?.packs.find((pack) => job?.packIds.includes(pack.id))
  const marbleJob = jobGroup?.family.key === 'marble'
  const reducing = job?.operation === 'downgrade'
  const completeMonths = Math.max(0, Math.min(MONTH_COUNT, job?.completedMonths ?? 0))
  const currentMonth = busy && marbleJob && job?.currentMonth && job.currentMonth >= 1 && job.currentMonth <= MONTH_COUNT
    ? MONTH_FORMAT.format(Date.UTC(2004, job.currentMonth - 1, 1)) : undefined
  const progress = job && downloading
    ? Math.round(Math.max(0, Math.min(1, job.bytesDownloaded / job.totalBytes)) * 100)
    : marbleJob ? Math.round(completeMonths / MONTH_COUNT * 100) : undefined

  const showJob = job && job.status !== 'completed' && job.status !== 'discarded'
    && (!legacyJob || busy || paused)
  const activity = showJob && (
    <section id="world-download-status" tabIndex={-1} aria-label="World download status" className="scroll-mt-4 space-y-2 rounded-lg border border-default bg-surface-primary p-4 text-sm">
      <p role="status" className="font-medium text-text-primary">
        {jobLabel(job)}
        {jobPack && jobGroup && ' · ' + (jobGroup.family.key === 'satellite' ? 'Satellite' : jobGroup.family.name) + ' through zoom ' + jobPack.maxZoom}
        {currentMonth && ' · ' + currentMonth + ' 2004'}
        {marbleJob && ' · ' + completeMonths + '/' + MONTH_COUNT + ' months ready'}
      </p>
      {job.message && (!currentMonth || (job.stage !== 'downloading' && job.stage !== 'preparing')) && (
        <p className="break-words text-text-muted">{job.message}</p>
      )}
      {(downloading || preparing) && (
        <progress max={100} value={progress}
          aria-label={preparing && marbleJob ? 'Blue Marble months prepared' : 'World download progress'}
          className="h-2 w-full accent-desert-olive" />
      )}
      {downloading && (
        <p className="text-text-muted">
          {formatSize(job.bytesDownloaded)} of {formatSize(job.totalBytes)}
          {job.speedBytesPerSecond > 0 && ' · ' + formatSize(job.speedBytesPerSecond) + '/s'}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!legacyJob && (!busy || state.data?.canPause) && <StyledButton size="sm" variant="outline"
          disabled={unavailable || mutate.isPending || (busy && (job.pauseRequested || job.cancelRequested))}
          onClick={() => mutate.mutate({ action: busy ? 'pause' : paused ? 'resume' : 'retry', id: job.id })}>
          {busy ? (reducing ? 'Pause update' : 'Pause download')
            : paused ? (reducing ? 'Resume update' : 'Resume download')
            : reducing ? 'Retry update' : 'Retry download'}
        </StyledButton>}
        {(job.status === 'failed' || job.status === 'cancelled') && !legacyJob && (
        <StyledButton size="sm" variant="outline" disabled={unavailable || mutate.isPending}
          onClick={() => { mutate.reset(); setDiscard(true) }}>
          Free partial files
        </StyledButton>
      )}
      {(busy || paused) && (
          <StyledButton size="sm" variant="outline" disabled={unavailable || mutate.isPending || job.cancelRequested}
            onClick={() => mutate.mutate({ action: 'cancel', id: job.id })}>
            {reducing ? 'Cancel update' : 'Cancel download'}
          </StyledButton>
        )}
      </div>
      {message && <p role="alert" className="text-desert-red">{message}</p>}
      {discard && <StyledModal open title="Free partial files" confirmText="Free partial files"
        confirmVariant="danger" confirmLoading={mutate.isPending}
        onClose={() => { if (!mutate.isPending) setDiscard(false) }}
        onCancel={() => { if (!mutate.isPending) setDiscard(false) }}
        onConfirm={() => mutate.mutate({ action: 'discard', id: job.id })}>
        <p className="text-text-muted">Delete the files saved for this interrupted attempt. Keeping them may make a retry faster. Installed maps remain available.</p>
      </StyledModal>}
    </section>
  )
  return (
    <>
      <ActiveDownloads filetype="map" withHeader additionalActivity={activity} />
      <span role="status" className="sr-only">{announcement}</span>
    </>
  )
}
