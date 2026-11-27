import axios from 'axios'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import maplibregl, { type StyleSpecification } from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import {
  IconArrowDown, IconArrowLeft, IconArrowRight, IconArrowUp, IconHandStop,
  IconMap, IconMinus, IconMountain, IconPlus, IconSatellite, IconSelect,
  IconWorld, IconX, IconTrash, IconCheck,
} from '@tabler/icons-react'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import StyledModal from '~/components/StyledModal'
import { formatBytes } from '~/lib/util'
import { observeRegionalCompletion, type RegionalCompletionState } from './regionalDownloadCompletion.js'
import 'maplibre-gl/dist/maplibre-gl.css'
import './localDetailDownloads.css'

const API = '/api/maps/local-detail'
const QUERY_KEY = ['local-detail'] as const
const STORAGE_KEY = 'nomad:local-detail:selection:v1'
const GRID_ZOOM = 8
const CELL_COUNT = 2 ** GRID_ZOOM
// getRandomValues also works on an offline HTTP LAN origin, where randomUUID
// may be unavailable. The token identifies admission retries, not a user.
const admissionRequestId = () => [...crypto.getRandomValues(new Uint8Array(16))]
  .map((value) => value.toString(16).padStart(2, '0')).join('')
type Cell = { x: number; y: number }
type InstalledCell = Cell & { id: string; label: string; status: string; installedBytes?: number }
type Job = {
  id: string; status: string; stage: string; cells: Cell[]; progress?: number
  downloadedBytes?: number; bytesDownloaded?: number; totalBytes?: number
  speedBytesPerSecond?: number; error?: string; message?: string
  recovery?: Recovery
}
type Recovery = { canRetry?: boolean; canPrepareOffline?: boolean; needsRecalculation?: boolean; reason?: string }
type Queue = {
  id: string; status: string; batches: { cells: Cell[]; status: string; quoteId: string }[]
  requestId?: string
  batchIndex: number; totalBatches: number; completedCells: number; totalCells: number
  message?: string; error?: string; recovery?: Recovery
}
type TemporaryStorage = { savedPreparationBytes: number; expiredMetadataBytes: number; totalBytes: number; activeProtected: boolean; canDiscard: boolean; canPrune: boolean; discardId?: string }
type Inventory = { cells: InstalledCell[]; job: Job | null; queue?: Queue | null; serviceUnavailable?: boolean; cleanupPending?: Cell[]; temporaryStorage?: TemporaryStorage }
type QuoteItem = Cell & { id: string; label: string; downloadBytes: number; estimatedInstalledBytes: number }
type Quote = {
  items: QuoteItem[]; downloadBytes: number; estimatedInstalledBytes: number; freeBytes: number; quoteId: string
  batches?: Quote[]
}
type DeleteResult = { removed: Cell[]; alreadyAbsent: Cell[]; freedBytes: number; cleanupPending: Cell[] }
type Saved = { level: number; center: [number, number]; selected: string[] }
type GridCell = Cell & { id: string; left: number; top: number; size: number }
type Tool = 'move' | 'block'
type SelectionKind = 'download' | 'delete'
type Gesture = {
  pointerId: number; x: number; y: number; lastX: number; lastY: number
  start: Cell | null; base: Set<string>; baseKind: SelectionKind | null; adding: boolean; moved: boolean; right: boolean; tool: Tool
}

const idFor = ({ x, y }: Cell) => `${GRID_ZOOM}/${x}/${y}`
function parseId(id: string): Cell | null {
  const match = /^8\/(\d{1,3})\/(\d{1,3})$/.exec(id)
  if (!match) return null
  const [, a, b] = match, x = Number(a), y = Number(b)
  return x < CELL_COUNT && y < CELL_COUNT ? { x, y } : null
}
function column(x: number) {
  let n = x + 1, text = ''
  while (n) { n--; text = String.fromCharCode(65 + n % 26) + text; n = Math.floor(n / 26) }
  return text
}
const labelFor = ({ x, y }: Cell) => column(x) + (y + 1)
const longitude = (x: number) => x / CELL_COUNT * 360 - 180
const latitude = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / CELL_COUNT))) * 180 / Math.PI
const ordered = (ids: Set<string>) => [...ids].map(parseId).filter((cell): cell is Cell => !!cell)
  .sort((a, b) => a.x - b.x || a.y - b.y)
function toCell(lng: number, lat: number): Cell | null {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng >= 180 || Math.abs(lat) > 85.05112878) return null
  return { x: Math.min(255, Math.floor((lng + 180) / 360 * CELL_COUNT)),
    y: Math.max(0, Math.min(255, Math.floor((1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * CELL_COUNT))) }
}
function readSaved(): Saved {
  const empty: Saved = { level: 1, center: [0, 0], selected: [] }
  if (typeof window === 'undefined') return empty
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (state.schema !== 1) return empty
    const center = Array.isArray(state.center) && state.center.length === 2 && state.center.every(Number.isFinite)
      && Math.abs(state.center[0]) <= 180 && Math.abs(state.center[1]) <= 85 ? state.center : empty.center
    return { level: Number.isInteger(state.level) ? Math.max(1, Math.min(4, state.level)) : 1, center,
      selected: Array.isArray(state.selected) ? state.selected.filter((id: unknown) => typeof id === 'string' && parseId(id)) : [] }
  } catch { return empty }
}
function errorMessage(error: unknown) {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') return error.response.data.message
  return 'The local map service could not complete this operation. Check its connection and try again.'
}
// Levels 2–4 correspond to the approved prototype's 1024/512/256 spans in a 4096-unit world.
function zoomFor(level: number, width: number, height: number) {
  return level === 1 ? Math.log2(Math.max(1, Math.min(width, height) - 24) / 512) : level + Math.log2(1000 / 512)
}
const stageLabel: Record<string, string> = {
  queued: 'Queued', downloading: 'Downloading', preparing: 'Preparing local maps', verifying: 'Verifying files',
  ready: 'Ready offline', completed: 'Ready offline', failed: 'Download failed', cancelled: 'Download cancelled',
}

