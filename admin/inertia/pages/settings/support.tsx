import { Head } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import { IconExternalLink } from '@tabler/icons-react'
import SettingsLayout from '~/layouts/SettingsLayout'

export default function SupportPage() {
  const { t } = useTranslation()

  return (
    <SettingsLayout>
      <Head title={`${t('support.title')} | Project N.O.M.A.D.`} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6 max-w-4xl">
          <h1 className="text-4xl font-semibold mb-4">{t('support.title')}</h1>
          <p className="text-text-muted mb-10 text-lg">
            {t('support.subtitle')}
          </p>

          {/* Ko-fi */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">{t('support.kofiTitle')}</h2>
            <p className="text-text-muted mb-4">
              {t('support.kofiDescription')}
            </p>
            <a
              href="https://ko-fi.com/crosstalk"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FF5E5B] hover:bg-[#e54e4b] text-white font-semibold rounded-lg transition-colors"
            >
              {t('support.kofiButton')}
              <IconExternalLink size={18} />
            </a>
          </section>

          {/* Rogue Support */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">{t('support.rogueTitle')}</h2>
            <a
              href="https://roguesupport.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block mb-4 rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
            >
              <img
                src="/rogue-support-banner.png"
                alt={t('support.rogueBannerAlt')}
                className="w-full"
              />
            </a>
            <p className="text-text-muted mb-4">
              {t('support.rogueDescription')}
            </p>
            <a
              href="https://roguesupport.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 hover:underline font-medium"
            >
              {t('support.rogueButton')}
              <IconExternalLink size={16} />
            </a>
          </section>

          {/* Other Ways to Help */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-3">{t('support.otherTitle')}</h2>
            <ul className="space-y-2 text-text-muted">
              <li>
                <a
                  href="https://github.com/Crosstalk-Solutions/project-nomad"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {t('support.starOnGithub')}
                </a>
                {' '}— {t('support.starOnGithubSuffix')}
              </li>
              <li>
                <a
                  href="https://github.com/Crosstalk-Solutions/project-nomad/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {t('support.reportBugs')}
                </a>
                {' '}— {t('support.reportBugsSuffix')}
              </li>
              <li>{t('support.shareNomad')}</li>
              <li>
                <a
                  href="https://discord.com/invite/crosstalksolutions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {t('support.joinDiscord')}
                </a>
                {' '}— {t('support.joinDiscordSuffix')}
              </li>
            </ul>
          </section>

        </main>
      </div>
    </SettingsLayout>
  )
}
