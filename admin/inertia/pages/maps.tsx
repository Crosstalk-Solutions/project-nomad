import MapsLayout from '~/layouts/MapsLayout'
import { Head, Link } from '@inertiajs/react'
import MapComponent from '~/components/maps/MapComponent'
import StyledButton from '~/components/StyledButton'
import { IconArrowLeft } from '@tabler/icons-react'
import { FileEntry } from '../../types/files'
import Alert from '~/components/Alert'

export default function Maps(props: {
  maps: { baseAssetsExist: boolean; regionFiles: FileEntry[] }
}) {
  const alertMessage = !props.maps.baseAssetsExist
    ? 'The base map assets have not been installed. Please download them first to enable map functionality.'
    : props.maps.regionFiles.length === 0
      ? 'No map regions have been downloaded yet. Please download some regions to enable map functionality.'
      : null

  return (
    <MapsLayout>
      <Head title="Maps" />
      <div className="relative w-full h-screen overflow-hidden">
        {/* Nav and alerts are overlayed */}
        <div className="absolute top-0 left-0 right-0 z-50 flex justify-between p-4 bg-gray-50 backdrop-blur-sm shadow-sm">
          <Link href="/home" className="flex items-center">
            <IconArrowLeft className="mr-2" size={24} />
            <p className="text-lg text-gray-600">Back to Home</p>
          </Link>
          <Link href="/settings/maps" className='mr-4'>
            <StyledButton variant="primary" icon="IconSettings">
              Manage Map Regions
            </StyledButton>
          </Link>
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
                onClick: () => {
                  window.location.href = '/settings/maps'
                },
              }}
            />
          </div>
        )}
        <div className="absolute inset-0">
          <MapComponent />
        </div>
      </div>
    </MapsLayout>
  )
}