export default function LocalDetailDownloads() {
  const client = useQueryClient()
  const [initial] = useState(readSaved)
  const [level, setLevel] = useState(initial.level)
  const [tool, setTool] = useState<Tool>('move')
  const [selected, setSelected] = useState(() => new Set(initial.selected))
  const [selectionKind, setSelectionKind] = useState<SelectionKind | null>(() => initial.selected.length ? 'download' : null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [areasPage, setAreasPage] = useState(0)
  const [undo, setUndo] = useState<{ ids: Set<string>; quote: Quote | null; kind: SelectionKind | null } | null>(null)
  const [busy, setBusy] = useState<'calculate' | 'download' | 'delete' | 'cancel' | 'retry' | 'discard' | null>(null)
  const [calculationProgress, setCalculationProgress] = useState<{ done: number; total: number } | null>(null)
  const [downloadReview, setDownloadReview] = useState<{ cells: Cell[]; quote: Quote; requestId: string } | null>(null)
  const [downloadError, setDownloadError] = useState('')
  const [discardReview, setDiscardReview] = useState<{ bytes: number; id: string; taskId: string } | null>(null)
  const [discardError, setDiscardError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteReview, setDeleteReview] = useState<{ cells: Cell[]; bytes: Map<string, number | undefined> } | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [cleanupPending, setCleanupPending] = useState<Cell[]>([])
  const [selectionNotice, setSelectionNotice] = useState('')
  const [notice, setNotice] = useState('')
  const [completedSquares, setCompletedSquares] = useState<number | null>(null)
  const [mapError, setMapError] = useState('')
  const [tick, setTick] = useState(0)
  const [hint, setHint] = useState(0)
  const [rectangle, setRectangle] = useState<CSSProperties | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const noteRef = useRef<HTMLButtonElement>(null)
  const levelRef = useRef(level), toolRef = useRef(tool), selectedRef = useRef(selected)
  const kindRef = useRef(selectionKind)
  const busyRef = useRef(busy)
  levelRef.current = level; toolRef.current = tool; selectedRef.current = selected
  kindRef.current = selectionKind
  busyRef.current = busy
  const gestureRef = useRef<Gesture | null>(null)
  const ignoreClickRef = useRef(0)
  const pinchRef = useRef<{ x: number; y: number; distance: number; zoom: number; anchor: maplibregl.LngLat } | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const completionTracker = useRef<RegionalCompletionState>(null)
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const calculationController = useRef<AbortController | null>(null)
  const calculationMounted = useRef(true)
  useEffect(() => {
    calculationMounted.current = true
    return () => {
      calculationMounted.current = false
      calculationController.current?.abort()
    }
  }, [])
  const inventory = useQuery<Inventory>({
    queryKey: QUERY_KEY, queryFn: async () => (await axios.get(API)).data,
    refetchInterval: (query) => {
      const current = query.state.data
      const active = [current?.job, current?.queue].some((task) => task && !['ready', 'completed', 'failed', 'cancelled'].includes(task.status))
      const pending = observeRegionalCompletion(completionTracker.current, current, query.state.status !== 'error').pendingVerification
      return active || pending ? 1500 : 8000
    },
    refetchOnWindowFocus: true,
  })
  const installed = useMemo(() => new Set((inventory.data?.cells ?? []).filter((cell) => cell.status === 'ready').map(idFor)), [inventory.data?.cells])
  const job = inventory.data?.job
  const queue = inventory.data?.queue
  const running = [job, queue].some((task) => !!task && !['ready', 'completed', 'failed', 'cancelled'].includes(task.status))
  const queued = useMemo(() => new Set(running ? (queue?.batches.flatMap((batch) => batch.cells) ?? job?.cells ?? []).filter((cell) => !installed.has(idFor(cell))).map(idFor) : []), [running, queue?.batches, job?.cells, installed])
  const installedRef = useRef(installed), queuedRef = useRef(queued), runningRef = useRef(running)
  installedRef.current = installed; queuedRef.current = queued; runningRef.current = running
  const unavailable = inventory.isError || inventory.data?.serviceUnavailable
  // Cached progress from a previous page visit is not a newly observed task.
  const completion = useMemo(() => observeRegionalCompletion(completionTracker.current, inventory.data,
    !unavailable && inventory.isFetchedAfterMount), [inventory.data, unavailable, inventory.isFetchedAfterMount])

  useEffect(() => {
    completionTracker.current = completion.state
    if (completion.clearConfirmation || completion.completedSquares !== null) {
      if (completionTimer.current) clearTimeout(completionTimer.current)
      completionTimer.current = null
      setCompletedSquares(completion.completedSquares)
    }
    if (completion.completedSquares !== null) {
      completionTimer.current = setTimeout(() => {
        setCompletedSquares(null)
        completionTimer.current = null
      }, 7000)
    }
  }, [completion])
  useEffect(() => () => { if (completionTimer.current) clearTimeout(completionTimer.current) }, [])

  useEffect(() => {
    if (inventory.data?.cleanupPending && busyRef.current !== 'delete') setCleanupPending(inventory.data.cleanupPending)
  }, [inventory.data?.cleanupPending])

  useEffect(() => {
    if (!inventory.data || busyRef.current === 'delete') return
    setSelected((old) => {
      const next = new Set([...old].filter((id) => !queued.has(id) && (kindRef.current === 'delete' ? installed.has(id) : !installed.has(id))))
      if (!next.size) { kindRef.current = null; setSelectionKind(null) }
      return next.size === old.size ? old : next
    })
  }, [installed, queued, inventory.data])

  const selectionHint = useCallback(() => {
    if (levelRef.current === 4 || runningRef.current) return
    if (hintTimer.current) clearTimeout(hintTimer.current)
    setHint((old) => old + 1)
    const note = noteRef.current
    if (note) { note.classList.remove('is-hint'); void note.offsetWidth; note.classList.add('is-hint') }
    hintTimer.current = setTimeout(() => noteRef.current?.classList.remove('is-hint'), 1200)
  }, [])

  useEffect(() => {
    const target = canvasRef.current, plot = plotRef.current
    if (!target || !plot) return
    let closed = false, redraw = 0
    const protocol = new Protocol()
    maplibregl.addProtocol('pmtiles', protocol.tile)
    const controller = new AbortController()
    let map: maplibregl.Map | undefined
    const changed = () => {
      if (!redraw) redraw = requestAnimationFrame(() => { redraw = 0; if (!closed) setTick((old) => old + 1) })
    }
    const position = () => {
      if (!map) return
      map.resize()
      map.jumpTo({ zoom: zoomFor(levelRef.current, plot.clientWidth, plot.clientHeight), bearing: 0, pitch: 0 })
    }
    const observer = new ResizeObserver(position)
    axios.get<StyleSpecification>('/api/maps/styles', { signal: controller.signal }).then(({ data }) => {
      if (closed) return
      if (data?.version !== 8 || !data.sources || !Array.isArray(data.layers)) throw new Error('Map style unavailable')
      map = new maplibregl.Map({ container: target, style: data, center: initial.center,
        zoom: zoomFor(initial.level, plot.clientWidth, plot.clientHeight), interactive: false,
        renderWorldCopies: false, attributionControl: { compact: true }, maxPitch: 0, minZoom: -3,
        maxZoom: zoomFor(4, plot.clientWidth, plot.clientHeight), pitch: 0, bearing: 0 })
      mapRef.current = map
      map.on('move', changed); map.on('resize', changed); map.on('load', changed)
      observer.observe(plot)
      changed()
    }).catch((error) => { if (!closed && !axios.isCancel(error)) setMapError('The local basemap is unavailable. Download the base map assets above, then reload this page.') })
    return () => {
      closed = true; controller.abort(); observer.disconnect(); cancelAnimationFrame(redraw)
      map?.remove(); mapRef.current = null; maplibregl.removeProtocol('pmtiles')
      if (hintTimer.current) clearTimeout(hintTimer.current)
    }
  }, [initial])

  useEffect(() => {
    const map = mapRef.current, plot = plotRef.current
    if (!map || !plot) return
    map.resize(); map.jumpTo({ zoom: zoomFor(level, plot.clientWidth, plot.clientHeight), bearing: 0, pitch: 0 })
    if (level !== 4) setTool('move')
    else noteRef.current?.classList.remove('is-hint')
  }, [level])

  useEffect(() => {
    const timer = setTimeout(() => {
      const map = mapRef.current, center = map?.getCenter()
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 1, level, center: center ? [center.lng, center.lat] : initial.center, selected: selectionKind === 'download' ? [...selected] : [] })) } catch { /* Selection remains usable without browser storage. */ }
    }, 180)
    return () => clearTimeout(timer)
  }, [selected, selectionKind, level, tick, initial.center])

  function goLevel(next: number) {
    if (busyRef.current === 'delete') return
    const value = Math.max(1, Math.min(4, next))
    levelRef.current = value; setLevel(value)
    if (value !== 4) { toolRef.current = 'move'; setTool('move') }
    const map = mapRef.current, plot = plotRef.current
    if (map && plot) map.jumpTo({ zoom: zoomFor(value, plot.clientWidth, plot.clientHeight) })
  }
  function world() {
    if (busyRef.current === 'delete') return
    goLevel(1); mapRef.current?.jumpTo({ center: [0, 0], bearing: 0, pitch: 0 })
  }
  function pan(x: number, y: number) {
    if (busyRef.current === 'delete') return
    const plot = plotRef.current
    if (plot) mapRef.current?.panBy([x * plot.clientWidth * .22, y * plot.clientHeight * .22], { duration: 0 })
  }
  function pointCell(clientX: number, clientY: number): Cell | null {
    const map = mapRef.current, bounds = plotRef.current?.getBoundingClientRect()
    if (!map || !bounds) return null
    const location = map.unproject([clientX - bounds.left, clientY - bounds.top])
    return toCell(location.lng, location.lat)
  }
  const updateSelection = useCallback((next: Set<string>, kind: SelectionKind | null = kindRef.current) => {
    const nextKind = next.size ? kind : null
    selectedRef.current = next; kindRef.current = nextKind; setSelected(next); setSelectionKind(nextKind)
  }, [])
  useEffect(() => {
    // A lost admission response must not leave a duplicate-looking confirmation
    // over a queue that the server has already persisted and started.
    if (!downloadReview || queue?.requestId !== downloadReview.requestId) return
    updateSelection(new Set()); setQuote(null); setUndo(null)
    setDownloadError(''); setDownloadReview(null)
  }, [queue?.requestId, downloadReview?.requestId, updateSelection])
  function conflictHint() {
    setSelectionNotice('Download and delete selections cannot be combined. Clear the current selection before choosing a different type of square.')
  }
  function toggle(cell: Cell | null) {
    if (levelRef.current !== 4) { selectionHint(); return }
    if (!cell || runningRef.current || busy) return
    const id = idFor(cell)
    if (queuedRef.current.has(id) || !inventory.data) return
    const next = new Set(selectedRef.current)
    const kind: SelectionKind = installedRef.current.has(id) ? 'delete' : 'download'
    if (next.size && kindRef.current !== kind) { conflictHint(); return }
    if (kindRef.current !== kind) setQuote(null)
    if (next.has(id)) next.delete(id); else next.add(id)
    setUndo(null); updateSelection(next, kind); setNotice(''); setSelectionNotice('')
  }
  function remove(id: string) {
    if (running || busy) return
    const next = new Set(selectedRef.current); next.delete(id); updateSelection(next); setUndo(null); setSelectionNotice('')
  }

  useEffect(() => {
    const plot = plotRef.current
    if (!plot) return
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      goLevel(levelRef.current + (event.deltaY < 0 ? 1 : -1))
    }
    const pair = (touches: TouchList) => ({ x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
      distance: Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY) })
    const start = (event: TouchEvent) => {
      if (busyRef.current === 'delete') return
      if (event.touches.length < 2 || !mapRef.current) return
      event.preventDefault()
      const gesture = gestureRef.current
      if (gesture) { updateSelection(new Set(gesture.base), gesture.baseKind); gestureRef.current = null; setRectangle(null) }
      const p = pair(event.touches), bounds = plot.getBoundingClientRect()
      pinchRef.current = { ...p, zoom: mapRef.current.getZoom(), anchor: mapRef.current.unproject([p.x - bounds.left, p.y - bounds.top]) }
      ignoreClickRef.current = performance.now() + 600
    }
    const move = (event: TouchEvent) => {
      if (busyRef.current === 'delete') return
      const pinch = pinchRef.current, map = mapRef.current
      if (!pinch || !map || event.touches.length < 2) return
      event.preventDefault()
      const p = pair(event.touches), desired = pinch.zoom + Math.log2(p.distance / Math.max(1, pinch.distance))
      const next = [1, 2, 3, 4].reduce((best, candidate) => Math.abs(zoomFor(candidate, plot.clientWidth, plot.clientHeight) - desired) < Math.abs(zoomFor(best, plot.clientWidth, plot.clientHeight) - desired) ? candidate : best, 1)
      const bounds = plot.getBoundingClientRect()
      levelRef.current = next; setLevel(next)
      map.jumpTo({ center: pinch.anchor, zoom: zoomFor(next, plot.clientWidth, plot.clientHeight) })
      map.panBy([plot.clientWidth / 2 - (p.x - bounds.left), plot.clientHeight / 2 - (p.y - bounds.top)], { duration: 0 })
      ignoreClickRef.current = performance.now() + 600
    }
    const end = (event: TouchEvent) => { if (pinchRef.current && event.touches.length < 2) { pinchRef.current = null; ignoreClickRef.current = performance.now() + 400 } }
    plot.addEventListener('wheel', wheel, { passive: false })
    plot.addEventListener('touchstart', start, { passive: false }); plot.addEventListener('touchmove', move, { passive: false })
    plot.addEventListener('touchend', end); plot.addEventListener('touchcancel', end)
    return () => { plot.removeEventListener('wheel', wheel); plot.removeEventListener('touchstart', start); plot.removeEventListener('touchmove', move); plot.removeEventListener('touchend', end); plot.removeEventListener('touchcancel', end) }
  }, [updateSelection])

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (busy === 'delete') return
    if ((event.target as Element).closest('.maplibregl-control-container')) return
    if (event.button !== 0 && event.button !== 2 || event.pointerType === 'touch' && toolRef.current === 'move') return
    const start = pointCell(event.clientX, event.clientY), base = new Set(selectedRef.current)
    gestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY,
      start, base, baseKind: kindRef.current, adding: !start || !base.has(idFor(start)), moved: false, right: event.button === 2, tool: toolRef.current }
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault()
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId || pinchRef.current) return
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
    if (!gesture.moved && Math.hypot(dx, dy) < 7) return
    gesture.moved = true; ignoreClickRef.current = performance.now() + 400
    if (gesture.right) return
    if (gesture.tool === 'move') {
      mapRef.current?.panBy([gesture.lastX - event.clientX, gesture.lastY - event.clientY], { duration: 0 })
      gesture.lastX = event.clientX; gesture.lastY = event.clientY
      return
    }
    if (levelRef.current !== 4 || running || busy || !gesture.start || !inventory.data) return
    const end = pointCell(event.clientX, event.clientY), bounds = plotRef.current?.getBoundingClientRect()
    if (!end || !bounds) return
    const next = new Set(gesture.base)
    let kind = gesture.baseKind
    for (let x = Math.min(gesture.start.x, end.x); x <= Math.max(gesture.start.x, end.x); x++) {
      for (let y = Math.min(gesture.start.y, end.y); y <= Math.max(gesture.start.y, end.y); y++) {
        const id = idFor({ x, y })
        if (queued.has(id)) continue
        const candidate: SelectionKind = installed.has(id) ? 'delete' : 'download'
        if (gesture.adding && kind && candidate !== kind) {
          updateSelection(new Set(gesture.base), gesture.baseKind); conflictHint(); setRectangle(null); return
        }
        if (gesture.adding) kind = candidate
        if (gesture.adding) next.add(id); else next.delete(id)
      }
    }
    setUndo(null); updateSelection(next, kind); setSelectionNotice('')
    setRectangle({ left: Math.min(gesture.x, event.clientX) - bounds.left, top: Math.min(gesture.y, event.clientY) - bounds.top,
      width: Math.abs(dx), height: Math.abs(dy) })
  }
  function pointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null; setRectangle(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    ignoreClickRef.current = performance.now() + 350
    if (event.type === 'pointercancel') { if (gesture.tool === 'block') updateSelection(new Set(gesture.base), gesture.baseKind); return }
    if (gesture.moved) return
    const cell = pointCell(event.clientX, event.clientY)
    if (gesture.right) { if (levelRef.current === 4 && cell) remove(idFor(cell)) }
    else toggle(cell)
  }

  const grid = useMemo(() => {
    const map = mapRef.current, plot = plotRef.current
    if (!map || !plot) return [] as GridCell[]
    const box = map.getBounds(), nw = toCell(Math.max(-180, box.getWest()), Math.min(85.0511287, box.getNorth())),
      se = toCell(Math.min(179.999999, box.getEast()), Math.max(-85.0511287, box.getSouth()))
    if (!nw || !se) return []
    let cells: Cell[] = []
    if (level === 1) cells = [...new Set([...installed, ...selected, ...queued])].map(parseId).filter((cell): cell is Cell => !!cell && cell.x >= nw.x && cell.x <= se.x && cell.y >= nw.y && cell.y <= se.y)
    else for (let y = nw.y; y <= se.y; y++) for (let x = nw.x; x <= se.x; x++) cells.push({ x, y })
    return cells.map((cell) => {
      const a = map.project([longitude(cell.x), latitude(cell.y)]), b = map.project([longitude(cell.x + 1), latitude(cell.y + 1)])
      return { ...cell, id: idFor(cell), left: a.x, top: a.y, size: b.x - a.x }
    })
  }, [level, tick, installed, selected, queued])
  const columns = useMemo(() => [...new Map(grid.map((cell) => [cell.x, cell])).values()].sort((a, b) => a.x - b.x), [grid])
  const rows = useMemo(() => [...new Map(grid.map((cell) => [cell.y, cell])).values()].sort((a, b) => a.y - b.y), [grid])
  const selectedCells = useMemo(() => ordered(selected), [selected])
  const deleting = selectionKind === 'delete'
  const installedById = useMemo(() => new Map((inventory.data?.cells ?? []).map((cell) => [idFor(cell), cell])), [inventory.data?.cells])
  const deleteBytesKnown = selectedCells.every((cell) => Number.isFinite(installedById.get(idFor(cell))?.installedBytes))
  const deleteBytes = selectedCells.reduce((sum, cell) => sum + (installedById.get(idFor(cell))?.installedBytes ?? 0), 0)
  const reviewCells = deleteReview?.cells ?? []
  const reviewBytesKnown = reviewCells.every((cell) => Number.isFinite(deleteReview?.bytes.get(idFor(cell))))
  const reviewBytes = reviewCells.reduce((sum, cell) => sum + (deleteReview?.bytes.get(idFor(cell)) ?? 0), 0)
  function reviewDeletion(cells: Cell[]) {
    setDeleteReview({ cells: cells.map((cell) => ({ ...cell })), bytes: new Map(cells.map((cell) => [idFor(cell), installedById.get(idFor(cell))?.installedBytes])) })
    setDeleteError(''); setDeleteOpen(true)
  }
  const quoted = useMemo(() => new Map((quote?.items ?? []).map((item) => [idFor(item), item])), [quote])
  const calculated = !!quote && selectedCells.length > 0 && selectedCells.every((cell) => quoted.has(idFor(cell)))
  const transferBytes = selectedCells.reduce((sum, cell) => sum + (quoted.get(idFor(cell))?.downloadBytes ?? 0), 0)
  const estimatedInstalled = selectedCells.reduce((sum, cell) => sum + (quoted.get(idFor(cell))?.estimatedInstalledBytes ?? 0), 0)
  const areasPageCount = Math.max(1, Math.ceil(selectedCells.length / 64))
  const currentAreasPage = Math.min(areasPage, areasPageCount - 1)
  const visibleSelectedCells = selectedCells.slice(currentAreasPage * 64, (currentAreasPage + 1) * 64)
  const visible = new Set(grid.map(({ id }) => id))
  const offscreen = [...selected].filter((id) => !visible.has(id)).length
  const squareKm = Math.round(40075.0166856 / 256 * Math.cos((mapRef.current?.getCenter().lat ?? 0) * Math.PI / 180))
  const recoveryCells = (queue?.batches.flatMap((batch) => batch.cells) ?? job?.cells ?? []).filter((cell) => !installed.has(idFor(cell)))
  const recoveryTask = queue ?? job
  const temporaryStorage = inventory.data?.temporaryStorage
  const recovery = recoveryTask?.recovery
  const stopped = !!recoveryTask && ['failed', 'cancelled'].includes(recoveryTask.status)
  const queueProgress = queue ? Math.min(100, Math.max(0, queue.completedCells / Math.max(1, queue.totalCells) * 100)) : undefined
  const downloadReviewItems = useMemo(() => new Map((downloadReview?.quote.items ?? []).map((item) => [idFor(item), item])), [downloadReview?.quote])
  const downloadReviewIds = useMemo(() => new Set((downloadReview?.cells ?? []).map(idFor)), [downloadReview?.cells])
  const downloadReviewBytes = (downloadReview?.cells ?? []).reduce((sum, cell) => sum + (downloadReviewItems.get(idFor(cell))?.downloadBytes ?? 0), 0)
  const downloadReviewInstalled = (downloadReview?.cells ?? []).reduce((sum, cell) => sum + (downloadReviewItems.get(idFor(cell))?.estimatedInstalledBytes ?? 0), 0)
  const downloadReviewBatches = (downloadReview?.quote.batches ?? (downloadReview ? [downloadReview.quote] : [])).map((batch) => ({
    cells: batch.items.filter((item) => downloadReviewIds.has(idFor(item))),
  })).filter((batch) => batch.cells.length)
  const downloadReviewBatchCount = downloadReviewBatches.length

  async function calculate(cells = selectedCells, recoveryId?: string) {
    if (!cells.length || deleting || running || busy || calculationController.current) return
    const controller = new AbortController()
    calculationController.current = controller
    const active = () => calculationMounted.current && !controller.signal.aborted
    setBusy('calculate'); setNotice(''); setQuote(null); setAreasPage(0)
    const batches: Quote[] = []
    try {
      if (recoveryId) {
        const { data } = await axios.post<{ cells: Cell[] }>(API + '/recalculate', { id: recoveryId }, { timeout: 120_000, signal: controller.signal })
        if (!active()) return
        if (!Array.isArray(data.cells) || data.cells.some((cell) => !Number.isInteger(cell.x) || !Number.isInteger(cell.y)
            || cell.x < 0 || cell.x >= CELL_COUNT || cell.y < 0 || cell.y >= CELL_COUNT)) throw new Error('Invalid remaining map selection')
        cells = ordered(new Set(data.cells.map(idFor)))
        updateSelection(new Set(cells.map(idFor)), 'download')
        if (!cells.length) { setNotice('All remaining squares are already installed.'); return }
      }
      const total = Math.ceil(cells.length / 64)
      setCalculationProgress({ done: 0, total })
      for (let offset = 0; offset < cells.length; offset += 64) {
        if (!active()) return
        const { data } = await axios.post<Quote>(API + '/calculate', { cells: cells.slice(offset, offset + 64) }, { timeout: 180_000, signal: controller.signal })
        if (!active()) return
        if (!Array.isArray(data.items) || typeof data.quoteId !== 'string') throw new Error('Invalid map estimate')
        batches.push(data); setCalculationProgress({ done: batches.length, total })
      }
      setQuote({ batches, quoteId: batches[0].quoteId, items: batches.flatMap((batch) => batch.items),
        downloadBytes: batches.reduce((sum, batch) => sum + batch.downloadBytes, 0),
        estimatedInstalledBytes: batches.reduce((sum, batch) => sum + batch.estimatedInstalledBytes, 0),
        freeBytes: Math.min(...batches.map((batch) => batch.freeBytes)) })
    } catch (error) { if (active() && !axios.isCancel(error)) setNotice(errorMessage(error)) }
    finally {
      if (calculationController.current === controller) calculationController.current = null
      if (active()) { setBusy(null); setCalculationProgress(null) }
    }
  }
  async function recalculateRemaining() {
    if (running || busy || !recoveryCells.length) return
    if (selected.size && deleting) { conflictHint(); return }
    const cells = recoveryCells.map((cell) => ({ ...cell }))
    updateSelection(new Set(cells.map(idFor)), 'download'); setUndo(null); setDownloadReview(null); setDownloadError('')
    await calculate(cells, recoveryTask?.id)
  }
  async function recalculateReview() {
    if (!downloadReview || running || busy) return
    const cells = downloadReview.cells.filter((cell) => !installed.has(idFor(cell)))
    updateSelection(new Set(cells.map(idFor)), 'download'); setDownloadReview(null); setDownloadError('')
    if (cells.length) await calculate(cells)
    else setNotice('All squares in this selection are already installed.')
  }
  async function download() {
    if (!downloadReview || running || busy) return
    setBusy('download'); setNotice(''); setDownloadError('')
    try {
      const wanted = new Set(downloadReview.cells.map(idFor))
      const batches = (downloadReview.quote.batches ?? [downloadReview.quote]).filter((batch) => batch.items.some((item) => wanted.has(idFor(item)))).map((batch) => ({
        quoteId: batch.quoteId, excludedCells: batch.items.filter((item) => !wanted.has(idFor(item))).map(idFor),
      }))
      await axios.post(API + '/queue', { batches, requestId: downloadReview.requestId }, { timeout: 120_000 })
      updateSelection(new Set()); setQuote(null); setUndo(null)
      setDownloadReview(null)
      await client.invalidateQueries({ queryKey: QUERY_KEY })
    } catch (error) {
      setDownloadError(errorMessage(error))
      // Inventory reconciles by the stable request ID, even when the POST's
      // acknowledgement was interrupted after the admission commit.
      await client.invalidateQueries({ queryKey: QUERY_KEY })
    }
    finally { setBusy(null) }
  }
  async function deleteSquares(cleanup = false) {
    const cells = cleanup ? cleanupPending : reviewCells
    // The reviewed cells are the user's authorization. Background inventory
    // updates may clear the live selection after another window removes them;
    // keep this exact snapshot actionable and let the API reconcile absence.
    if ((!cleanup && (!deleteOpen || !deleteReview)) || !cells.length || running || busy) return
    setBusy('delete'); setDeleteError(''); setNotice(''); setSelectionNotice('')
    const completed: Cell[] = [], pending = new Map(cleanupPending.map((cell) => [idFor(cell), cell]))
    try {
      // The API bounds each operation; larger selections are processed in safe batches.
      const data: DeleteResult = { removed: [], alreadyAbsent: [], freedBytes: 0, cleanupPending: [] }
      for (let offset = 0; offset < cells.length; offset += 64) {
        const response = await axios.post<DeleteResult>(API + '/delete', { cells: cells.slice(offset, offset + 64) }, { timeout: 120_000 })
        if (!Array.isArray(response.data.removed) || !Array.isArray(response.data.cleanupPending)) throw new Error('Invalid deletion result')
        data.removed.push(...response.data.removed); data.cleanupPending.push(...response.data.cleanupPending)
        const batch = cells.slice(offset, offset + 64)
        completed.push(...batch)
        for (const cell of batch) pending.delete(idFor(cell))
        for (const cell of response.data.cleanupPending) pending.set(idFor(cell), cell)
        setCleanupPending([...pending.values()])
        data.freedBytes += response.data.freedBytes ?? 0
      }
      if (!Array.isArray(data.removed) || !Array.isArray(data.cleanupPending)) throw new Error('Invalid deletion result')
      if (!cleanup) { updateSelection(new Set()); setQuote(null); setUndo(null) }
      setCleanupPending([...pending.values()]); setDeleteOpen(false)
      setNotice(pending.size
        ? `Squares were removed from the map, but disk cleanup is still pending for ${[...pending.values()].map(labelFor).join(', ')}. Some storage may not have been released. Retry cleanup to finish.`
        : `${cleanup ? 'Finished cleanup for' : 'Deleted'} ${cells.length} square${cells.length === 1 ? '' : 's'}. ${formatBytes(data.freedBytes, 1)} released. Worldwide packages are unchanged.`)
      await Promise.all([client.invalidateQueries({ queryKey: QUERY_KEY }), client.invalidateQueries({ queryKey: ['map-styles'] })])
    } catch (error) {
      await client.invalidateQueries({ queryKey: QUERY_KEY })
      setBusy(null)
      if (cleanup) setNotice(errorMessage(error))
      else {
        const refreshed = client.getQueryData<Inventory>(QUERY_KEY)
        const ready = new Set((refreshed?.cells ?? inventory.data?.cells ?? []).filter((cell) => cell.status === 'ready').map(idFor))
        const remaining = cells.filter((cell) => ready.has(idFor(cell)) && !completed.some((done) => idFor(done) === idFor(cell)))
        updateSelection(new Set(remaining.map(idFor)), 'delete')
        setDeleteReview({ cells: remaining, bytes: deleteReview?.bytes ?? new Map() })
        const message = errorMessage(error) + (completed.length ? ' Completed squares were removed; only remaining installed squares are selected.' : '')
        if (remaining.length) setDeleteError(message)
        else { setDeleteOpen(false); setNotice(message) }
      }
    }
    finally { setBusy(null) }
  }
  async function control(action: 'cancel' | 'retry') {
    if (!recoveryTask || busy) return
    setBusy(action); setNotice('')
    try { await axios.post(API + '/' + action, { id: recoveryTask.id }); await client.invalidateQueries({ queryKey: QUERY_KEY }) }
    catch (error) { setNotice(errorMessage(error)) }
    finally { setBusy(null) }
  }
  async function discardDownload() {
    if (!discardReview || busy || running || !stopped || !temporaryStorage?.canDiscard || temporaryStorage.activeProtected
        || discardReview.id !== temporaryStorage.discardId || discardReview.taskId !== recoveryTask?.id) return
    setBusy('discard'); setDiscardError(''); setNotice('')
    try {
      const { data } = await axios.post<{ freedBytes?: number }>(API + '/cleanup', { scope: 'saved-preparation', id: discardReview.id }, { timeout: 120_000 })
      setDiscardReview(null)
      setQuote(null); setDownloadReview(null); setUndo(null)
      setNotice(`Download discarded. ${formatBytes(data.freedBytes ?? 0, 1)} of temporary data released. Installed maps are preserved.`)
      await client.invalidateQueries({ queryKey: QUERY_KEY })
    } catch (error) {
      setDiscardError(errorMessage(error))
      await client.invalidateQueries({ queryKey: QUERY_KEY })
      const current = client.getQueryData<Inventory>(QUERY_KEY)
      // The worker may have completed the discard before its reply was lost.
      if (current && !current.serviceUnavailable && !current.job && !current.queue) {
        setDiscardReview(null)
        setQuote(null); setDownloadReview(null); setUndo(null)
        setNotice('Download discarded. Installed maps are preserved.')
      }
    }
    finally { setBusy(null) }
  }

  return (
    <section className="nomad-local-detail mt-8" id="local-detail-downloads" aria-label="Regional offline maps">
      <StyledSectionHeader title="Regional offline maps" />
      <div className="local-detail-bundle" aria-label="Included in every square">
        <span><IconSatellite size={17} /> Satellite</span><span><IconMountain size={17} /> Topography</span><span><IconMap size={17} /> Street</span>
        <small>One complete package · maximum detail</small>
      </div>
      <div className="local-detail-tools">
        <div><button type="button" aria-pressed={tool === 'move'} disabled={busy === 'delete'} onClick={() => setTool('move')}><IconHandStop size={17} /> Move map</button>
          <button type="button" aria-pressed={tool === 'block'} aria-disabled={level !== 4 || running} disabled={running || !!busy}
            aria-describedby="local-detail-zoom-note" onClick={() => { if (level !== 4) selectionHint(); else setTool('block') }}><IconSelect size={17} /> Select block</button></div>
        <div><button type="button" disabled={!selected.size || running || !!busy} onClick={() => { setUndo({ ids: new Set(selected), quote, kind: selectionKind }); updateSelection(new Set()); setQuote(null); setSelectionNotice('') }}>Clear selection</button>
          {undo && <button type="button" disabled={running || !!busy} onClick={() => { updateSelection(new Set([...undo.ids].filter((id) => !queued.has(id) && (undo.kind === 'delete' ? installed.has(id) : !installed.has(id)))), undo.kind); setQuote(undo.quote); setUndo(null); setSelectionNotice('') }}>Undo</button>}</div>
      </div>
      <div className="local-detail-map" data-level={level} data-selection={selectionKind ?? 'none'} data-testid="local-detail-map" role="group" aria-label="Regional map. Selection is available only at zoom 4. Drag or use the arrows to move."
        onKeyDown={(event) => {
          if (busy === 'delete') { event.preventDefault(); return }
          const direction: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
          if (direction[event.key]) { event.preventDefault(); pan(...direction[event.key]) }
          else if (event.key === '+' || event.key === '=') { event.preventDefault(); goLevel(level + 1) }
          else if (event.key === '-') { event.preventDefault(); goLevel(level - 1) }
          else if (event.key === 'Escape') setTool('move')
        }}>
        {level === 4 && <><div className="local-detail-columns" aria-hidden="true">{columns.map((cell) => <span key={cell.x} style={{ left: cell.left, width: cell.size }}>{column(cell.x)}</span>)}</div>
          <div className="local-detail-rows" aria-hidden="true">{rows.map((cell) => <span key={cell.y} style={{ top: cell.top, height: cell.size }}>{cell.y + 1}</span>)}</div><div className="local-detail-corner" /></>}
        <div className="local-detail-plot" ref={plotRef} data-tool={tool} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
          onContextMenu={(event) => event.preventDefault()} onClick={(event) => { if (!(event.target as Element).closest('.maplibregl-control-container') && level !== 4 && event.detail > 0 && performance.now() > ignoreClickRef.current) selectionHint() }}>
          <div ref={canvasRef} className="local-detail-canvas" />
          <div className="local-detail-grid">
            {grid.map((cell) => {
              const ready = installed.has(cell.id), downloading = queued.has(cell.id), active = selected.has(cell.id)
              const className = 'local-detail-cell' + (ready ? ' is-ready' + (active ? ' is-delete-selected' : '') : downloading ? ' is-queued' : active ? ' is-selected' : '')
              const style: CSSProperties = { left: cell.left, top: cell.top, width: cell.size, height: cell.size }
              const label = `${labelFor(cell)} · ${ready ? active ? 'Selected to delete' : 'Downloaded, select to delete' : downloading ? 'Downloading' : active ? 'Selected to download' : 'Available to download'}`
              return level === 4 && !downloading
                ? <button key={cell.id} type="button" className={className} data-cell={cell.id} aria-label={label} aria-pressed={active} disabled={running || !!busy || !inventory.data} style={style}
                  onClick={(event) => { if (event.detail === 0 || performance.now() > ignoreClickRef.current) toggle(cell) }}>{ready ? <><IconCheck size={15} aria-hidden="true" />{active ? labelFor(cell) : ''}</> : active ? labelFor(cell) : ''}</button>
                : <div key={cell.id} role="img" aria-label={label} className={className} data-cell={cell.id} style={style}>{level === 4 ? ready ? '✓' : downloading ? '…' : '' : ''}</div>
            })}
          </div>
          {rectangle && <div className="local-detail-rectangle" style={rectangle} />}
        </div>
        <button type="button" id="local-detail-zoom-note" ref={noteRef} className="local-detail-note" disabled={level === 4 || busy === 'delete'} onClick={() => goLevel(4)}
          aria-label={level === 4 ? `Squares approximately ${squareKm} by ${squareKm} kilometers here` : 'Zoom to 4 to select squares'}>
          {level === 4 ? `Squares ≈ ${squareKm} × ${squareKm} km here` : 'Zoom to 4 to select squares'}
        </button>
        <div className="local-detail-zoom"><button type="button" aria-label="Zoom in regional map" disabled={level === 4 || busy === 'delete'} onClick={() => goLevel(level + 1)}><IconPlus size={17} /></button>
          <span aria-live="polite">Zoom {level}/4</span><button type="button" aria-label="Zoom out regional map" disabled={level === 1 || busy === 'delete'} onClick={() => goLevel(level - 1)}><IconMinus size={17} /></button></div>
        <div className="local-detail-directions" role="group" aria-label="Move without dragging">
          <button type="button" data-direction="north" aria-label="Move regional map north" disabled={busy === 'delete'} onClick={() => pan(0, -1)}><IconArrowUp size={17} /></button>
          <button type="button" data-direction="west" aria-label="Move regional map west" disabled={busy === 'delete'} onClick={() => pan(-1, 0)}><IconArrowLeft size={17} /></button>
          <button type="button" data-direction="world" aria-label="Show whole world" disabled={busy === 'delete'} onClick={world}><IconWorld size={17} /></button>
          <button type="button" data-direction="east" aria-label="Move regional map east" disabled={busy === 'delete'} onClick={() => pan(1, 0)}><IconArrowRight size={17} /></button>
          <button type="button" data-direction="south" aria-label="Move regional map south" disabled={busy === 'delete'} onClick={() => pan(0, 1)}><IconArrowDown size={17} /></button>
        </div>
      </div>
      <p className="local-detail-guide">{level !== 4 ? 'Move freely. Use Zoom to 4 to select squares; existing selections are kept.' : tool === 'block'
        ? 'Click or drag a rectangle to select one type: available squares to download, or green squares to delete. Right-click deselects.'
        : 'Drag to move · click grey squares to download or green squares to delete · right-click deselects · use two fingers to move or zoom on touch screens.'}</p>
      <span className="local-detail-sr-only" role="status">{hint ? `Selection is available at zoom 4. Use the highlighted Zoom to 4 button. ${hint % 2 ? '' : 'Zoom in to select.'}` : ''}</span>
      <div className="local-detail-legend"><span><b />Available to download</span><span><b className="is-ready" />✓ Downloaded · select to delete</span><span><b className="is-selected" />Selected to download</span><span><b className="is-delete-selected" />Selected to delete</span></div>
      {selectionNotice && <p className="local-detail-selection-notice" role="status">{selectionNotice}</p>}
      {mapError && <p className="local-detail-warning" role="status">{mapError}</p>}
      {unavailable && <p className="local-detail-warning" role="status">The regional downloader is unavailable. Installed squares remain available offline. Start the downloader to calculate or download more areas.</p>}
      <div className="local-detail-calculate"><div aria-live="polite"><strong>{selected.size} square{selected.size === 1 ? '' : 's'} selected{selected.size > 0 ? deleting ? ' to delete' : ' to download' : ''}</strong>{offscreen > 0 && <small>{offscreen} outside this view</small>}{deleting && <small>{deleteBytesKnown ? `${formatBytes(deleteBytes, 1)} installed` : 'Installed size unavailable'}</small>}</div>
        {selected.size > 0 && (deleting
          ? <button type="button" className="local-detail-danger" data-testid="local-detail-selection-action" data-action="delete" disabled={running || !!busy || !!unavailable} onClick={() => reviewDeletion(selectedCells)}><IconTrash size={17} />Delete</button>
          : <button type="button" className="local-detail-primary" data-testid="local-detail-selection-action" data-action="calculate" disabled={running || !!busy || !!unavailable} onClick={() => calculate()}>{busy === 'calculate' ? `Calculating ${Math.min((calculationProgress?.done ?? 0) + 1, calculationProgress?.total ?? 1)}/${calculationProgress?.total ?? 1}…` : 'Calculate'}</button>)}</div>
      {calculationProgress && <p className="local-detail-guide" role="status">Checking source estimates · {calculationProgress.done} of {calculationProgress.total} batches complete. Nothing downloads until you confirm. Keep this page open while estimates are calculated.</p>}
      {quote && selected.size > 0 && !deleting && <section className="local-detail-results" aria-label="Areas to download">
        <header><h3>Areas to download</h3><span>{calculated ? 'Estimated sizes' : 'Selection changed · calculate again'}</span></header>
        <div className="local-detail-list-heading" aria-hidden="true">{[0, 1].map((index) => <div key={index}><span>Area</span><span>Estimated download</span><span /></div>)}</div>
        <ul>{visibleSelectedCells.map((cell) => {
          const item = quoted.get(idFor(cell))
          return <li key={idFor(cell)} data-area={labelFor(cell)}><strong>{labelFor(cell)}</strong><span>{item ? formatBytes(item.downloadBytes, 1) : 'Not calculated'}</span>
            <button type="button" aria-label={`Remove ${labelFor(cell)} from download`} disabled={running || !!busy} onClick={() => remove(idFor(cell))}><IconX size={16} /></button></li>
        })}</ul>
        {areasPageCount > 1 && <nav className="local-detail-area-pages" aria-label="Areas to download pages">
          <span>Areas {currentAreasPage * 64 + 1}–{Math.min((currentAreasPage + 1) * 64, selectedCells.length)} of {selectedCells.length}</span>
          <div><button type="button" disabled={currentAreasPage === 0 || !!busy} onClick={() => setAreasPage(currentAreasPage - 1)}>Previous areas</button>
            <button type="button" disabled={currentAreasPage + 1 >= areasPageCount || !!busy} onClick={() => setAreasPage(currentAreasPage + 1)}>Next areas</button></div>
        </nav>}
        <div className="local-detail-total"><div aria-live="polite"><small>Total download</small><strong>{calculated ? formatBytes(transferBytes, 2) : '—'}</strong>
          {calculated && <small>Estimated installed: {formatBytes(estimatedInstalled, 1)} · Free disk: {formatBytes(quote.freeBytes, 1)}<br />{(quote.batches ?? [quote]).filter((batch) => batch.items.some((item) => selected.has(idFor(item)))).length} automatic batch{(quote.batches ?? [quote]).filter((batch) => batch.items.some((item) => selected.has(idFor(item)))).length === 1 ? '' : 'es'} · one confirmation</small>}</div>
          <button type="button" className="local-detail-primary" disabled={!calculated || running || !!busy || !!unavailable} onClick={() => { setDownloadError(''); setDownloadReview({ cells: selectedCells.map((cell) => ({ ...cell })), quote, requestId: admissionRequestId() }) }}>Review download</button></div>
      </section>}
      {recoveryTask && (running || stopped || completion.pendingVerification) && <section className="local-detail-job" aria-label="Regional map download progress" data-testid="local-detail-queue" aria-live="polite">
        {completion.pendingVerification ? <><div><strong>Verifying offline maps</strong></div><p>Checking installed squares…</p></> : <>
        <div><strong>{stageLabel[recoveryTask.status] ?? 'Working'}{queue ? ` · ${queue.totalCells} squares` : ` · ${job?.cells.length ?? 0} squares`}</strong>
          {queue && <span>{queue.completedCells}/{queue.totalCells} verified</span>}</div>
        {queue && <><progress value={queueProgress} max={100} aria-label="Verified squares in download queue" />
          <p>{Math.max(0, queue.totalCells - queue.completedCells)} squares remaining · Batch {Math.min(queue.batchIndex + 1, queue.totalBatches)} of {queue.totalBatches}</p>
          <details className="local-detail-batches"><summary>Batch details</summary><ol>{queue.batches.map((batch, index) => <li key={batch.quoteId + '-' + index}><span>Batch {index + 1} · {batch.cells.length} squares</span><strong>{stageLabel[batch.status] ?? batch.status}</strong></li>)}</ol></details>
          {running && <p>The queue is saved on this NOMAD and continues with this page closed. After a restart, an interrupted queue stops safely; use recovery below to continue. Verified squares stay available.</p>}</>}
        {job && <div className="local-detail-current-batch"><div><span>{queue ? 'Current batch' : 'Download'} · {stageLabel[job.stage] ?? stageLabel[job.status] ?? job.stage}</span><span>{Number.isFinite(job.progress) ? `${Math.min(100, Math.max(0, job.progress!)).toFixed(0)}%` : ''}</span></div>
          <progress value={Math.min(100, Math.max(0, job.progress ?? 0))} max={100} aria-label="Current batch progress" />
          <p>{formatBytes(job.downloadedBytes ?? job.bytesDownloaded ?? 0, 1)} / {formatBytes(job.totalBytes ?? 0, 1)}{running && (job.speedBytesPerSecond ?? 0) > 0 ? ` · ${formatBytes(job.speedBytesPerSecond!, 1)}/s` : running && (job.status === 'downloading' || /^downloading\b/i.test(job.stage)) ? ' · Waiting for data' : ''}</p></div>}
        {(recoveryTask.error || recoveryTask.message || job?.error || job?.message) && <p className={recoveryTask.status === 'failed' ? 'local-detail-warning' : ''}>{recoveryTask.error || recoveryTask.message || job?.error || job?.message}</p>}
        {stopped && recovery?.reason && <p className="local-detail-recovery-note">{recovery.reason}</p>}
        <div className="local-detail-recovery-actions">
          {running && <button type="button" disabled={!!busy || !!unavailable} onClick={() => control('cancel')}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel download'}</button>}
          {stopped && recoveryCells.length > 0 && <>
            {(recovery?.canRetry !== false || recovery?.canPrepareOffline) && <button type="button" disabled={!!busy || !!unavailable} onClick={() => control('retry')}>{busy === 'retry' ? 'Resuming…' : recovery?.canPrepareOffline ? 'Finish preparation offline' : 'Retry saved preparation'}</button>}
            <button type="button" disabled={!!busy || !!unavailable} onClick={recalculateRemaining}>Recalculate remaining squares</button>
            <p>{recovery?.canPrepareOffline ? 'Required source ranges are saved locally. NOMAD will verify them before preparing the remaining maps; no new download is needed.' : 'Recalculation needs internet access. It refreshes source revisions and estimates only the remaining squares; verified maps are preserved.'}</p>
          </>}
          {stopped && temporaryStorage?.canDiscard && temporaryStorage.discardId && <button type="button"
            className="local-detail-danger" disabled={!!busy || !!unavailable || temporaryStorage.activeProtected}
            onClick={() => { setDiscardError(''); setDiscardReview({ bytes: temporaryStorage.savedPreparationBytes,
              id: temporaryStorage.discardId!, taskId: recoveryTask.id }) }}>
            <IconTrash size={16} aria-hidden="true" />Discard download
          </button>}
        </div>
        </>}
      </section>}
      {completedSquares !== null && <p className="local-detail-success" role="status" aria-live="polite" aria-atomic="true" data-testid="local-detail-completed">
        <IconCheck size={17} aria-hidden="true" />{completedSquares} square{completedSquares === 1 ? '' : 's'} ready offline
      </p>}
      {notice && <p className="local-detail-warning" role="status">{notice}</p>}
      {cleanupPending.length > 0 && <button type="button" disabled={running || !!busy || !!unavailable} onClick={() => deleteSquares(true)}>{busy === 'delete' ? 'Cleaning up…' : 'Retry cleanup'}</button>}
      <StyledModal open={!!downloadReview} title={`Download ${downloadReview?.cells.length ?? 0} regional squares?`}
        confirmText={downloadError ? 'Retry queue admission' : 'Confirm download'} confirmLoading={busy === 'download'}
        confirmDisabled={!!busy || running || !!unavailable} cancelText={busy === 'download' ? '' : 'Cancel'}
        onClose={() => { if (!busy) setDownloadReview(null) }} onCancel={() => { if (!busy) setDownloadReview(null) }} onConfirm={download}>
        <div className="local-detail-download-review text-text-secondary" data-testid="local-detail-download-review">
          <p>{downloadReviewBatchCount} automatic batch{downloadReviewBatchCount === 1 ? '' : 'es'} · {formatBytes(downloadReviewBytes, 1)} estimated download · {formatBytes(downloadReviewInstalled, 1)} estimated installed.</p>
          <ol aria-label="Download batches">{downloadReviewBatches.map((batch, index) => <li key={index}><strong>Batch {index + 1}</strong><span>{batch.cells.length} square{batch.cells.length === 1 ? '' : 's'} · {formatBytes(batch.cells.reduce((sum, cell) => sum + cell.downloadBytes, 0), 1)}</span></li>)}</ol>
          <p>NOMAD will save the entire queue before starting, then download, prepare and verify each batch in order. You can close this page after confirmation. A restart safely pauses interrupted work for recovery.</p>
          <p>Temporary conversion files need additional disk space. NOMAD checks free space before each batch. Already verified maps are preserved.</p>
          {downloadError && <><p role="alert" className="text-desert-red">{downloadError}</p><button type="button" disabled={!!busy || running || !!unavailable} onClick={recalculateReview}>Recalculate remaining squares</button></>}
        </div>
      </StyledModal>
      <StyledModal open={!!discardReview} title="Discard download?"
        confirmText="Discard download" confirmVariant="danger" confirmLoading={busy === 'discard'}
        confirmDisabled={!!busy || !!unavailable || running || !!temporaryStorage?.activeProtected
          || !temporaryStorage?.canDiscard || discardReview?.id !== temporaryStorage?.discardId
          || discardReview?.taskId !== recoveryTask?.id || !stopped} cancelText={busy === 'discard' ? '' : 'Cancel'}
        onClose={() => { if (!busy) setDiscardReview(null) }} onCancel={() => { if (!busy) setDiscardReview(null) }} onConfirm={discardDownload}>
        <div className="local-detail-discard-review text-text-secondary" data-testid="local-detail-discard-review">
          <p>This removes the unfinished download and its saved preparation. You will no longer be able to resume it from these files.</p>
          <p>Up to {formatBytes(discardReview?.bytes ?? 0, 1)} of temporary data will be released. Downloading these areas again may need internet access.</p>
          <p>Installed regional squares, worldwide packages and Pins are preserved.</p>
          {(running || temporaryStorage?.activeProtected) && <p role="status">Wait until the current task stops before discarding it.</p>}
          {(discardReview?.id !== temporaryStorage?.discardId || discardReview?.taskId !== recoveryTask?.id) && <p role="status">The download changed. Close this dialog and review it again before discarding.</p>}
          {discardError && <p role="alert" className="text-desert-red">{discardError}</p>}
        </div>
      </StyledModal>
      <StyledModal open={deleteOpen} title={`Delete ${reviewCells.length} regional square${reviewCells.length === 1 ? '' : 's'}?`}
        confirmText={deleteError ? 'Retry deletion' : 'Delete squares'} confirmVariant="danger" confirmLoading={busy === 'delete'}
        confirmDisabled={running || !!busy || !reviewCells.length || !!unavailable} cancelText={busy === 'delete' ? '' : 'Cancel'}
        onClose={() => { if (!busy) setDeleteOpen(false) }} onCancel={() => { if (!busy) setDeleteOpen(false) }} onConfirm={() => deleteSquares()}>
        <div className="local-detail-delete-review text-text-secondary" data-testid="local-detail-delete-review">
          <p>This removes only the selected regional map files. Worldwide packages and Pins are preserved.</p>
          <ul aria-label="Squares to delete">{reviewCells.map((cell) => <li key={idFor(cell)}><strong>{labelFor(cell)}</strong><span>{Number.isFinite(deleteReview?.bytes.get(idFor(cell))) ? formatBytes(deleteReview!.bytes.get(idFor(cell))!, 1) : 'Size unavailable'}</span></li>)}</ul>
          <p>{reviewBytesKnown ? `${formatBytes(reviewBytes, 1)} installed data will be removed.` : 'The installed size is unavailable.'} You can download these squares again later.</p>
          {busy === 'delete' && <p role="status">Deleting regional files… Keep this page open.</p>}
          {running && <p role="status">Wait for the current download to finish or cancel it before deleting squares.</p>}
          {deleteError && <p role="alert" className="text-desert-red">{deleteError}</p>}
        </div>
      </StyledModal>
    </section>
  )
}
