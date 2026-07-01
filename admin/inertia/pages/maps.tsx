import { useState } from 'react'
import { Head, Link, router } from '@inertiajs/react'
import { IconArrowLeft } from '@tabler/icons-react'

import MapsLayout from '~/layouts/MapsLayout'
import MapComponent from '~/components/maps/MapComponent'
import StyledButton from '~/components/StyledButton'
import Alert from '~/components/Alert'

import { FileEntry } from '../../types/files'

export default function Maps(props: {
  maps: { baseAssetsExist: boolean; regionFiles: FileEntry[] }
}) {
  const [isHoveringUI, setIsHoveringUI] = useState(false)
  const [showMapCoordinates, setShowMapCoordinates] = useState(true)

  const alertMessage = !props.maps.baseAssetsExist
    ? 'The base map assets have not been installed. Please download them first to enable map functionality.'
    : props.maps.regionFiles.length === 0
    ? 'No map regions have been downloaded yet. Please download some regions to enable map functionality.'
    : null

  return (
    <MapsLayout>
      <Head title="Maps" />

      <div className="relative w-full h-screen overflow-hidden">
        {/* Navbar */}
        <div
          className="absolute top-0 left-0 right-0 z-50 flex justify-between p-4 bg-surface-secondary backdrop-blur-sm shadow-sm"
          onMouseEnter={() => setIsHoveringUI(true)}
          onMouseLeave={() => setIsHoveringUI(false)}
        >
          <Link href="/home" className="flex items-center">
            <IconArrowLeft className="mr-2" size={24} />
            <p className="text-lg text-text-secondary">Back to Home</p>
          </Link>

          <div className="flex items-center gap-3 mr-4">
            <button
              type="button"
              onClick={() => setShowMapCoordinates((prev) => !prev)}
              className="rounded px-3 py-2 text-sm bg-surface-primary text-text-secondary hover:opacity-80 transition"
            >
              {showMapCoordinates ? 'Hide Coordinates' : 'Show Coordinates'}
            </button>

            <Link href="/settings/maps">
              <StyledButton variant="primary" icon="IconSettings">
                Manage Map Regions
              </StyledButton>
            </Link>
          </div>
        </div>

        {/* Alert */}
        {alertMessage && (
          <div
            className="absolute top-20 left-4 right-4 z-50"
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
        <div className="absolute inset-0">
          <MapComponent
            isHoveringUI={isHoveringUI}
            showCoordinatesEnabled={showMapCoordinates}
          />
        </div>
      </div>
    </MapsLayout>
  )
}
