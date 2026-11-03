import { Head } from '@inertiajs/react'
import { IconExternalLink } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import SettingsLayout from '~/layouts/SettingsLayout'

export default function SupportPage() {
  const { t } = useTranslation('settings')

  return (
    <SettingsLayout>
      <Head title={t('support.head_title')} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6 max-w-4xl">
          <h1 className="text-4xl font-semibold mb-4">{t('support.title')}</h1>
          <p className="text-text-muted mb-10 text-lg">
            {t('support.subtitle')}
          </p>

          {/* Ko-fi */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">{t('support.kofi_title')}</h2>
            <p className="text-text-muted mb-4">
              {t('support.kofi_desc')}
            </p>
            <a
              href="https://ko-fi.com/crosstalk"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FF5E5B] hover:bg-[#e54e4b] text-white font-semibold rounded-lg transition-colors"
            >
              {t('support.kofi_button')}
              <IconExternalLink size={18} />
            </a>
          </section>

          {/* Rogue Support */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">{t('support.rogue_title')}</h2>
            <a
              href="https://rogue.support"
              target="_blank"
              rel="noopener noreferrer"
              className="block mb-4 rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
            >
              <img
                src="/rogue-support-banner.webp"
                alt="Rogue Support — Conquer Your Home Network"
                className="w-full"
              />
            </a>
            <p className="text-text-muted mb-4">
              {t('support.rogue_desc')}
            </p>
            <a
              href="https://rogue.support"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 hover:underline font-medium"
            >
              {t('support.rogue_button')}
              <IconExternalLink size={16} />
            </a>
          </section>

          {/* Other Ways to Help */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-3">{t('support.other_ways_title')}</h2>
            <ul className="space-y-2 text-text-muted">
              <li>
                <a
                  href="https://github.com/Crosstalk-Solutions/project-nomad"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {t('support.star_github')}
                </a>
                {' '}{t('support.star_github_desc')}
              </li>
              <li>
                <a
                  href="https://github.com/Crosstalk-Solutions/project-nomad/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {t('support.report_bugs')}
                </a>
                {' '}{t('support.report_bugs_desc')}
              </li>
              <li>{t('support.word_of_mouth')}</li>
              <li>
                <a
                  href="https://discord.com/invite/crosstalksolutions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {t('support.join_discord')}
                </a>
                {' '}{t('support.join_discord_desc')}
              </li>
            </ul>
          </section>

        </main>
      </div>
    </SettingsLayout>
  )
}
