import { useTranslation } from 'react-i18next'
import { setLanguage, getLanguage } from '../i18n'

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const current = getLanguage()

  function toggle() {
    setLanguage(current === 'fr' ? 'en' : 'fr')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={current === 'fr' ? 'Switch to English' : 'Passer en français'}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-colors border border-transparent hover:border-desert-stone-lighter"
    >
      {current === 'fr' ? '🇬🇧 EN' : '🇧🇪 FR'}
    </button>
  )
}
