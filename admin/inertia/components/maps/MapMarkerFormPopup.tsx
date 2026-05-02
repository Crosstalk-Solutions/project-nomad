import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {Popup} from 'react-map-gl/maplibre'
import {IconPalette} from '@tabler/icons-react'

import {IconIcons} from '@tabler/icons-react'
import IconSelectorPopover from './IconSelectorPopover'

import {PIN_COLORS} from '~/hooks/useMapMarkers'
import type {MapMarker, PinColorId} from '~/hooks/useMapMarkers'

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
        customColor: string | null
        icon: string | null
    }) => Promise<void> | void
    onCancel: () => void
    onDirtyChange?: (dirty: boolean) => void
    onMouseEnter?: () => void
}

export default function MapMarkerFormPopup({
                                               longitude,
                                               latitude,
                                               initialMarker,
                                               onSave,
                                               onCancel,
                                               onDirtyChange,
                                               onMouseEnter,
                                           }: MapMarkerFormPopupProps) {
    const [name, setName] = useState(initialMarker?.name ?? '')
    const [notes, setNotes] = useState(initialMarker?.notes ?? '')
    const [color, setColor] = useState<PinColorId>(initialMarker?.color ?? 'orange')
    const [customColor, setCustomColor] = useState<string | null>(initialMarker?.customColor ?? null)
    const [isSaving, setIsSaving] = useState(false)

    const textareaRef = useRef<HTMLTextAreaElement | null>(null)
    const nameInputRef = useRef<HTMLInputElement | null>(null)
    const colorInputRef = useRef<HTMLInputElement | null>(null)

    const resizeTextarea = useCallback(() => {
        const textarea = textareaRef.current
        if (!textarea) return

        textarea.style.height = 'auto'
        textarea.style.height = `${textarea.scrollHeight}px`
    }, [])

    const [icon, setIcon] = useState<string | null>(initialMarker?.icon ?? null)
    const [showIconSelector, setShowIconSelector] = useState(false)

    useLayoutEffect(() => {
        resizeTextarea()
    }, [resizeTextarea])

    useLayoutEffect(() => {
        nameInputRef.current?.focus()
        nameInputRef.current?.select()
    }, [])

    const isDirty =
        name !== (initialMarker?.name ?? '') ||
        notes !== (initialMarker?.notes ?? '') ||
        color !== (initialMarker?.color ?? 'orange') ||
        customColor !== (initialMarker?.customColor ?? null) ||
        icon !== (initialMarker?.icon ?? null)

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
                customColor,
                icon,
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
            closeButton={false}
        >
            <div
                className="p-1"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseEnter={onMouseEnter}
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
                            onClick={() => {
                                setColor(pinColor.id)
                                setCustomColor(null)
                            }}
                            title={pinColor.label}
                            className="rounded-full p-0.5 transition-transform"
                            style={{
                                outline:
                                    !customColor && color === pinColor.id
                                        ? `2px solid ${pinColor.hex}`
                                        : '2px solid transparent',
                                outlineOffset: '1px',
                            }}
                        >
                            <div className="w-4 h-4 rounded-full" style={{backgroundColor: pinColor.hex}}/>
                        </button>
                    ))}

                    <button
                        type="button"
                        title="Choose custom marker color"
                        aria-label="Choose custom marker color"
                        onClick={() => colorInputRef.current?.click()}
                        className="rounded-full p-0.5 transition-transform"
                        style={{
                            outline: customColor ? `2px solid ${customColor}` : '2px solid transparent',
                            outlineOffset: '1px',
                        }}
                    >
            <span
                className="flex h-5 w-5 items-center justify-center rounded-full border border-border-default"
                style={{backgroundColor: customColor ?? '#424420'}}
            >
              <IconPalette size={16} fill="currentColor" stroke={1.5} className="text-white"/>
            </span>
                    </button>

                    <div className="relative">
                        <button
                            type="button"
                            title="Choose custom marker icon"
                            aria-label="Choose custom marker icon"
                            onClick={() => setShowIconSelector((prev) => !prev)}
                            className="rounded-full p-0.5 transition-transform"
                            style={{
                                outline: icon ? '2px solid #424420' : '2px solid transparent',
                                outlineOffset: '1px',
                            }}
                        >
    <span
        className="flex h-5 w-5 items-center justify-center rounded-full border border-border-default bg-[#424420] text-white">
      <IconIcons size={16} fill="currentColor" stroke={1.5}/>
    </span>
                        </button>

                        {showIconSelector && (
                            <IconSelectorPopover
                                selectedIcon={icon}
                                onSelect={setIcon}
                                onClose={() => setShowIconSelector(false)}
                            />
                        )}
                    </div>

                    <input
                        ref={colorInputRef}
                        type="color"
                        value={customColor ?? '#a84a12'}
                        onChange={(e) => setCustomColor(e.target.value)}
                        className="sr-only"
                        aria-label="Choose custom marker color"
                    />
                </div>

                <div className="mt-1.5 flex gap-1.5 justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isSaving}
                        className="text-xs bg-[#424420] text-white rounded px-2.5 py-1 hover:bg-[#525530] disabled:opacity-40 transition-colors"
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
