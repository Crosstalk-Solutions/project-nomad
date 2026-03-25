import MapsLayout from '~/layouts/MapsLayout'
import { Head, Link } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import MapComponent from '~/components/maps/MapComponent'
import StyledButton from '~/components/StyledButton'
import { IconArrowLeft } from '@tabler/icons-react'
import { FileEntry } from '../../types/files'
import Alert from '~/components/Alert'

export default function Maps(props: {
  maps: { baseAssetsExist: boolean; regionFiles: FileEntry[] }
}) {
  const { t } = useTranslation()
  const alertMessage = !props.maps.baseAssetsExist
    ? t('maps.alertNoBaseAssets')
    : props.maps.regionFiles.length === 0
      ? t('maps.alertNoRegions')
      : null

  return (
    <MapsLayout>
      <Head title={t('maps.title')} />
      <div className="relative w-full h-screen overflow-hidden">
        {/* Nav and alerts are overlayed */}
        <div className="absolute top-0 left-0 right-0 z-50 flex justify-between p-4 bg-surface-secondary backdrop-blur-sm shadow-sm">
          <Link href="/home" className="flex items-center">
            <IconArrowLeft className="mr-2" size={24} />
            <p className="text-lg text-text-secondary">{t('layout.backToHome')}</p>
          </Link>
          <Link href="/settings/maps" className='mr-4'>
            <StyledButton variant="primary" icon="IconSettings">
              {t('maps.manageRegions')}
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
                children: t('maps.goToSettings'),
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
