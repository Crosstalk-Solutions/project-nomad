import { IconChevronDown, IconChevronUp, IconGlobe, IconMap, IconMountain, IconSatellite } from '@tabler/icons-react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useControl } from 'react-map-gl/maplibre'

export type MapLayerMode = 'street' | 'aerial' | 'topographic' | 'blue-marble'
type OfflineMode = Exclude<MapLayerMode, 'street'>
export type LayerAvailability = Record<Exclude<MapLayerMode, 'street' | 'blue-marble'>, boolean>

type LayerSelectorProps = {
  mode: MapLayerMode
  onModeChange: (mode: MapLayerMode) => void
  availability: LayerAvailability
  outsideCoverage: boolean
  streetOverlay: boolean
  onStreetOverlayChange: (enabled: boolean) => void
  onGoToCoverage: () => void
  missingMode?: OfflineMode
  checkingAvailability?: boolean
  mapDataWarning?: string
  archiveUnavailable?: boolean
  setupEnabled?: boolean
  onRetryData: () => void
  onKeepStreet: () => void
  blueMarbleAvailable?: boolean
  blueMarbleMonth?: number
  blueMarbleZoom?: number
  onBlueMarbleMonthChange?: (month: number) => void
  worldOverview?: boolean
  worldTopographyZoom?: number
  worldSatelliteZoom?: number
  offerWorldSatellite?: boolean
  elevationOnStreet?: boolean
  elevation?: {
    availability: 'checking' | 'unavailable' | 'not-installed' | 'installed'
  }
}

const layerOptions = [
  { mode: 'street', label: 'Street', icon: IconMap },
  { mode: 'aerial', label: 'Satellite', icon: IconSatellite },
  { mode: 'topographic', label: 'Topography', icon: IconMountain },
  { mode: 'blue-marble', label: 'Blue Marble', icon: IconGlobe },
] as const

const setupLinks: Record<OfflineMode, { label: string; href: string }> = {
  aerial: { label: 'Download world satellite', href: '/settings/maps?pack=satellite#world-offline-satellite' },
  topographic: { label: 'Download Earth Relief', href: '/settings/maps?pack=topography#world-offline-topography' },
  'blue-marble': { label: 'Download all 12 months', href: '/settings/maps?pack=blue-marble#world-offline-blue-marble' },
}

function LayerSetupLink({ mode }: { mode: OfflineMode }) {
  const { label, href } = setupLinks[mode]
  return <a href={href} className="inline-flex min-h-9 items-center rounded text-xs font-semibold text-desert-orange underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary">{label}</a>
}

const months = [
  'December', 'November', 'October', 'September', 'August', 'July',
  'June', 'May', 'April', 'March', 'February', 'January',
]

const mapNavbar = () => document.querySelector<HTMLElement>('[data-nomad-map-navbar]')

function navbarBottom(navbar: HTMLElement | null) {
  if (!navbar || (document.fullscreenElement && !document.fullscreenElement.contains(navbar))) return 0
  return navbar.getBoundingClientRect().bottom
}

export function NorthUpNavigation() {
  useControl(({ mapLib }) => {
    const navigation = new mapLib.NavigationControl({ showCompass: false })
    return {
      onAdd(map: MapLibreMap) {
        const group = navigation.onAdd(map)
        group.classList.add('nomad-map-navigation')
        const north = document.createElement('div')
        north.className = 'nomad-north-indicator'
        north.setAttribute('role', 'img')
        north.setAttribute('aria-label', 'North is up')
        north.title = 'North is up'
        north.textContent = 'N'
        group.append(north)
        return group
      },
      onRemove() {
        navigation.onRemove()
      },
    }
  }, { position: 'top-right' })
  return null
}

