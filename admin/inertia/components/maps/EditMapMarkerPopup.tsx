import { useState } from 'react'
import { Popup } from 'react-map-gl/maplibre'

import type { MapMarker, PinColorId } from '~/hooks/useMapMarkers'
import { PIN_COLORS } from '~/hooks/useMapMarkers'

const MAX_MARKER_NOTES_LENGTH = 1000

const inputClass =
  'block w-full rounded border border-gray-300 bg-transparent px-2 py-1 text-sm text-gray-900 leading-normal placeholder:text-gray-400 focus:outline-none focus:border-gray-500'

type EditMapMarkerPopupProps = {
  marker: MapMarker
  onSave: (id: number, name: string, notes: string, color: PinColorId) => void
  onCancel: () => void
}

export default function EditMapMarkerPopup({
                                             marker,
                                             onSave,
                                             onCancel,
                                           }: EditMapMarkerPopupProps) {
  const [name, setName] = useState(marker.name)
  const [notes, setNotes] = useState(marker.notes ?? '')
  const [color, setColor] = useState<PinColorId>(marker.color)

  const handleSave = () => {
    if (!name.trim()) return
    onSave(marker.id, name.trim(), notes.trim(), color)
  }

  return (
    <Popup
      longitude={marker.longitude}
      latitude={marker.latitude}
      anchor="bottom"
      offset={[0, -36] as [number, number]}
      onClose={onCancel}
      closeOnClick={false}
    >
      <div className="p-1">
        <input
          autoFocus
          type="text"
          placeholder="Name this location"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') onCancel()
          }}
          className={inputClass}
        />

        <textarea
          placeholder="Add notes (optional)"
          value={notes}
          rows={2}
          maxLength={MAX_MARKER_NOTES_LENGTH}
          onChange={(e) => {
            setNotes(e.target.value)
            e.currentTarget.style.height = 'auto'
            e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
          }}
          className={`mt-1 min-h-[64px] resize-none overflow-hidden ${inputClass}`}
        />

        <div className="mt-1 text-[11px] text-gray-400">
          {notes.length}/{MAX_MARKER_NOTES_LENGTH}
        </div>

        <div className="mt-1.5 flex gap-1 items-center">
          {PIN_COLORS.map((pinColor) => (
            <button
              key={pinColor.id}
              type="button"
              onClick={() => setColor(pinColor.id)}
              title={pinColor.label}
              className="rounded-full p-0.5 transition-transform"
              style={{
                outline: color === pinColor.id ? `2px solid ${pinColor.hex}` : '2px solid transparent',
                outlineOffset: '1px',
              }}
            >
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: pinColor.hex }} />
            </button>
          ))}
        </div>

        <div className="mt-1.5 flex gap-1.5 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className="text-xs bg-[#424420] text-white rounded px-2.5 py-1 hover:bg-[#525530] disabled:opacity-40 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </Popup>
  )
}
