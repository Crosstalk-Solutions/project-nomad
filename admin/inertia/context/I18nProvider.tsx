import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import fr from '~/locales/fr.json'
export type Locale = 'en' | 'fr'
const key = 'nomad.ui.locale'
function detect(): Locale {
  if (typeof window === 'undefined') return 'en'
  try { const stored = window.localStorage.getItem(key); if (stored === 'fr' || stored === 'en') return stored } catch {}
  return window.navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}
type State = { locale: Locale; setLocale: (v: Locale) => void; t: (s: string) => string }
const Context = createContext<State | null>(null)
export function I18nProvider({children}: {children: ReactNode}) {
  const [locale,setLocale] = useState<Locale>(detect)
  useEffect(() => { document.documentElement.lang = locale; try { window.localStorage.setItem(key,locale) } catch {} },[locale])
  const state = useMemo<State>(()=>({locale,setLocale,t: (s)=>locale==='fr' ? (fr as Record<string,string>)[s] ?? s : s}),[locale])
  return <Context.Provider value={state}>{children}</Context.Provider>
}
export function useI18n() { const c = useContext(Context); if (!c) throw new Error('I18nProvider missing'); return c }
