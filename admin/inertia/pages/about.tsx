import { useTranslation } from 'react-i18next'
import AppLayout from '~/layouts/AppLayout'

export default function About() {
  const { t } = useTranslation()

  return (
    <AppLayout>
      <div className="p-2">{t('about.hello')}</div>
    </AppLayout>
  )
}
