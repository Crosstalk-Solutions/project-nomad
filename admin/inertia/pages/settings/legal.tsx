import { Head } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import SettingsLayout from '~/layouts/SettingsLayout'

export default function LegalPage() {
  const { t } = useTranslation()

  return (
    <SettingsLayout>
      <Head title={t('settings_legal.page_title')} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6 max-w-4xl">
          <h1 className="text-4xl font-semibold mb-8">{t('settings_legal.heading')}</h1>

          {/* License Agreement */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('settings_legal.license.heading')}</h2>
            <p className="text-text-primary mb-3">{t('settings_legal.license.copyright')}</p>
            <p className="text-text-primary mb-3">
              {t('settings_legal.license.body1')}
            </p>
            <p className="text-text-primary mb-3">
              <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://www.apache.org/licenses/LICENSE-2.0</a>
            </p>
            <p className="text-text-primary">
              {t('settings_legal.license.body2')}
            </p>
          </section>

          {/* Third-Party Software */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('settings_legal.third_party.heading')}</h2>
            <p className="text-text-primary mb-4">
              {t('settings_legal.third_party.intro')}
            </p>
            <ul className="space-y-3 text-text-primary">
              <li>
                <strong>Kiwix</strong> - {t('settings_legal.third_party.kiwix')}
                <br />
                <a href="https://kiwix.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://kiwix.org</a>
              </li>
              <li>
                <strong>Kolibri</strong> - {t('settings_legal.third_party.kolibri')}
                <br />
                <a href="https://learningequality.org/kolibri" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://learningequality.org/kolibri</a>
              </li>
              <li>
                <strong>Ollama</strong> - {t('settings_legal.third_party.ollama')}
                <br />
                <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://ollama.com</a>
              </li>
              <li>
                <strong>CyberChef</strong> - {t('settings_legal.third_party.cyberchef')}
                <br />
                <a href="https://github.com/gchq/CyberChef" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://github.com/gchq/CyberChef</a>
              </li>
              <li>
                <strong>FlatNotes</strong> - {t('settings_legal.third_party.flatnotes')}
                <br />
                <a href="https://github.com/dullage/flatnotes" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://github.com/dullage/flatnotes</a>
              </li>
              <li>
                <strong>Qdrant</strong> - {t('settings_legal.third_party.qdrant')}
                <br />
                <a href="https://github.com/qdrant/qdrant" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://github.com/qdrant/qdrant</a>
              </li>
            </ul>
          </section>

          {/* Privacy Statement */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('settings_legal.privacy.heading')}</h2>
            <p className="text-text-primary mb-3">
              {t('settings_legal.privacy.intro')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-text-primary">
              <li><strong>{t('settings_legal.privacy.zero_telemetry_label')}</strong> {t('settings_legal.privacy.zero_telemetry')}</li>
              <li><strong>{t('settings_legal.privacy.local_first_label')}</strong> {t('settings_legal.privacy.local_first')}</li>
              <li><strong>{t('settings_legal.privacy.no_accounts_label')}</strong> {t('settings_legal.privacy.no_accounts')}</li>
              <li><strong>{t('settings_legal.privacy.network_optional_label')}</strong> {t('settings_legal.privacy.network_optional')}</li>
            </ul>
          </section>

          {/* Content Disclaimer */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('settings_legal.content_disclaimer.heading')}</h2>
            <p className="text-text-primary mb-3">
              {t('settings_legal.content_disclaimer.body1')}
            </p>
            <p className="text-text-primary mb-3">
              {t('settings_legal.content_disclaimer.body2')}
            </p>
            <p className="text-text-primary">
              {t('settings_legal.content_disclaimer.body3')}
            </p>
          </section>

          {/* Medical Disclaimer */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('settings_legal.medical_disclaimer.heading')}</h2>
            <p className="text-text-primary mb-3">
              {t('settings_legal.medical_disclaimer.body1')}
            </p>
            <p className="text-text-primary mb-3 font-semibold">
              {t('settings_legal.medical_disclaimer.warning')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-text-primary mb-3">
              <li>{t('settings_legal.medical_disclaimer.item1')}</li>
              <li>{t('settings_legal.medical_disclaimer.item2')}</li>
              <li>{t('settings_legal.medical_disclaimer.item3')}</li>
              <li>{t('settings_legal.medical_disclaimer.item4')}</li>
            </ul>
          </section>

          {/* Data Storage Notice */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('settings_legal.data_storage.heading')}</h2>
            <p className="text-text-primary mb-3">
              {t('settings_legal.data_storage.intro')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-text-primary">
              <li><strong>{t('settings_legal.data_storage.install_dir_label')}</strong> /opt/project-nomad</li>
              <li><strong>{t('settings_legal.data_storage.content_dir_label')}</strong> /opt/project-nomad/storage</li>
              <li><strong>{t('settings_legal.data_storage.app_data_label')}</strong> {t('settings_legal.data_storage.app_data')}</li>
            </ul>
            <p className="text-text-primary mt-3">
              {t('settings_legal.data_storage.footer')}
            </p>
          </section>

        </main>
      </div>
    </SettingsLayout>
  )
}
