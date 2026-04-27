import { Popup } from 'react-map-gl/maplibre'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { MapMarker } from '~/hooks/useMapMarkers'

type ViewMapMarkerPopupProps = {
  marker: MapMarker
  onClose: () => void
  onEdit: () => void
}

export default function ViewMapMarkerPopup({
                                             marker,
                                             onClose,
                                             onEdit,
                                           }: ViewMapMarkerPopupProps) {
  return (
    <Popup
      longitude={marker.longitude}
      latitude={marker.latitude}
      anchor="bottom"
      offset={[0, -36] as [number, number]}
      onClose={onClose}
      closeOnClick={false}
    >
      <div className="text-sm font-medium">{marker.name}</div>

      {marker.notes && (
        <div className="mt-1 text-xs text-gray-500">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {marker.notes}
          </ReactMarkdown>
        </div>
      )}

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={onEdit}
          className="rounded bg-[#424420] px-2.5 py-1 text-xs text-white hover:bg-[#525530]"
        >
          Edit
        </button>
      </div>
    </Popup>
  )
}
