import MapsLayout from '~/layouts/MapsLayout'
import { Head, Link } from '@inertiajs/react'
import MapComponent from '~/components/maps/MapComponent'
import StyledButton from '~/components/StyledButton'
import { IconArrowLeft } from '@tabler/icons-react'

export default function Maps() {
  return (
    <MapsLayout>
      <Head title="Maps" />
      <div className="flex border-b border-gray-900/10 p-4 justify-between">
        <Link href="/home" className="flex items-center">
          <IconArrowLeft className="mr-2" size={24} />
          <p className="text-lg text-gray-600">Back to Home</p>
        </Link>
        <Link href="/settings/maps">
          <StyledButton variant="primary" icon="Cog6ToothIcon">
            Manage Map Regions
          </StyledButton>
        </Link>
      </div>
      <div className="w-full h-full flex p-4 justify-center items-center">
        <MapComponent />
      </div>
    </MapsLayout>
  )
}
