import { Head } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import SettingsLayout from '~/layouts/SettingsLayout'

export default function LegalPage() {
  const { t } = useTranslation('settings')

  return (
    <SettingsLayout>
      <Head title={t('legal.head_title')} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6 max-w-4xl">
          <h1 className="text-4xl font-semibold mb-8">{t('legal.title')}</h1>

          {/* License Agreement */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('legal.license_title')}</h2>
            <p className="text-text-primary mb-3">{t('legal.license_copyright')}</p>
            <p className="text-text-primary mb-3">
              {t('legal.license_intro')}
            </p>
            <p className="text-text-primary mb-3">
              <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://www.apache.org/licenses/LICENSE-2.0</a>
            </p>
            <p className="text-text-primary">
              {t('legal.license_terms')}
            </p>
          </section>

          {/* Third-Party Software */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('legal.attribution_title')}</h2>
            <p className="text-text-primary mb-4">
              {t('legal.attribution_intro')}
            </p>
            <ul className="space-y-3 text-text-primary">
              <li>
                <strong>Kiwix</strong> - {t('legal.attribution_kiwix')}
                <br />
                <a href="https://kiwix.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://kiwix.org</a>
              </li>
              <li>
                <strong>Kolibri</strong> - {t('legal.attribution_kolibri')}
                <br />
                <a href="https://learningequality.org/kolibri" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://learningequality.org/kolibri</a>
              </li>
              <li>
                <strong>Ollama</strong> - {t('legal.attribution_ollama')}
                <br />
                <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://ollama.com</a>
              </li>
              <li>
                <strong>CyberChef</strong> - {t('legal.attribution_cyberchef')}
                <br />
                <a href="https://github.com/gchq/CyberChef" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://github.com/gchq/CyberChef</a>
              </li>
              <li>
                <strong>FlatNotes</strong> - {t('legal.attribution_flatnotes')}
                <br />
                <a href="https://github.com/dullage/flatnotes" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://github.com/dullage/flatnotes</a>
              </li>
              <li>
                <strong>Qdrant</strong> - {t('legal.attribution_qdrant')}
                <br />
                <a href="https://github.com/qdrant/qdrant" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://github.com/qdrant/qdrant</a>
              </li>
            </ul>
          </section>

          {/* Privacy Statement */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('legal.privacy_title')}</h2>
            <p className="text-text-primary mb-3">
              {t('legal.privacy_intro')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-text-primary">
              <li><strong>{t('legal.privacy_telemetry_title')}</strong> {t('legal.privacy_telemetry_desc')}</li>
              <li><strong>{t('legal.privacy_local_title')}</strong> {t('legal.privacy_local_desc')}</li>
              <li><strong>{t('legal.privacy_accounts_title')}</strong> {t('legal.privacy_accounts_desc')}</li>
              <li><strong>{t('legal.privacy_network_title')}</strong> {t('legal.privacy_network_desc')}</li>
            </ul>
          </section>

          {/* Content Disclaimer */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('legal.content_disclaimer_title')}</h2>
            <p className="text-text-primary mb-3">
              {t('legal.content_disclaimer_p1')}
            </p>
            <p className="text-text-primary mb-3">
              {t('legal.content_disclaimer_p2')}
            </p>
            <p className="text-text-primary">
              {t('legal.content_disclaimer_p3')}
            </p>
          </section>

          {/* Medical Disclaimer */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('legal.medical_disclaimer_title')}</h2>
            <p className="text-text-primary mb-3">
              {t('legal.medical_disclaimer_p1')}
            </p>
            <p className="text-text-primary mb-3 font-semibold">
              {t('legal.medical_disclaimer_warning')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-text-primary mb-3">
              <li>{t('legal.medical_disclaimer_li1')}</li>
              <li>{t('legal.medical_disclaimer_li2')}</li>
              <li>{t('legal.medical_disclaimer_li3')}</li>
              <li>{t('legal.medical_disclaimer_li4')}</li>
            </ul>
          </section>

          {/* Data Storage Notice */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('legal.data_storage_title')}</h2>
            <p className="text-text-primary mb-3">
              {t('legal.data_storage_intro')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-text-primary">
              <li><strong>{t('legal.data_storage_install_dir')}</strong> /opt/project-nomad</li>
              <li><strong>{t('legal.data_storage_downloaded_content')}</strong> /opt/project-nomad/storage</li>
              <li><strong>{t('legal.data_storage_app_data')}</strong> {t('legal.data_storage_docker_volumes')}</li>
            </ul>
            <p className="text-text-primary mt-3">
              {t('legal.data_storage_outro')}
            </p>
          </section>

        </main>
      </div>
    </SettingsLayout>
  )
}
