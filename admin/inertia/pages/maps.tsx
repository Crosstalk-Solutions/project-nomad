import MapsLayout from '~/layouts/MapsLayout'
import { Head, Link } from '@inertiajs/react'
import MapComponent from '~/components/maps/MapComponent'
import StyledButton from '~/components/StyledButton'
import { IconArrowLeft } from '@tabler/icons-react'
import { FileEntry } from '../../types/files'
import AlertWithButton from '~/components/AlertWithButton'

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
      <div className="flex border-b border-gray-900/10 p-4 justify-between">
        <Link href="/home" className="flex items-center">
          <IconArrowLeft className="mr-2" size={24} />
          <p className="text-lg text-gray-600">Back to Home</p>
        </Link>
        <Link href="/settings/maps">
          <StyledButton variant="primary" icon="IconSettings">
            Manage Map Regions
          </StyledButton>
        </Link>
      </div>
      <div className="w-full min-h-screen flex flex-col items-center justify-center py-4 mx-4">
        {alertMessage && (
          <AlertWithButton
            title={alertMessage}
            type="warning"
            variant="solid"
            className="w-full !mb-4"
            buttonProps={{
              variant: 'secondary',
              children: 'Go to Map Settings',
              icon: 'IconSettings',
              onClick: () => {
                window.location.href = '/settings/maps'
              },
            }}
          />
        )}
        <MapComponent />
      </div>
    </MapsLayout>
  )
}