function positionPopover(host: HTMLElement, trigger: HTMLElement, popover: HTMLElement, navbar: HTMLElement | null) {
  const map = host.getBoundingClientRect()
  const button = trigger.getBoundingClientRect()
  const viewport = window.visualViewport
  const gap = 8
  const left = Math.max(map.left, viewport?.offsetLeft ?? 0) + gap
  const top = Math.max(map.top, navbarBottom(navbar), viewport?.offsetTop ?? 0) + gap
  const right = Math.min(map.right, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth)) - gap
  const bottom = Math.min(map.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)) - gap
  const preferredWidth = Math.max(0, Math.min(256, right - left))
  const visibleHeight = Math.max(0, bottom - top)
  if (!preferredWidth || !visibleHeight) {
    popover.style.visibility = 'hidden'
    return
  }
  popover.style.width = preferredWidth + 'px'
  popover.style.maxHeight = visibleHeight + 'px'

  const spaceBelow = bottom - button.bottom - gap
  const spaceAbove = button.top - top - gap
  const spaceBeside = button.left - left - gap
  const fitsBelow = popover.scrollHeight <= spaceBelow
  const beside = !fitsBelow && spaceBeside >= 176
  const above = !fitsBelow && !beside && spaceAbove > spaceBelow
  const width = beside ? Math.min(preferredWidth, spaceBeside) : preferredWidth
  const maxHeight = beside ? visibleHeight : Math.min(visibleHeight, above ? spaceAbove : spaceBelow)
  if (maxHeight <= 0) {
    popover.style.visibility = 'hidden'
    return
  }
  popover.style.width = width + 'px'
  popover.style.maxHeight = maxHeight + 'px'
  const height = Math.min(maxHeight, popover.scrollHeight)
  const x = beside ? button.left - gap - width : button.right - width
  const y = beside ? button.top : above ? button.top - gap - height : button.bottom + gap

  popover.style.left = (Math.max(left, Math.min(right - width, x)) - map.left) + 'px'
  popover.style.top = (Math.max(top, Math.min(bottom - height, y)) - map.top) + 'px'
  popover.style.visibility = 'visible'
}

