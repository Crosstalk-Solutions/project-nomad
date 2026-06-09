import { Popup } from 'react-map-gl/maplibre'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { MapMarker } from '~/hooks/useMapMarkers'

type ViewMapMarkerPopupProps = {
  marker: MapMarker
  onClose: () => void
  onEdit: () => void
  onMouseEnter?: () => void
}

export default function ViewMapMarkerPopup({
                                             marker,
                                             onClose,
                                             onEdit,
                                             onMouseEnter,
                                           }: ViewMapMarkerPopupProps) {
  return (
    <Popup
      longitude={marker.longitude}
      latitude={marker.latitude}
      anchor="bottom"
      offset={[0, -36] as [number, number]}
      onClose={onClose}
      closeOnClick={false}
      closeButton={false}
    >
      <div
        className="max-w-[260px]"
        onMouseEnter={onMouseEnter}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium break-words">{marker.name}</div>

        {marker.notes && (
          <div className="mt-1 max-w-[240px] break-all whitespace-pre-wrap text-xs text-gray-500">
            {/* react-markdown is intentionally used without rehypeRaw.
                Do not enable raw HTML rendering unless notes are sanitized first. */}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-blue-600 underline hover:text-blue-700"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {marker.notes}
            </ReactMarkdown>
          </div>
        )}

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
            onClick={onEdit}
            className="w-16 rounded bg-[#424420] px-2.5 py-1 text-xs text-white hover:bg-[#525530] border-none outline-none"
          >
            Edit
          </button>
        </div>
      </div>
    </Popup>
  )
}
