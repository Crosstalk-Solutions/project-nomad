import type { MapPacksState } from '../../types/map_packs.js'
import { MapPackStore } from '../utils/map_pack_store.js'

export class MapPackService extends MapPackStore {
  static downloadsConfigured() {
    return Boolean(process.env.MAP_PACK_CATALOG_PATH || process.env.MAP_ROUTER_URL)
  }

  constructor() {
    super(
      process.env.MAP_PACKS_PATH || '/app/storage/map-packs',
      process.env.MAP_PACK_CATALOG_PATH || '/app/resources/map-packs/catalog.json',
      process.env.MAP_PACK_ALLOW_LOCAL_DOWNLOADS === 'true'
    )
  }

  async getState(): Promise<MapPacksState> {
    const state = await this.list()
    if (!state.activePackageId) return { ...state, routerReady: false }
    const baseUrl = process.env.MAP_ROUTER_URL
    if (!baseUrl) {
      return {
        ...state,
        routerReady: false,
        routerError: 'The offline routing service is not configured.',
      }
    }
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/status`, {
        signal: AbortSignal.timeout(2000),
      })
      const status = (await response.json()) as { ready?: boolean }
      if (!response.ok || status.ready !== true)
        throw new Error('Routing service is starting or unavailable')
      return { ...state, routerReady: true }
    } catch {
      return {
        ...state,
        routerReady: false,
        routerError: 'The offline routing service is starting or unavailable.',
      }
    }
  }
}
