import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { OfflineRouteError } from '../utils/offline_route.js'

export type MapRoutingSettings = { mode: 'automatic' } | { mode: 'fixed'; regionId: string }
export type MapRoutingSettingsState = MapRoutingSettings & {
  available: boolean
  regionName?: string
  message?: string
}
type InstalledRegion = { id: string; name: string }

/** A local preference, separate from installed graph manifests and URL overrides. */
export class MapRoutingSettingsService {
  readonly filename: string
  constructor(root = process.env.MAP_REGIONS_PATH || '/app/storage/map-regions') {
    this.filename = join(resolve(root), 'routing-settings.json')
  }
  private parse(value: unknown): MapRoutingSettings {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new OfflineRouteError('Choose automatic routing or an installed fixed region.')
    const input = value as Record<string, unknown>
    if (Object.keys(input).some((key) => !['mode', 'regionId'].includes(key)))
      throw new OfflineRouteError(
        'Routing settings accept only mode and regionId; version pins belong to explicit route requests.'
      )
    if (input.mode === 'automatic') return { mode: 'automatic' }
    if (
      input.mode !== 'fixed' ||
      typeof input.regionId !== 'string' ||
      !/^(packs|regions):[a-z0-9][a-z0-9_-]{0,119}$/.test(input.regionId)
    )
      throw new OfflineRouteError(
        'Choose an installed routing region using its packs: or regions: ID.'
      )
    return { mode: 'fixed', regionId: input.regionId }
  }
  async read(): Promise<MapRoutingSettings> {
    try {
      return this.parse(JSON.parse(await readFile(this.filename, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { mode: 'automatic' }
      throw new OfflineRouteError(
        'The saved routing settings could not be read. Save a valid selection in Map Settings before calculating routes.',
        409
      )
    }
  }
  async state(regions: InstalledRegion[]): Promise<MapRoutingSettingsState> {
    const settings = await this.read()
    if (settings.mode === 'automatic') return { ...settings, available: true }
    const selected = regions.find((region) => region.id === settings.regionId)
    return {
      ...settings,
      available: !!selected,
      regionName: selected?.name,
      message: selected
        ? undefined
        : 'The fixed routing region is no longer installed. Choose another region or automatic routing in Map Settings.',
    }
  }
  async save(value: unknown, regions: InstalledRegion[]): Promise<MapRoutingSettingsState> {
    const settings = this.parse(value)
    if (settings.mode === 'fixed' && !regions.some((region) => region.id === settings.regionId))
      throw new OfflineRouteError(
        'The selected routing region is not installed. Choose an installed region or automatic routing.',
        409
      )
    await mkdir(resolve(this.filename, '..'), { recursive: true })
    const temporary = this.filename + '.' + randomUUID() + '.tmp'
    try {
      await writeFile(temporary, JSON.stringify(settings))
      await rename(temporary, this.filename)
    } finally {
      await rm(temporary, { force: true })
    }
    return this.state(regions)
  }
}
