import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Popup } from 'react-map-gl/maplibre'

import { PIN_COLORS } from '~/hooks/useMapMarkers'
import type { MapMarker, PinColorId } from '~/hooks/useMapMarkers'

const MAX_MARKER_NOTES_LENGTH = 500

const inputClass =
  'block w-full rounded border border-gray-300 bg-transparent px-2 py-1 text-sm text-gray-900 leading-normal placeholder:text-gray-400 focus:outline-none focus:border-gray-500'

type MapMarkerFormPopupProps = {
  longitude: number
  latitude: number
  initialMarker?: MapMarker
  onSave: (values: {
    id?: number
    name: string
    notes: string
    color: PinColorId
  }) => Promise<void> | void
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
}

export default function MapMarkerFormPopup({
                                             longitude,
                                             latitude,
                                             initialMarker,
                                             onSave,
                                             onCancel,
                                             onDirtyChange,
                                           }: MapMarkerFormPopupProps) {
  const [name, setName] = useState(initialMarker?.name ?? '')
  const [notes, setNotes] = useState(initialMarker?.notes ?? '')
  const [color, setColor] = useState<PinColorId>(initialMarker?.color ?? 'orange')
  const [isSaving, setIsSaving] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [])

  useLayoutEffect(() => {
    resizeTextarea()
  }, [resizeTextarea])

  const nameInputRef = useRef<HTMLInputElement | null>(null)

  useLayoutEffect(() => {
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }, [])

  const isDirty =
    name !== (initialMarker?.name ?? '') ||
    notes !== (initialMarker?.notes ?? '') ||
    color !== (initialMarker?.color ?? 'orange')

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  const handleSave = async () => {
    if (!name.trim() || isSaving) return

    try {
      setIsSaving(true)

      await onSave({
        id: initialMarker?.id,
        name: name.trim(),
        notes: notes.trim(),
        color,
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Popup
      longitude={longitude}
      latitude={latitude}
      anchor="bottom"
      offset={[0, -36] as [number, number]}
      onClose={onCancel}
      closeOnClick={false}
    >
      <div
        className="p-1"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <input
          ref={nameInputRef}
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
          ref={textareaRef}
          placeholder="Add notes (optional)"
          value={notes}
          rows={2}
          maxLength={MAX_MARKER_NOTES_LENGTH}
          onChange={(e) => {
            setNotes(e.target.value)
            requestAnimationFrame(resizeTextarea)
          }}
          className={`mt-1 min-h-[64px] max-h-[240px] resize-none overflow-y-auto themed-scrollbar ${inputClass}`}
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
                outline:
                  color === pinColor.id ? `2px solid ${pinColor.hex}` : '2px solid transparent',
                outlineOffset: '1px',
              }}
            >
              <div className="w-4 h-4 rounded-full" style={{backgroundColor: pinColor.hex}}/>
            </button>
          ))}
        </div>

        <div className="mt-1.5 flex gap-1.5 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded transition-colors disabled:opacity-40"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            className="text-xs bg-[#424420] text-white rounded px-2.5 py-1 hover:bg-[#525530] disabled:opacity-40 transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Popup>
  )
}
