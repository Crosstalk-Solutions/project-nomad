import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation()

  return (
    <>
      <div className="container">
        <div className="title">{t('errors.not_found.title')}</div>

        <span>{t('errors.not_found.description')}</span>
      </div>
    </>
  )
}
