import { Popup } from 'react-map-gl/maplibre'

import { PIN_COLORS } from '~/hooks/useMapMarkers'
import type { PinColorId } from '~/hooks/useMapMarkers'

const MAX_MARKER_NOTES_LENGTH = 1000

const inputClass =
  'block w-full appearance-none rounded border border-gray-300 bg-transparent px-2 py-1 text-sm text-gray-900 leading-normal placeholder:text-gray-400 focus:border-gray-500 focus:outline-none'

type CreateMapMarkerPopupProps = {
  longitude: number
  latitude: number
  markerName: string
  markerNotes: string
  markerColor: PinColorId
  onNameChange: (value: string) => void
  onNotesChange: (value: string) => void
  onColorChange: (value: PinColorId) => void
  onSave: () => void
  onCancel: () => void
}

export default function CreateMapMarkerPopup({
                                               longitude,
                                               latitude,
                                               markerName,
                                               markerNotes,
                                               markerColor,
                                               onNameChange,
                                               onNotesChange,
                                               onColorChange,
                                               onSave,
                                               onCancel,
                                             }: CreateMapMarkerPopupProps) {
  return (
    <Popup
      longitude={longitude}
      latitude={latitude}
      anchor="bottom"
      onClose={onCancel}
      closeOnClick={false}
    >
      <div className="p-1">
        <input
          autoFocus
          type="text"
          placeholder="Name this location"
          value={markerName}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave()
            if (e.key === 'Escape') onCancel()
          }}
          className={inputClass}
        />

        <textarea
          placeholder="Add notes (optional)"
          value={markerNotes}
          rows={2}
          maxLength={MAX_MARKER_NOTES_LENGTH}
          onChange={(e) => {
            onNotesChange(e.target.value)
            e.currentTarget.style.height = 'auto'
            e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
          }}
          className={`mt-1 min-h-[64px] resize-none overflow-hidden ${inputClass}`}
        />

        <div className="mt-1 text-[11px] text-gray-400">
          {markerNotes.length}/{MAX_MARKER_NOTES_LENGTH}
        </div>

        <div className="mt-1.5 flex gap-1 items-center">
          {PIN_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              onClick={() => onColorChange(color.id)}
              title={color.label}
              className="rounded-full p-0.5 transition-transform"
              style={{
                outline:
                  markerColor === color.id ? `2px solid ${color.hex}` : '2px solid transparent',
                outlineOffset: '1px',
              }}
            >
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color.hex }} />
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
            onClick={onSave}
            disabled={!markerName.trim()}
            className="text-xs bg-[#424420] text-white rounded px-2.5 py-1 hover:bg-[#525530] disabled:opacity-40 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </Popup>
  )
}
