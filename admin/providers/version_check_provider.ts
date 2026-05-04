import logger from '@adonisjs/core/services/logger'
import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Self-heals stale `system.updateAvailable` after a sidecar-driven update.
 *
 * When the admin container is recreated on a new image, the KVStore still
 * carries pre-update values for `system.updateAvailable` and
 * `system.latestVersion`. Without intervention the UI keeps showing the
 * "update available" banner until the next scheduled CheckUpdateJob (could be up to ~12h).
 *
 * Synchronous self-heal (no network): if the cached "latest" is not newer
 * than the version we are now running, clear `updateAvailable`. The next
 * scheduled CheckUpdateJob refreshes the cache from GitHub — we deliberately
 * do not hit the network from boot to avoid coupling container startup to
 * a network request to Github (e.g. container restart loop = flooding GitHub with requests).
 *
 * Note: this provider does not set `updateAvailable` to true if the cached
 * "latest" is newer than the current version. We rely on the next scheduled
 * CheckUpdateJob to do that, to avoid false positives in case of a stale cache.
 */
export default class VersionCheckProvider {
  constructor(protected app: ApplicationService) { }

  async boot() {
    if (this.app.getEnvironment() !== 'web') return

    setImmediate(async () => {
      try {
        const KVStore = (await import('#models/kv_store')).default
        const { SystemService } = await import('#services/system_service')
        const { isNewerVersion } = await import('../app/utils/version.js')

        const current = SystemService.getAppVersion()
        if (current === 'dev' || current === '0.0.0'){
          logger.info(`[VersionCheckProvider] Skipping self-heal for version ${current}. Appears to be a dev build without proper version set.`)
          return
        }

        logger.info(`[VersionCheckProvider] Checking for stale updateAvailable (current=${current})`)

        const cachedLatest = (await KVStore.getValue('system.latestVersion')) as string | null
        const earlyAccess = ((await KVStore.getValue('system.earlyAccess')) ?? false) as boolean

        if (cachedLatest && !isNewerVersion(cachedLatest, current, earlyAccess)) {
          await KVStore.setValue('system.updateAvailable', false)
          logger.info(
            `[VersionCheckProvider] Cleared stale updateAvailable (cached=${cachedLatest}, current=${current})`
          )
        }
      } catch (err: any) {
        logger.warn(`[VersionCheckProvider] Self-heal skipped: ${err?.message ?? err}`)
      }
    })
  }
}
