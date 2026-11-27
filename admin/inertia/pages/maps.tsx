import { useState } from 'react'
import { Head, Link, router } from '@inertiajs/react'

import MapsLayout from '~/layouts/MapsLayout'
import MapComponent from '~/components/maps/MapComponent'
import StyledButton from '~/components/StyledButton'
import { IconArrowLeft, IconCrosshair, IconMapPin, IconPlaneTilt } from '@tabler/icons-react'
import { FileEntry } from '../../types/files'
import Alert from '~/components/Alert'

type MapCommand = {
  id: number
  lat: number
  lng: number
  action: 'fly' | 'marker'
}

export default function Maps(props: {
  maps: { baseAssetsExist: boolean; worldBasemapExists: boolean; regionFiles: FileEntry[] }
}) {
  const [isHoveringUI, setIsHoveringUI] = useState(false)

  const [coordinateSearch, setCoordinateSearch] = useState('')
  const [mapCommand, setMapCommand] = useState<MapCommand | null>(null)
  const [showCoordinatesEnabled, setShowCoordinatesEnabled] = useState(true)

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
    : !props.maps.worldBasemapExists
    ? 'The world base map has not been downloaded yet, so the map may appear blank outside downloaded regions. Connect this NOMAD to the internet and download it (~15 MB) from Map Settings.'
    : props.maps.regionFiles.length === 0
    ? 'No map regions have been downloaded yet. Please download some regions to enable map functionality.'
    : null

  return (
    <MapsLayout>
      <Head title="Maps" />

      <div className="relative flex min-h-dvh w-full flex-col md:h-dvh md:overflow-hidden">
        {/* Navbar */}
        <div
          className="relative z-50 flex flex-wrap items-center justify-between gap-2 p-3 md:absolute md:inset-x-0 md:top-0 md:p-4 bg-surface-secondary backdrop-blur-sm shadow-sm"
          onMouseEnter={() => setIsHoveringUI(true)}
          onMouseLeave={() => setIsHoveringUI(false)}
        >
          <Link href="/home" className="flex items-center">
            <IconArrowLeft className="mr-2" size={24} />
            <p className="text-lg text-text-secondary">Back to Home</p>
          </Link>

          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto">
            <input
              type="text"
              placeholder="lat,lng"
              aria-label="Latitude and longitude"
              value={coordinateSearch}
              onChange={(event) => setCoordinateSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCoordinateAction('fly')
              }}
              className="min-w-0 flex-1 basis-20 rounded md:w-52 md:flex-none md:basis-auto border border-border-default bg-surface-primary px-2 py-1 text-sm text-text-primary placeholder:text-text-muted focus:border-desert-green focus:outline-none"
            />

            <button
              type="button"
              onClick={() => handleCoordinateAction('fly')}
              className="rounded border border-border-default bg-surface-primary p-2 max-md:min-h-11 max-md:min-w-11 text-text-secondary hover:bg-surface-secondary"
              aria-label="Fly to coordinates"
              title="Fly to coordinates"
            >
              <IconPlaneTilt size={18}/>
            </button>

            <button
              type="button"
              onClick={() => handleCoordinateAction('marker')}
              className="rounded border border-border-default bg-surface-primary p-2 max-md:min-h-11 max-md:min-w-11 text-text-secondary hover:bg-surface-secondary"
              aria-label="Add marker at coordinates"
              title="Add marker at coordinates"
            >
              <IconMapPin size={18}/>
            </button>

            <button
              type="button"
              onClick={() => setShowCoordinatesEnabled((prev) => !prev)}
              className={`rounded border border-border-default p-2 max-md:min-h-11 max-md:min-w-11 transition-colors ${
                showCoordinatesEnabled
                  ? 'bg-desert-green text-white'
                  : 'bg-surface-primary text-text-secondary hover:bg-surface-secondary'
              }`}
              aria-label="Show map coordinates"
              aria-pressed={showCoordinatesEnabled}
              title={showCoordinatesEnabled ? 'Hide coordinates' : 'Show coordinates'}
            >
              <IconCrosshair size={18}/>
            </button>

            <Link href="/settings/maps" className="max-md:basis-full md:mr-4">
              <StyledButton variant="primary" icon="IconSettings">
                Manage Map Regions
              </StyledButton>
            </Link>
          </div>
        </div>

        {/* Alert */}
        {alertMessage && (
          <div
            className="relative z-50 md:absolute md:top-20 md:left-4 md:right-4"
            onMouseEnter={() => setIsHoveringUI(true)}
            onMouseLeave={() => setIsHoveringUI(false)}
          >
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

        {/* Map */}

        <div className="relative flex min-h-64 flex-1 [--nomad-map-control-right:10px] [--nomad-map-navigation-top:10px] [--nomad-map-fullscreen-top:10px] md:absolute md:inset-0 md:[--nomad-map-control-right:36px] md:[--nomad-map-navigation-top:110px] md:[--nomad-map-fullscreen-top:30px]">
          <MapComponent
            mapCommand={mapCommand}
            isHoveringUI={isHoveringUI}
            showCoordinatesEnabled={showCoordinatesEnabled}
          />
        </div>
      </div>
    </MapsLayout>
  )
}
