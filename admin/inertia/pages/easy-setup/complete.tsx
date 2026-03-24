import { Head, router } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import AppLayout from '~/layouts/AppLayout'
import StyledButton from '~/components/StyledButton'
import Alert from '~/components/Alert'
import useInternetStatus from '~/hooks/useInternetStatus'
import useServiceInstallationActivity from '~/hooks/useServiceInstallationActivity'
import InstallActivityFeed from '~/components/InstallActivityFeed'
import ActiveDownloads from '~/components/ActiveDownloads'
import StyledSectionHeader from '~/components/StyledSectionHeader'

export default function EasySetupWizardComplete() {
  const { t } = useTranslation()
  const { isOnline } = useInternetStatus()
  const installActivity = useServiceInstallationActivity()

  return (
    <AppLayout>
      <Head title={t('easySetupComplete.title')} />
      {!isOnline && (
        <Alert
          title={t('easySetupComplete.noInternet')}
          message={t('easySetupComplete.noInternetMessage')}
          type="warning"
          variant="solid"
          className="mb-8"
        />
      )}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-surface-primary rounded-md shadow-md p-6">
          <StyledSectionHeader title={t('easySetupComplete.installActivity')} className=" mb-4" />
          <InstallActivityFeed
            activity={installActivity}
            className="!shadow-none border-desert-stone-light border"
          />
          <ActiveDownloads withHeader />
          <Alert
            title={t('easySetupComplete.runningInBackground')}
            message={t('easySetupComplete.runningInBackgroundMessage')}
            type="info"
            variant="solid"
            className='mt-12'
          />
          <div className="flex justify-center mt-8 pt-4 border-t border-desert-stone-light">
            <div className="flex space-x-4">
              <StyledButton onClick={() => router.visit('/home')} icon="IconHome">
                {t('easySetupComplete.goToHome')}
              </StyledButton>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
