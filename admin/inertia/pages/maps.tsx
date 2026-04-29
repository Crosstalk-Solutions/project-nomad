import { useState } from 'react'
import MapsLayout from '~/layouts/MapsLayout'
import { Head, Link, router } from '@inertiajs/react'
import MapComponent from '~/components/maps/MapComponent'
import StyledButton from '~/components/StyledButton'
import { IconArrowLeft, IconMapPin, IconPlaneTilt } from '@tabler/icons-react'
import { FileEntry } from '../../types/files'
import Alert from '~/components/Alert'

type MapCommand = {
  id: number
  lat: number
  lng: number
  action: 'fly' | 'marker'
}

export default function Maps(props: {
  maps: { baseAssetsExist: boolean; regionFiles: FileEntry[] }
}) {
  const [coordinateSearch, setCoordinateSearch] = useState('')
  const [mapCommand, setMapCommand] = useState<MapCommand | null>(null)

  const parseCoordinates = () => {
    const [latRaw, lngRaw] = coordinateSearch.split(',').map((value) => value.trim())
    const lat = Number(latRaw)
    const lng = Number(lngRaw)

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return null
    }

    return { lat, lng }
  }

  const handleCoordinateAction = (action: 'fly' | 'marker') => {
    const coordinates = parseCoordinates()
    if (!coordinates) return

    setMapCommand({
      id: Date.now(),
      ...coordinates,
      action,
    })
  }

  const alertMessage = !props.maps.baseAssetsExist
    ? 'The base map assets have not been installed. Please download them first to enable map functionality.'
    : props.maps.regionFiles.length === 0
      ? 'No map regions have been downloaded yet. Please download some regions to enable map functionality.'
      : null

  return (
    <MapsLayout>
      <Head title="Maps" />
      <div className="relative w-full h-screen overflow-hidden">
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between gap-4 p-4 bg-surface-secondary backdrop-blur-sm shadow-sm">
          <Link href="/home" className="flex items-center">
            <IconArrowLeft className="mr-2" size={24} />
            <p className="text-lg text-text-secondary">Back to Home</p>
          </Link>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="lat,lng"
              value={coordinateSearch}
              onChange={(event) => setCoordinateSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCoordinateAction('fly')
              }}
              className="w-52 rounded border border-border-default bg-surface-primary px-2 py-1 text-sm text-text-primary placeholder:text-text-muted focus:border-desert-green focus:outline-none"
            />

            <button
              type="button"
              onClick={() => handleCoordinateAction('fly')}
              className="rounded border border-border-default bg-surface-primary p-2 text-text-secondary hover:bg-surface-secondary"
              title="Fly to coordinates"
            >
              <IconPlaneTilt size={18} />
            </button>

            <button
              type="button"
              onClick={() => handleCoordinateAction('marker')}
              className="rounded border border-border-default bg-surface-primary p-2 text-text-secondary hover:bg-surface-secondary"
              title="Add marker at coordinates"
            >
              <IconMapPin size={18} />
            </button>

            <Link href="/settings/maps" className="mr-4">
              <StyledButton variant="primary" icon="IconSettings">
                Manage Map Regions
              </StyledButton>
            </Link>
          </div>
        </div>

        {alertMessage && (
          <div className="absolute top-20 left-4 right-4 z-50">
            <Alert
              title={alertMessage}
              type="warning"
              variant="solid"
              className="w-full"
              buttonProps={{
                variant: 'secondary',
                children: 'Go to Map Settings',
                icon: 'IconSettings',
                onClick: () => router.visit('/settings/maps'),
              }}
            />
          </div>
        )}

        <div className="absolute inset-0">
          <MapComponent mapCommand={mapCommand} />
        </div>
      </div>
    </MapsLayout>
  )
}
