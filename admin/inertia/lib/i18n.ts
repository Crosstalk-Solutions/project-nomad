import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Import all translation files
import enCommon from '~/locales/en/common.json'
import enHome from '~/locales/en/home.json'
import enSettings from '~/locales/en/settings.json'
import enLayout from '~/locales/en/layout.json'

import ptBRCommon from '~/locales/pt-BR/common.json'
import ptBRHome from '~/locales/pt-BR/home.json'
import ptBRSettings from '~/locales/pt-BR/settings.json'
import ptBRLayout from '~/locales/pt-BR/layout.json'

const savedLanguage = (() => {
  try {
    return localStorage.getItem('nomad:language') || 'en'
  } catch {
    return 'en'
  }
})()

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      home: enHome,
      settings: enSettings,
      layout: enLayout,
    },
    'pt-BR': {
      common: ptBRCommon,
      home: ptBRHome,
      settings: ptBRSettings,
      layout: ptBRLayout,
    },
  },
  lng: savedLanguage,
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
