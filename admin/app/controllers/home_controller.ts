import { SystemService } from '#services/system_service'
import { DrugReferenceService } from '#services/drug_reference_service'
import logger from '@adonisjs/core/services/logger'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class HomeController {
    constructor(
        private systemService: SystemService,
    ) { }

    async index({ response }: HttpContext) {
        // Redirect / to /home
        return response.redirect().toPath('/home');
    }

    async home({ inertia }: HttpContext) {
        const services = await this.systemService.getServices({ installedOnly: true });
        return inertia.render('home', {
            system: {
                services
            },
            // Gate the Drug Reference / "When to use what" tiles behind the FDA
            // dataset install state. Installed when the curated-tier ingest has
            // reached 'ready' OR an install is in flight (downloading/ingesting) —
            // so the tile appears the moment the user opts in and persists through
            // the long install, rather than popping in only at the very end.
            drugReferenceInstalled: await this.computeDrugReferenceInstalled(),
        })
    }

    /**
     * True when the offline FDA drug dataset is installed or installing. Reads the
     * two-phase ingest status: ready (fully installed) or an active phase
     * (downloading/downloaded/ingesting). rowCount > 0 covers a populated table
     * whose job history was pruned. Never throws — a status read failure hides the
     * tiles (fail-closed) rather than 500-ing the dashboard.
     */
    private async computeDrugReferenceInstalled(): Promise<boolean> {
        try {
            const status = await new DrugReferenceService().getIngestStatus()
            const installing =
                status.phase === 'downloading' ||
                status.phase === 'downloaded' ||
                status.phase === 'ingesting'
            return status.phase === 'ready' || installing || status.rowCount > 0
        } catch (err) {
            logger.error(
                `[HomeController] drug-reference install check failed: ${
                    err instanceof Error ? err.message : String(err)
                }`
            )
            return false
        }
    }
}