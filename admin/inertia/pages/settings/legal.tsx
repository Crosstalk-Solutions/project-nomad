import { Head } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import SettingsLayout from '~/layouts/SettingsLayout'

export default function LegalPage() {
  const { t } = useTranslation()
  return (
    <SettingsLayout>
      <Head title={t('legal.title')} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6 max-w-4xl">
          <h1 className="text-4xl font-semibold mb-8">{t('legal.heading')}</h1>

          {/* License Agreement */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('legal.licenseAgreement')}</h2>
            <p className="text-text-primary mb-3">{t('legal.copyright')}</p>
            <p className="text-text-primary mb-3">
              {t('legal.licenseText1')}
            </p>
            <p className="text-text-primary mb-3">
              <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://www.apache.org/licenses/LICENSE-2.0</a>
            </p>
            <p className="text-text-primary">
              {t('legal.licenseText2')}
            </p>
          </section>

          {/* Third-Party Software */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('legal.thirdParty')}</h2>
            <p className="text-text-primary mb-4">
              {t('legal.thirdPartyIntro')}
            </p>
            <ul className="space-y-3 text-text-primary">
              <li>
                <strong>Kiwix</strong> - {t('legal.kiwixDescription')}
                <br />
                <a href="https://kiwix.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://kiwix.org</a>
              </li>
              <li>
                <strong>Kolibri</strong> - {t('legal.kolibriDescription')}
                <br />
                <a href="https://learningequality.org/kolibri" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://learningequality.org/kolibri</a>
              </li>
              <li>
                <strong>Ollama</strong> - {t('legal.ollamaDescription')}
                <br />
                <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://ollama.com</a>
              </li>
              <li>
                <strong>CyberChef</strong> - {t('legal.cyberchefDescription')}
                <br />
                <a href="https://github.com/gchq/CyberChef" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://github.com/gchq/CyberChef</a>
              </li>
              <li>
                <strong>FlatNotes</strong> - {t('legal.flatnotesDescription')}
                <br />
                <a href="https://github.com/dullage/flatnotes" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://github.com/dullage/flatnotes</a>
              </li>
              <li>
                <strong>Qdrant</strong> - {t('legal.qdrantDescription')}
                <br />
                <a href="https://github.com/qdrant/qdrant" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://github.com/qdrant/qdrant</a>
              </li>
            </ul>
          </section>

          {/* Privacy Statement */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('legal.privacyStatement')}</h2>
            <p className="text-text-primary mb-3">
              {t('legal.privacyIntro')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-text-primary">
              <li><strong>{t('legal.zeroTelemetry')}</strong> {t('legal.zeroTelemetryText')}</li>
              <li><strong>{t('legal.localFirst')}</strong> {t('legal.localFirstText')}</li>
              <li><strong>{t('legal.noAccounts')}</strong> {t('legal.noAccountsText')}</li>
              <li><strong>{t('legal.networkOptional')}</strong> {t('legal.networkOptionalText')}</li>
            </ul>
          </section>

          {/* Content Disclaimer */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('legal.contentDisclaimer')}</h2>
            <p className="text-text-primary mb-3">
              {t('legal.contentDisclaimerText1')}
            </p>
            <p className="text-text-primary mb-3">
              {t('legal.contentDisclaimerText2')}
            </p>
            <p className="text-text-primary">
              {t('legal.contentDisclaimerText3')}
            </p>
          </section>

          {/* Medical Disclaimer */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('legal.medicalDisclaimer')}</h2>
            <p className="text-text-primary mb-3">
              {t('legal.medicalDisclaimerText1')}
            </p>
            <p className="text-text-primary mb-3 font-semibold">
              {t('legal.medicalDisclaimerText2')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-text-primary mb-3">
              <li>{t('legal.medicalPoint1')}</li>
              <li>{t('legal.medicalPoint2')}</li>
              <li>{t('legal.medicalPoint3')}</li>
              <li>{t('legal.medicalPoint4')}</li>
            </ul>
          </section>

          {/* Data Storage Notice */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{t('legal.dataStorage')}</h2>
            <p className="text-text-primary mb-3">
              {t('legal.dataStorageIntro')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-text-primary">
              <li><strong>{t('legal.installationDirectory')}</strong> /opt/project-nomad</li>
              <li><strong>{t('legal.downloadedContent')}</strong> /opt/project-nomad/storage</li>
              <li><strong>{t('legal.applicationData')}</strong> {t('legal.applicationDataValue')}</li>
            </ul>
            <p className="text-text-primary mt-3">
              {t('legal.dataStorageNote')}
            </p>
          </section>

        </main>
      </div>
    </SettingsLayout>
  )
}
