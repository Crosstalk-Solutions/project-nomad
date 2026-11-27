import { IconAlertTriangle, IconInfoCircle, IconLayersIntersect, IconX } from '@tabler/icons-react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useControl } from 'react-map-gl/maplibre'
import type { MapLayerMode } from './LayerSelector'
import type { MapDetailSummary } from './mapDetailModel'
import './mapDetailIndicator.css'

export type MapDetailIndicatorProps = { detail: MapDetailSummary; mode: MapLayerMode }

const layerLabels: Record<MapLayerMode, string> = {
  street: 'Street', aerial: 'Satellite', topographic: 'Topography', 'blue-marble': 'Blue Marble',
}

const zoomText = (value: number, digits = 1) => Number.isFinite(value) ? value.toFixed(digits).replace(/\.0$/, '') : '—'
const sampleText = (value: number, raster = false) => {
  const amount = value >= 1000 ? (value / 1000).toFixed(1).replace(/\.0$/, '') + ' km' :
    (value < 10 ? value.toFixed(1) : Math.round(value).toString()) + ' m'
  return `≈ ${amount}${raster ? ' / source pixel' : ' / sample'}`
}

/** The native zoom indicator is an informational control; it never changes the map camera. */
export default function MapDetailIndicator({ detail, mode }: MapDetailIndicatorProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLElement>(null)
  const panelId = useId()
  const available = detail.availability === 'available' && detail.centerNativeZoom !== undefined
  const enlarged = available && detail.enlarged
  const mixed = detail.mixed
  const state = detail.availability === 'checking' ? 'checking' : !available ? 'unavailable' : enlarged ? 'enlarged' : 'native'
  const layerLabel = layerLabels[mode]
  const factor = detail.enlargementFactor && detail.enlargementFactor >= 1.05
    ? ` ${detail.enlargementFactor < 10 ? detail.enlargementFactor.toFixed(1) : Math.round(detail.enlargementFactor).toLocaleString('en')}×` : ''
  const atLimit = available && Math.abs(detail.currentZoom - detail.centerNativeZoom!) < .001
  const status = detail.availability === 'checking' ? 'Checking available detail…'
    : !available ? detail.availability === 'missing' ? 'No layer data at the center' : 'Detail information unavailable'
      : enlarged ? `Enlarged${factor} · no extra detail`
        : atLimit ? 'At native detail limit' : `Native ${mode === 'topographic' ? detail.contoursOnly ? 'terrain ' : 'relief ' : ''}detail through ${zoomText(detail.centerNativeZoom!)}`
  const secondary = mixed ? 'Mixed detail' : detail.missingInView ? 'Partial coverage' : undefined
  const currentZoomText = (digits: 1 | 2) => {
    let value = detail.currentZoom.toFixed(digits)
    if (enlarged && Number(value) <= detail.centerNativeZoom!) value = detail.currentZoom.toFixed(2)
    return enlarged && Number(value) <= detail.centerNativeZoom! ? '> ' + zoomText(detail.centerNativeZoom!) : value
  }

  const { overlay } = useControl(() => {
    const placeholder = document.createElement('div')
    const element = document.createElement('div')
    placeholder.className = 'maplibregl-ctrl nomad-map-detail-placeholder'
    element.className = 'maplibregl-ctrl nomad-map-detail-overlay'
    const stop = (event: Event) => event.stopPropagation()
    const events = ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick', 'contextmenu', 'wheel', 'keydown']
    // Portal listeners still run on this same element; map gestures and Pins do not receive UI events.
    for (const event of events) element.addEventListener(event, stop, { passive: true })
    return {
      overlay: element,
      onAdd(map: MapLibreMap) { map.getContainer().append(element); return placeholder },
      onRemove() { for (const event of events) element.removeEventListener(event, stop); element.remove(); placeholder.remove() },
    }
  }, { position: 'bottom-left' })

  useLayoutEffect(() => {
    const map = overlay.parentElement
    const trigger = triggerRef.current
    if (!map || !trigger) return
    let frame = 0
    const observed = new Set<Element>()
    const observer = new ResizeObserver(() => schedule())
    const watch = (element: Element | null) => {
      if (element && !observed.has(element)) { observed.add(element); observer.observe(element) }
    }
    const position = () => {
      frame = 0
      const box = map.getBoundingClientRect()
      const viewport = window.visualViewport
      const left = Math.max(box.left, viewport?.offsetLeft ?? 0) + 10
      const right = Math.min(box.right, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth)) - 10
      const bottom = Math.min(box.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight)) - 8
      const navbar = document.querySelector<HTMLElement>('[data-nomad-map-navbar]')
      const navbarVisible = navbar && (!document.fullscreenElement || document.fullscreenElement.contains(navbar))
      const top = Math.max(box.top, viewport?.offsetTop ?? 0, navbarVisible ? navbar.getBoundingClientRect().bottom : box.top) + 8
      let controlTop = box.bottom - 54
      const scale = map.querySelector<HTMLElement>('.maplibregl-ctrl-bottom-left')
      watch(scale)
      if (scale && scale.offsetHeight) controlTop = Math.min(controlTop, scale.getBoundingClientRect().top)
      const attribution = map.querySelector<HTMLElement>('.maplibregl-ctrl-bottom-right')
      watch(attribution)
      if (attribution && attribution.offsetHeight) {
        const bounds = attribution.getBoundingClientRect()
        if (bounds.left < Math.min(right, left + 286) && bounds.right > left) controlTop = Math.min(controlTop, bounds.top)
      }
      // The existing unit selector is a React child of the map and has no dependency on this control.
      for (const button of map.querySelectorAll<HTMLButtonElement>('button')) {
        if (!['Metric', 'Imperial', 'Nautical'].includes(button.textContent?.trim() ?? '')) continue
        const bounds = button.getBoundingClientRect()
        if (bounds.left < box.left + 260 && bounds.bottom > box.bottom - 100) {
          controlTop = Math.min(controlTop, bounds.top)
          watch(button.parentElement)
        }
      }
      const badgeBottom = Math.min(bottom - 8, controlTop - 8)
      const width = Math.max(0, Math.min(286, right - left))
      trigger.style.left = Math.max(0, left - box.left) + 'px'
      trigger.style.bottom = Math.max(0, box.bottom - badgeBottom) + 'px'
      trigger.style.width = width + 'px'
      trigger.style.visibility = width > 0 && badgeBottom - trigger.offsetHeight >= top ? 'visible' : 'hidden'
      if (!open || !popupRef.current) return
      const popup = popupRef.current
      const button = trigger.getBoundingClientRect()
      const popupWidth = Math.max(0, Math.min(320, right - left))
      const spaceAbove = Math.max(0, button.top - top - 8)
      const spaceBeside = right - button.right - 8
      const beside = spaceAbove < Math.min(popup.scrollHeight, 240) && spaceBeside >= 248
      const heightLimit = beside ? bottom - top : spaceAbove
      popup.style.width = (beside ? Math.min(popupWidth, spaceBeside) : popupWidth) + 'px'
      popup.style.maxHeight = Math.max(0, heightLimit) + 'px'
      const height = Math.min(popup.scrollHeight, heightLimit)
      popup.style.left = (beside ? button.right + 8 : left) - box.left + 'px'
      popup.style.top = Math.max(top, Math.min(bottom - height, beside ? button.top : button.top - height - 8)) - box.top + 'px'
      popup.style.visibility = popupWidth > 0 && heightLimit > 0 ? 'visible' : 'hidden'
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(position) }
    watch(map)
    if (popupRef.current) watch(popupRef.current)
    watch(trigger)
    const mutations = new MutationObserver(schedule)
    mutations.observe(map, { childList: true, subtree: true })
    document.addEventListener('fullscreenchange', schedule)
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    position()
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect()
      document.removeEventListener('fullscreenchange', schedule)
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
    }
  }, [overlay, open, detail, mode])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !overlay.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [open, overlay])

  function close() { setOpen(false); triggerRef.current?.focus({ preventScroll: true }) }

  return createPortal(
    <>
      <button type="button" ref={triggerRef} className="nomad-map-detail-trigger" data-testid="map-detail-indicator"
        data-state={state} data-mixed={mixed ? 'true' : 'false'} data-nativezoom={detail.centerNativeZoom}
        aria-label={`${layerLabel}, zoom ${currentZoomText(2)}. ${status}${secondary ? '. ' + secondary : ''}. View map detail.`}
        aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
        <span className="nomad-map-detail-main"><strong>{layerLabel}</strong>
          {secondary && <span className="nomad-map-detail-mixed" title={mixed ? 'Different native detail is visible across this view' : 'Part of this view has no installed layer data'}><IconLayersIntersect size={12} aria-hidden="true" />{secondary}</span>}
          <span className="nomad-map-detail-zoom">Zoom {currentZoomText(1)}</span><IconInfoCircle size={15} aria-hidden="true" />
        </span>
        <span className="nomad-map-detail-status" role="status">{enlarged && <IconAlertTriangle size={13} aria-hidden="true" />}{status}</span>
      </button>
      {open && <section ref={popupRef} id={panelId} className="nomad-map-detail-popover" aria-label="Map detail" data-testid="map-detail-popover"
        data-state={state} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
        <header><h2>Map detail</h2><button type="button" aria-label="Close map detail" onClick={close}><IconX size={16} aria-hidden="true" /></button></header>
        <p className="nomad-map-detail-reference">At map center</p>
        <dl>
          <div><dt>Layer</dt><dd>{layerLabel}</dd></div>
          <div><dt>Current view</dt><dd>Zoom {currentZoomText(2)}</dd></div>
          <div><dt>Native view limit</dt><dd>{available ? 'Zoom ' + zoomText(detail.centerNativeZoom!) : 'Unavailable'}</dd></div>
          {detail.centerSource && <div><dt>Map data</dt><dd>{detail.centerSource.label}</dd></div>}
          {detail.centerSource && available && Math.abs(detail.centerSource.sourceMaxZoom - detail.centerNativeZoom!) > .001 &&
            <div><dt>Archive tiles</dt><dd>Zoom {zoomText(detail.centerSource.sourceMaxZoom)} · {detail.centerSource.tileSize} px</dd></div>}
          {detail.sampleMeters !== undefined && <div><dt>{detail.contoursOnly ? 'Terrain sampling' : 'Image sampling'}</dt><dd>{sampleText(detail.sampleMeters, !detail.contoursOnly)}</dd></div>}
          {detail.primaryKind === 'vector' && <div><dt>Data type</dt><dd>Vector geometry</dd></div>}
        </dl>
        {detail.dem && <div className="nomad-map-detail-dem"><strong>Contour data</strong><p>{detail.dem.sourceLabel}</p>
          <p>Native zoom {zoomText(detail.dem.nativeZoom)}{detail.dem.sampleMeters !== undefined ? ' · ' + sampleText(detail.dem.sampleMeters) : ''}</p>
          <p>100 m vertical interval{detail.dem.enlarged ? ' · DEM samples enlarged' : ''}</p></div>}
        {mixed && <div className="nomad-map-detail-mixed-note"><strong><IconLayersIntersect size={14} aria-hidden="true" />Mixed detail in this view</strong>
          <p>{detail.viewMinNativeZoom !== undefined && detail.viewMaxNativeZoom !== undefined
            ? `Visible native detail ranges from zoom ${zoomText(detail.viewMinNativeZoom)} to ${zoomText(detail.viewMaxNativeZoom)}. ` : 'Different native detail is visible across the map. '}
            The indicator uses the center as its reference.</p>
          <ul>{detail.sourcesSummary.map((source) => <li key={source.id}><span>{source.label}</span><span>Zoom {zoomText(source.nativeZoom)}</span></li>)}</ul>
          {detail.coarserAreasEnlarged && <p>Some coarser areas are already enlarged at the current zoom.</p>}
        </div>}
        {detail.missingInView && <p className="nomad-map-detail-coverage-note">Some visible areas have no installed data for this layer.</p>}
        <p className="nomad-map-detail-explanation">{!available ? status : enlarged
          ? detail.primaryKind === 'vector' ? 'Existing geometry is enlarged. Line edges can stay sharp, but no new map geometry is added.'
            : detail.contoursOnly ? 'Terrain samples are enlarged. Further zoom adds no terrain detail.' : 'Source pixels are enlarged. Further zoom adds no image detail.'
          : 'The center is within the installed layer’s native detail.'}</p>
        {detail.sampleMeters !== undefined || detail.dem ? <p className="nomad-map-detail-footnote">Sampling is approximate; it does not measure geographic accuracy.</p> : null}
      </section>}
    </>, overlay
  )
}
