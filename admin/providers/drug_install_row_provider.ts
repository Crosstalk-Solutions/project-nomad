import logger from '@adonisjs/core/services/logger'
import type { ApplicationService } from '@adonisjs/core/types'
import type { ZimCategoriesSpec } from '../types/collections.js'

/**
 * Backfills the FDA drug dataset's `installed_resources` row when a completed
 * ingest has none.
 *
 * On 1.34.0 `installed_resources.resource_type` was still enum('zim','map'), so
 * every drug ingest landed its 261k labels, reported `ready`, and lost the
 * 'dataset' row write. The migration that widens the enum can't recreate the
 * row, and re-selecting the tier won't either (ZimService skips a dataset that
 * already has rows), so Medicine stayed stuck below its Standard tier. Manual
 * ingests and reset-and-reingest runs dispatch without resourceMeta and end in
 * the same state.
 *
 * Runs once per admin boot. The decision lives in decideDrugRowReconcile(); once
 * the row exists every later boot is a single skip.
 */
export default class DrugInstallRowProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    if (this.app.getEnvironment() !== 'web') return

    setImmediate(async () => {
      try {
        const KVStore = (await import('#models/kv_store')).default
        const { DrugReferenceService, DRUG_DATASET_RESOURCE_ID } = await import(
          '#services/drug_reference_service'
        )
        const { CollectionManifestService } = await import(
          '#services/collection_manifest_service'
        )
        const { parseDownloadState } = await import('../util/drug_labels.js')
        const { decideDrugRowReconcile, findDatasetCategorySlug } = await import(
          '../app/utils/drug_install_row_reconcile.js'
        )

        const drugService = new DrugReferenceService()

        // Redis down reads as "in flight": leaving the tier stuck one more boot
        // beats racing a live ingest.
        let jobInFlight = true
        try {
          jobInFlight = await drugService.isJobInFlight()
        } catch (err: any) {
          logger.warn(
            `[DrugInstallRowProvider] Could not read drug queues (${err?.message ?? err}) — treating as in flight.`
          )
        }

        const [rowCount, hasInstallRow, lastUpdated, rawMarker] = await Promise.all([
          drugService.rowCount(),
          drugService.hasInstalledRow(),
          KVStore.getValue('drugReference.lastUpdatedExportDate'),
          KVStore.getValue('drugReference.downloadState'),
        ])

        const decision = decideDrugRowReconcile({
          rowCount,
          hasInstallRow,
          lastUpdatedExportDate: lastUpdated ? String(lastUpdated) : null,
          hasDownloadMarker: parseDownloadState(rawMarker) !== null,
          jobInFlight,
        })

        if (decision.action === 'skip') {
          logger.info(`[DrugInstallRowProvider] No backfill needed: ${decision.reason}.`)
          return
        }

        // Cached spec only: no network at boot, and the box may be offline.
        const spec = await new CollectionManifestService().getCachedSpec<ZimCategoriesSpec>('zim_categories')
        const collectionRef = findDatasetCategorySlug(spec, DRUG_DATASET_RESOURCE_ID)

        await drugService.recordInstalledRow({
          version: decision.version,
          collectionRef,
          fileSizeBytes: null,
        })
        logger.warn(
          `[DrugInstallRowProvider] ${rowCount} drug labels were ingested without an installed_resources row. ` +
            `Backfilled ${DRUG_DATASET_RESOURCE_ID} (version=${decision.version}, collection_ref=${collectionRef ?? 'null'}).`
        )
      } catch (err: any) {
        logger.error(`[DrugInstallRowProvider] Backfill check failed: ${err?.message ?? err}`)
      }
    })
  }
}
