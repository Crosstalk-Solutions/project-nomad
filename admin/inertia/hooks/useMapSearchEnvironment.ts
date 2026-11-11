import { useCallback, useEffect, useState } from 'react'
import {
  MAP_BASE_STORAGE_KEY,
  parseBrowserMapBase,
  validSearchCenter,
  type BrowserMapBase,
  type SearchMapView,
} from '../../app/utils/map_omnibox'

export type MapSearchEnvironment = ReturnType<typeof useMapSearchEnvironment>
export default function useMapSearchEnvironment() {
  const [base, setBaseState] = useState<BrowserMapBase | null>(() => {
    try {
      return parseBrowserMapBase(localStorage.getItem(MAP_BASE_STORAGE_KEY))
    } catch {
      return null
    }
  })
  const [view, setView] = useState<SearchMapView | null>(null)
  const [persistenceError, setPersistenceError] = useState('')
  const onViewChange = useCallback((point: SearchMapView) => {
    const center = {
      ...point,
      lat: point.lat,
      lon: ((((point.lon + 180) % 360) + 360) % 360) - 180,
    }
    if (validSearchCenter(center)) setView(center)
  }, [])
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key === MAP_BASE_STORAGE_KEY) setBaseState(parseBrowserMapBase(event.newValue))
    }
    window.addEventListener('storage', update)
    return () => window.removeEventListener('storage', update)
  }, [])
  const setBase = (value: BrowserMapBase | null) => {
    setBaseState(value)
    setPersistenceError('')
    try {
      if (value) localStorage.setItem(MAP_BASE_STORAGE_KEY, JSON.stringify(value))
      else localStorage.removeItem(MAP_BASE_STORAGE_KEY)
    } catch {
      setPersistenceError(
        'Base could not be saved in this browser. It remains available for this visit.'
      )
    }
  }
  return {
    base,
    setBase,
    view,
    onViewChange,
    persistenceError,
  }
}
