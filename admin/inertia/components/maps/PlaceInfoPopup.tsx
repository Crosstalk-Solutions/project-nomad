import { useState } from 'react'
import { Popup } from 'react-map-gl/maplibre'
import { IconCheck, IconCopy } from '@tabler/icons-react'

import { formatLatLng, type PlaceInfo } from '~/lib/map_place_info'

type PlaceInfoPopupProps = {
  place: PlaceInfo
  longitude: number
  latitude: number
  onClose: () => void
  onSaveAsPin: () => void
  onMouseEnter?: () => void
}

/**
 * Copy text even where navigator.clipboard is unavailable: NOMAD is usually opened over plain
 * http on a LAN address, which is not a secure context, so fall back to a hidden textarea.
 */
async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  textarea.remove()
  return ok
}

/** Details for a clicked label or point of interest, built from the map tiles already on disk. */
export default function PlaceInfoPopup({
  place,
  longitude,
  latitude,
  onClose,
  onSaveAsPin,
  onMouseEnter,
}: PlaceInfoPopupProps) {
  const [copied, setCopied] = useState(false)
  const coordinates = formatLatLng(latitude, longitude)

  return (
    <Popup
      longitude={longitude}
      latitude={latitude}
      anchor="bottom"
      offset={[0, -8] as [number, number]}
      onClose={onClose}
      closeOnClick={false}
      closeButton={false}
    >
      <div
        className="min-w-[200px] max-w-[260px]"
        onMouseEnter={onMouseEnter}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium break-words">{place.name}</div>
        {place.englishName && (
          <div className="text-xs text-gray-500 break-words">{place.englishName}</div>
        )}
        <div className="mt-0.5 text-xs text-gray-500">
          {place.type}
          {place.elevation !== null && ` · ${place.elevation.toLocaleString('en-US')} m`}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 rounded bg-gray-100 px-2 py-1">
          <span className="font-mono text-[11px] text-gray-700">{coordinates}</span>
          <button
            type="button"
            onClick={async () => {
              if (await copyText(coordinates)) {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1500)
              }
            }}
            className="text-gray-500 hover:text-gray-800"
            title="Copy coordinates"
            aria-label="Copy coordinates"
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </button>
        </div>

        <div className="mt-2 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="w-16 rounded bg-[#424420] px-2.5 py-1 text-xs text-white hover:bg-[#525530] border-none outline-none"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onSaveAsPin}
            className="rounded bg-[#424420] px-2.5 py-1 text-xs text-white hover:bg-[#525530] border-none outline-none"
          >
            Save as pin
          </button>
        </div>
      </div>
    </Popup>
  )
}
