import { Head } from '@inertiajs/react'
import { IconExternalLink } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import SettingsLayout from '~/layouts/SettingsLayout'

export default function SupportPage() {
  const { t } = useTranslation()

  return (
    <SettingsLayout>
      <Head title={t('settings_support.page_title')} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6 max-w-4xl">
          <h1 className="text-4xl font-semibold mb-4">{t('settings_support.heading')}</h1>
          <p className="text-text-muted mb-10 text-lg">
            {t('settings_support.intro')}
          </p>

          {/* Ko-fi */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">{t('settings_support.kofi_heading')}</h2>
            <p className="text-text-muted mb-4">
              {t('settings_support.kofi_description')}
            </p>
            <a
              href="https://ko-fi.com/crosstalk"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FF5E5B] hover:bg-[#e54e4b] text-white font-semibold rounded-lg transition-colors"
            >
              {t('settings_support.kofi_button')}
              <IconExternalLink size={18} />
            </a>
          </section>

          {/* Rogue Support */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">{t('settings_support.rogue_heading')}</h2>
            <a
              href="https://rogue.support"
              target="_blank"
              rel="noopener noreferrer"
              className="block mb-4 rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
            >
              <img
                src="/rogue-support-banner.webp"
                alt={t('settings_support.rogue_banner_alt')}
                className="w-full"
              />
            </a>
            <p className="text-text-muted mb-4">
              {t('settings_support.rogue_description')}
            </p>
            <a
              href="https://rogue.support"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 hover:underline font-medium"
            >
              {t('settings_support.rogue_link')}
              <IconExternalLink size={16} />
            </a>
          </section>

          {/* Other Ways to Help */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-3">{t('settings_support.other_heading')}</h2>
            <ul className="space-y-2 text-text-muted">
              <li>
                <a
                  href="https://github.com/Crosstalk-Solutions/project-nomad"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {t('settings_support.other_github_star_link')}
                </a>
                {' '}{t('settings_support.other_github_star_suffix')}
              </li>
              <li>
                <a
                  href="https://github.com/Crosstalk-Solutions/project-nomad/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {t('settings_support.other_bugs_link')}
                </a>
                {' '}{t('settings_support.other_bugs_suffix')}
              </li>
              <li>{t('settings_support.other_share')}</li>
              <li>
                <a
                  href="https://discord.com/invite/crosstalksolutions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {t('settings_support.other_discord_link')}
                </a>
                {' '}{t('settings_support.other_discord_suffix')}
              </li>
            </ul>
          </section>

        </main>
      </div>
    </SettingsLayout>
  )
}
