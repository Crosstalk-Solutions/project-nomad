import axios from 'axios'

export type MapRoutingSettings = { mode: 'automatic' } | { mode: 'fixed'; regionId: string }
export type MapRoutingSettingsState = MapRoutingSettings & {
  available: boolean
  regionName?: string
  message?: string
}
export const MAP_ROUTING_SETTINGS_KEY = ['map-routing-settings'] as const
export async function getMapRoutingSettings(
  signal?: AbortSignal
): Promise<MapRoutingSettingsState> {
  return (await axios.get('/api/maps/routing/settings', { signal })).data
}
export async function saveMapRoutingSettings(
  settings: MapRoutingSettings
): Promise<MapRoutingSettingsState> {
  return (await axios.put('/api/maps/routing/settings', settings)).data
}
