import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import fr from './fr.json'
import en from './en.json'

const STORAGE_KEY = 'nomad:language'

function detectLanguage(): 'fr' | 'en' {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'fr' || saved === 'en') return saved
  }
  const browserLng = navigator.language || ''
  return browserLng.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

const detectedLng = detectLanguage()

i18n.use(initReactI18next).init({
  lng: detectedLng,
  fallbackLng: 'en',
  defaultNS: 'translation',
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  interpolation: {
    escapeValue: false,
  },
})

export function setLanguage(lng: 'fr' | 'en') {
  i18n.changeLanguage(lng)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, lng)
  }
}

export function getLanguage(): 'fr' | 'en' {
  return (i18n.language as 'fr' | 'en') || 'fr'
}

export default i18n
