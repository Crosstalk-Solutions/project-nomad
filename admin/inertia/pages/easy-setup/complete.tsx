import { Head, router } from '@inertiajs/react'
import AppLayout from '~/layouts/AppLayout'
import StyledButton from '~/components/StyledButton'
import Alert from '~/components/Alert'
import useInternetStatus from '~/hooks/useInternetStatus'
import useServiceInstallationActivity from '~/hooks/useServiceInstallationActivity'
import InstallActivityFeed from '~/components/InstallActivityFeed'
import ActiveDownloads from '~/components/ActiveDownloads'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import { useTranslation } from 'react-i18next'

export default function EasySetupWizardComplete() {
  const { t } = useTranslation('easy_setup')
  const { isOnline } = useInternetStatus()
  const installActivity = useServiceInstallationActivity()

  return (
    <AppLayout>
      <Head title={t('complete.title')} />
      {!isOnline && (
        <Alert
          title={t('complete.no_internet_title')}
          message={t('complete.no_internet_message')}
          type="warning"
          variant="solid"
          className="mb-8"
        />
      )}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-surface-primary rounded-md shadow-md p-6">
          <StyledSectionHeader title={t('complete.section_activity')} className=" mb-4" />
          <InstallActivityFeed
            activity={installActivity}
            className="!shadow-none border-desert-stone-light border"
          />
          <ActiveDownloads withHeader />
          <Alert
            title={t('complete.background_alert_title')}
            message={t('complete.background_alert_message')}
            type="info"
            variant="solid"
            className="mt-12"
          />
          <div className="flex justify-center mt-8 pt-4 border-t border-desert-stone-light">
            <div className="flex space-x-4">
              <StyledButton onClick={() => router.visit('/home')} icon="IconHome">
                {t('complete.go_to_home')}
              </StyledButton>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