export default function LayerSelector({
  mode,
  onModeChange,
  availability,
  outsideCoverage,
  streetOverlay,
  onStreetOverlayChange,
  onGoToCoverage,
  missingMode,
  checkingAvailability = false,
  mapDataWarning,
  archiveUnavailable = false,
  setupEnabled = false,
  onRetryData,
  onKeepStreet,
  blueMarbleAvailable = false,
  blueMarbleMonth = 12,
  blueMarbleZoom,
  onBlueMarbleMonthChange,
  worldOverview = false,
  worldTopographyZoom,
  worldSatelliteZoom,
  offerWorldSatellite = false,
  elevationOnStreet = false,
  elevation,
}: LayerSelectorProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const activeLabelId = panelId + '-active'
  const monthSelectId = panelId + '-month'
  const isRaster = mode !== 'street'
  const isBlueMarble = mode === 'blue-marble'
  const featureAvailable = onBlueMarbleMonthChange !== undefined
  const activeBase = layerOptions.find((option) => option.mode === mode)?.label
  const monthIndex = months.length - blueMarbleMonth
  const monthLabel = months[monthIndex] + ' 2004'
  const date = isBlueMarble && blueMarbleAvailable ? ' · ' + monthLabel : ''
  const installedWorldZoom = worldSatelliteZoom ?? worldTopographyZoom
  const scope = isBlueMarble && blueMarbleZoom !== undefined ? ' · Native tiles through z' + blueMarbleZoom
    : installedWorldZoom !== undefined ? ' · World through zoom ' + installedWorldZoom
    : worldOverview && mode === 'topographic' ? ' · World overview' : ''
  const activeLabel = (isRaster && (streetOverlay || elevationOnStreet) ? 'Street + ' : '') + activeBase + date + scope
  const missingLabel = layerOptions.find((option) => option.mode === missingMode)?.label
  const notice = mapDataWarning ?? (missingLabel ? missingLabel + ' unavailable. Showing Street.'
    : archiveUnavailable ? 'Some offline map data for this layer is unavailable.'
    : outsideCoverage ? (streetOverlay ? 'Outside coverage for this layer. Showing Street.' : 'Outside coverage for this layer.')
    : undefined)
  const showNotice = !!notice
  const popoverVisible = open || showNotice

  const { container, popupHost } = useControl(() => {
    const element = document.createElement('div')
    const popup = document.createElement('div')
    let cleanupNavbar: (() => void) | undefined
    element.className = 'maplibregl-ctrl nomad-layer-control'
    popup.className = 'nomad-layer-popup-host'
    return {
      container: element,
      popupHost: popup,
      onAdd(map: { getContainer(): HTMLElement }) {
        const host = map.getContainer()
        const navbar = mapNavbar()
        const updateNavbar = () => {
          const bottom = Math.max(0, navbarBottom(navbar) - host.getBoundingClientRect().top)
          host.style.setProperty('--nomad-map-navbar-bottom', bottom + 'px')
        }
        const observer = new ResizeObserver(updateNavbar)
        observer.observe(host)
        if (navbar) observer.observe(navbar)
        document.addEventListener('fullscreenchange', updateNavbar)
        updateNavbar()
        cleanupNavbar = () => {
          observer.disconnect()
          document.removeEventListener('fullscreenchange', updateNavbar)
          host.style.removeProperty('--nomad-map-navbar-bottom')
        }
        host.append(popup)
        return element
      },
      onRemove() {
        cleanupNavbar?.()
        popup.remove()
        element.remove()
      },
    }
  }, { position: 'top-right' })

  useLayoutEffect(() => {
    if (!popoverVisible || !triggerRef.current || !popoverRef.current) return
    const trigger = triggerRef.current
    const popover = popoverRef.current
    const navbar = mapNavbar()
    const update = () => positionPopover(popupHost, trigger, popover, navbar)
    const observer = new ResizeObserver(update)
    observer.observe(popupHost)
    observer.observe(trigger)
    observer.observe(popover)
    if (navbar) observer.observe(navbar)
    update()
    document.addEventListener('fullscreenchange', update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      observer.disconnect()
      document.removeEventListener('fullscreenchange', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [popupHost, popoverVisible])

  useEffect(() => {
    if (!open) return
    const checked = popupHost.querySelector<HTMLInputElement>('input:checked:not(:disabled)')
    checked?.focus({ preventScroll: true })
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.contains(event.target) && !popupHost.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [container, open, popupHost])

  function handleEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !open) return
    event.stopPropagation()
    setOpen(false)
    triggerRef.current?.focus()
  }

  function installed(option: MapLayerMode) {
    if (option === 'street') return true
    return option === 'blue-marble' ? blueMarbleAvailable : availability[option]
  }

  return (
    <>
      {createPortal(
        <button
          ref={triggerRef}
          type="button"
          aria-label="Layers"
          title="Layers"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-describedby={activeLabelId}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={handleEscape}
          className="nomad-layer-trigger text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-desert-orange"
        >
          <IconMap size={18} aria-hidden="true" />
          <span id={activeLabelId} className="sr-only">{activeLabel}</span>
        </button>,
        container
      )}
      {createPortal(
        popoverVisible && (
          <div ref={popoverRef} className="nomad-layer-popover space-y-2 p-1 font-sans" onKeyDown={handleEscape}>
            {open && (
              <section id={panelId} aria-label="Layers" className="rounded-lg border border-border-subtle bg-surface-primary p-1.5 shadow-lg">
                <div className="px-2.5 pt-1 pb-2">
                  <h2 className="text-sm font-semibold text-text-primary">Layers</h2>
                  <p className="text-xs text-text-secondary">{activeLabel}</p>
                </div>
                <fieldset aria-label="Map layers" className="min-w-0">
                  {layerOptions.filter((option) => featureAvailable || option.mode !== 'blue-marble').map(({ mode: optionMode, label, icon: Icon }) => {
                    const available = installed(optionMode)
                    const descriptionId = panelId + '-' + optionMode + '-unavailable'
                    return (
                      <div
                        key={optionMode}
                        className="rounded text-sm text-text-primary has-[:checked]:bg-surface-secondary has-[:enabled]:hover:bg-surface-secondary"
                      >
                        <label className="flex min-h-10 items-center gap-2 px-2.5 py-1.5 has-[:disabled]:cursor-not-allowed has-[:enabled]:cursor-pointer">
                          <input
                            type="radio"
                            name={panelId}
                            value={optionMode}
                            checked={mode === optionMode}
                            disabled={!available}
                            aria-label={label}
                            aria-describedby={available ? undefined : descriptionId}
                            onChange={() => onModeChange(optionMode)}
                            className="size-4 shrink-0 accent-desert-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-desert-orange"
                          />
                          <Icon size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block">{label}</span>
                            {!available && (
                              <span id={descriptionId} className="block text-xs text-text-secondary">
                                {checkingAvailability ? 'Checking offline maps…' : mapDataWarning || (archiveUnavailable && optionMode === missingMode) ? 'Unavailable' : 'Not installed'}
                              </span>
                            )}
                          </span>
                        </label>
                        {!available && !checkingAvailability && !mapDataWarning && setupEnabled && optionMode !== 'street' && (
                          <div className="ml-14 mr-2"><LayerSetupLink mode={optionMode} /></div>
                        )}
                      </div>
                    )
                  })}
                </fieldset>
                {isBlueMarble && blueMarbleAvailable && (
                  <div className="mt-1 space-y-1 border-t border-border-subtle px-2.5 pt-2 pb-1 text-sm text-text-primary">
                    <label htmlFor={monthSelectId}>Month</label>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <select
                        id={monthSelectId}
                        value={blueMarbleMonth}
                        onChange={(event) => onBlueMarbleMonthChange?.(Number(event.currentTarget.value))}
                        className="min-h-10 min-w-0 rounded-md border border-border-default bg-surface-primary px-2 py-1 text-text-primary focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {months.map((month, index) => <option key={month} value={months.length - index}>{month} 2004</option>)}
                      </select>
                      <div className="grid gap-1">
                        {([[-1, IconChevronUp], [1, IconChevronDown]] as const).map(([step, Icon]) => {
                          const nextIndex = (monthIndex + step + months.length) % months.length
                          const label = 'Show ' + months[nextIndex] + ' 2004'
                          return (
                            <button key={step} type="button" aria-label={label} title={label} aria-controls={monthSelectId}
                              className="grid min-h-7 min-w-8 place-items-center rounded-md border border-border-default bg-surface-primary hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-primary"
                              onClick={() => onBlueMarbleMonthChange?.(months.length - nextIndex)}>
                              <Icon size={16} aria-hidden="true" />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <span aria-live="polite" aria-atomic="true" className="sr-only">{monthLabel}</span>
                  </div>
                )}
                {isRaster && !elevationOnStreet && (!isBlueMarble || blueMarbleAvailable) && (
                  <div className="mt-1 border-t border-border-subtle">
                    <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-sm text-text-primary hover:bg-surface-secondary">
                      <input
                        type="checkbox"
                        checked={streetOverlay}
                        onChange={(event) => onStreetOverlayChange(event.currentTarget.checked)}
                        className="size-4 shrink-0 accent-desert-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-desert-orange"
                      />
                      Street overlay
                    </label>
                  </div>
                )}
                {mode === 'topographic' && elevation && (
                  <div className="mt-1 border-t border-border-subtle">
                    {elevationOnStreet && (
                      <div className="px-2.5 pt-2 pb-1">
                        <p className="text-xs text-text-secondary">Contour lines are using the Street background.</p>
                        <LayerSetupLink mode="topographic" />
                      </div>
                    )}
                    {elevation.availability === 'installed' ? (
                      <p className="px-2.5 py-2 text-xs text-text-secondary">Contour interval 100 m</p>
                    ) : elevation.availability === 'not-installed' ? (
                      <div className="px-2.5 pt-2 pb-1">
                        <p className="text-xs text-text-secondary">Elevation data is not installed.</p>
                        <a href="/settings/maps?pack=elevation#world-offline-elevation"
                          className="inline-flex min-h-9 items-center rounded text-xs font-semibold text-desert-orange underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                          Download elevation data
                        </a>
                      </div>
                    ) : (
                      <p className="px-2.5 py-2 text-xs text-text-secondary">
                        {elevation.availability === 'checking' ? 'Checking elevation data…' : 'Could not check elevation data.'}
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}
            {showNotice && (
              <div className="rounded-lg border border-border-subtle bg-surface-primary p-2.5 text-sm text-text-primary shadow-lg">
                <p role="status">{notice}</p>
                <div className="mt-1 flex flex-wrap gap-x-3">
                  {outsideCoverage && isRaster && installed(mode) && (
                    <button
                      type="button"
                      className="flex min-h-10 items-center rounded font-semibold text-desert-orange hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-desert-orange"
                      onClick={() => {
                        onGoToCoverage()
                        triggerRef.current?.focus()
                      }}
                    >
                      Go to coverage
                    </button>
                  )}
                  {outsideCoverage && mode === 'aerial' && offerWorldSatellite && <LayerSetupLink mode="aerial" />}
                  {!open && missingMode && setupEnabled && !mapDataWarning && <LayerSetupLink mode={missingMode} />}
                  {(archiveUnavailable || mapDataWarning) && (
                    <button type="button" onClick={onRetryData}
                      className="inline-flex min-h-9 items-center rounded text-xs font-semibold text-desert-orange hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                      Retry map data
                    </button>
                  )}
                  {missingMode && (
                    <button type="button" onClick={() => { onKeepStreet(); triggerRef.current?.focus() }}
                      className="inline-flex min-h-9 items-center rounded text-xs font-semibold text-text-secondary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                      Keep Street
                    </button>
                  )}
                  {!streetOverlay && (
                    <button
                      type="button"
                      className="flex min-h-10 items-center rounded font-semibold text-desert-orange hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-desert-orange"
                      onClick={() => {
                        onModeChange('street')
                        triggerRef.current?.focus()
                      }}
                    >
                      Show Street map
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ),
        popupHost
      )}
    </>
  )
}
