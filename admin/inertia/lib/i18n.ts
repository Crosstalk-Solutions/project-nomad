import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

export const defaultNS = 'common'

export const namespaces = [
  'common',
  'home',
  'settings',
  'chat',
  'supply_depot',
  'maps',
  'drug_reference',
  'easy_setup',
  'benchmark',
  'content',
  'updates',
  'errors',
  'docs',
] as const

export type AppNamespace = (typeof namespaces)[number]

const resources = {
  en: {
    common: {},
  },
  'pt-BR': {
    common: {},
  },
} as const

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
    resources: (typeof resources)['en']
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'pt-BR'],
    defaultNS,
    ns: [...namespaces],
    interpolation: {
      escapeValue: false, // React escapa por padrão
    },
    react: {
      useSuspense: false, // A app Inertia.js não usa <Suspense> na raiz de roteamento
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
    debug: import.meta.env.DEV,
  })

export default i18n
export { i18n }
