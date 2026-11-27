import type { StyleSpecification } from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState } from 'react'

import { WORLD_OFFLINE_API, type WorldInventory, type WorldPack } from '../../../types/world_offline'
import { LOCAL_DETAIL_API, type LocalDetailInventory } from '../../../types/local_detail'

type InstalledPack = Pick<WorldPack, 'id' | 'role' | 'archives'> & { generation?: string }
type Resource<T> = { value: T | null; failed: boolean }

const INVENTORY_POLL_MS = 8_000
const RETRY_DELAYS = [350, 1_200, 4_000]
const OUTAGE_RETRY_MS = 15_000
const REQUEST_TIMEOUT_MS = 6_000

function readStyle(value: unknown): StyleSpecification {
  const data = value as StyleSpecification
  if (data?.version !== 8 || !data.sources || !Array.isArray(data.layers)) {
    throw new Error('Map style unavailable')
  }
  return data
}

function readInstalledPacks(value: unknown): InstalledPack[] {
  const data = value as WorldInventory
  if (!Array.isArray(data?.packs)) throw new Error('Offline map inventory unavailable')
  return data.packs.filter((pack) => pack.installed && (pack.role === 'elevation' || Array.isArray(pack.archives)))
    .map(({ id, role, archives }) => role === 'elevation'
      ? { id, role, archives, generation: archives?.length
        ? archives.map(({ filename, sha256 }) => filename + ':' + sha256).sort().join('|')
        : data.generation }
      : { id, role, archives })
}

function useLocalMapResource<T>(enabled: boolean, url: string, decode: (data: unknown) => T, pollMs = 0) {
  const [resource, setResource] = useState<Resource<T>>({ value: null, failed: false })
  const refreshRef = useRef<(() => void) | null>(null)
  const refresh = useCallback(() => refreshRef.current?.(), [])

  useEffect(() => {
    if (!enabled) return
    let closed = false
    let request: AbortController | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    let serialized: string | undefined

    const load = async () => {
      if (closed || request) return
      clearTimeout(timer)
      const controller = new AbortController()
      request = controller
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('Map request failed')
        const decoded = decode(await response.json())
        if (closed) return
        failures = 0
        const next = JSON.stringify(decoded)
        if (next !== serialized) {
          serialized = next
          setResource({ value: decoded, failed: false })
        }
      } catch {
        if (closed) return
        failures += 1
        setResource((old) => old.value || old.failed ? old : { value: null, failed: true })
      } finally {
        clearTimeout(timeout)
        request = undefined
        const delay = failures ? RETRY_DELAYS[failures - 1] ?? OUTAGE_RETRY_MS : pollMs
        if (!closed && delay) timer = setTimeout(refreshVisible, delay)
      }
    }
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }

    refreshRef.current = () => { void load() }
    void load()
    window.addEventListener('focus', refreshVisible)
    window.addEventListener('online', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      closed = true
      refreshRef.current = null
      clearTimeout(timer)
      request?.abort()
      window.removeEventListener('focus', refreshVisible)
      window.removeEventListener('online', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [enabled, url, decode, pollMs])

  return { ...resource, refresh }
}

function readLocalDetails(value: unknown) {
  const inventory = value as LocalDetailInventory
  if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.cells)) throw new Error('Regional inventory unavailable')
  return inventory
}

export function useOfflineMapData(enabled: boolean, localDetailEnabled = false) {
  const style = useLocalMapResource(enabled, '/api/maps/styles', readStyle)
  const world = useLocalMapResource(enabled, WORLD_OFFLINE_API, readInstalledPacks, INVENTORY_POLL_MS)
  const local = useLocalMapResource(localDetailEnabled, LOCAL_DETAIL_API, readLocalDetails, INVENTORY_POLL_MS)
  return { style, world, local }
}

export function archiveRequestUrl(url: string) {
  return url.replace(/\/\d+\/\d+\/\d+$/, '')
}
