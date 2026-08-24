import { Head } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import SettingsLayout from '~/layouts/SettingsLayout'
import CreatorPacksSection from '~/components/CreatorPacksSection'
import ActiveDownloads from '~/components/ActiveDownloads'
import useCreatorPacks from '~/hooks/useCreatorPacks'

export default function CreatorPacksPage() {
  const { t } = useTranslation()
  const { configured } = useCreatorPacks()

  return (
    <SettingsLayout>
      <Head title={t('settings_creator_packs.page_title')} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <h1 className="text-4xl font-semibold mb-2">{t('settings_creator_packs.heading')}</h1>
          <p className="text-text-muted mb-4">
            {t('settings_creator_packs.description')}
          </p>

          {configured ? (
            <>
              <CreatorPacksSection allowUninstall />
              <div className="mt-10">
                <ActiveDownloads filetype="zim" withHeader />
              </div>
            </>
          ) : (
            <p className="text-text-muted mt-4">
              {t('settings_creator_packs.not_available')}
            </p>
          )}
        </main>
      </div>
    </SettingsLayout>
  )
}
