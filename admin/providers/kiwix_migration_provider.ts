import logger from '@adonisjs/core/services/logger'
import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Checks whether the installed kiwix container is still using the legacy glob-pattern
 * command (`*.zim --address=all`) and, if so, migrates it to library mode
 * (`--library /data/kiwix-library.xml --monitorLibrary --address=all`) automatically.
 *
 * This provider runs once on every admin startup. After migration the check is a no-op
 * (inspects the container and finds the new command).
 */
export default class KiwixMigrationProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    // Only run in the web (HTTP server) environment — skip for ace commands and tests
    if (this.app.getEnvironment() !== 'web') return

    // Defer past synchronous boot so DB connections and all providers are fully ready
    setImmediate(async () => {
      try {
        const Service = (await import('#models/service')).default
        const { SERVICE_NAMES } = await import('../constants/service_names.js')
        const { DockerService } = await import('#services/docker_service')

        const kiwixService = await Service.query()
          .where('service_name', SERVICE_NAMES.KIWIX)
          .first()

        if (!kiwixService?.installed) {
          logger.info('[KiwixMigrationProvider] Kiwix not installed — skipping migration check.')
          return
        }

        const dockerService = new DockerService()
        const isLegacy = await dockerService.isKiwixOnLegacyConfig()

        if (!isLegacy) {
          logger.info('[KiwixMigrationProvider] Kiwix is already in library mode — no migration needed.')
          return
        }

        logger.info('[KiwixMigrationProvider] Kiwix on legacy config — running automatic migration to library mode.')
        await dockerService.migrateKiwixToLibraryMode()
        logger.info('[KiwixMigrationProvider] Startup migration complete.')
      } catch (err: any) {
        logger.error(`[KiwixMigrationProvider] Startup migration failed: ${err.message}`)
        // Non-fatal: the next affectContainer('restart') call will retry via the
        // intercept in DockerService.affectContainer().
      }
    })
  }
}
