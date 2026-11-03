import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation('errors')

  return (
    <>
      <div className="container">
        <div className="title">{t('not_found.title')}</div>

        <span>{t('not_found.message')}</span>
      </div>
    </>
  )
}
