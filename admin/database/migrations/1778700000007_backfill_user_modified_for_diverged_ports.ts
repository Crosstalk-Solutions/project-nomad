import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Catalog default published host ports for curated services, as of the 1.33
 * curated-catalog era (when the `is_user_modified` flag was introduced).
 *
 * A curated install whose live host port differs from its catalog default was
 * deployed on an alternate port (commonly because the default was already taken
 * on that host) before `is_user_modified` existed to record it. This is a
 * point-in-time snapshot on purpose — it must not track later catalog changes.
 */
const CATALOG_DEFAULT_HOST_PORTS: Record<string, string[]> = {
  nomad_kiwix_server: ['8090'],
  nomad_ollama: ['11434'],
  nomad_cyberchef: ['8100'],
  nomad_flatnotes: ['8200'],
  nomad_kolibri: ['8300'], // legacy (Gen 1)
  nomad_kolibri_2: ['8310', '8311'],
  nomad_stirling_pdf: ['8400'],
  nomad_filebrowser: ['8410'],
  nomad_calibreweb: ['8420'],
  nomad_it_tools: ['8430'],
  nomad_excalidraw: ['8440'],
  nomad_meshtastic_web: ['8450'],
  nomad_homebox: ['8470'],
  nomad_vaultwarden: ['8480'],
  nomad_jellyfin: ['8490'],
  nomad_meshcore_web: ['8500'],
}

/** Sorted list of published host ports in a serialized container_config, or null. */
function hostPortsOf(containerConfig: string | null): string[] | null {
  if (!containerConfig) return null
  try {
    const bindings = JSON.parse(containerConfig)?.HostConfig?.PortBindings ?? {}
    const ports = Object.values(bindings)
      .flat()
      .map((b: any) => b?.HostPort)
      .filter(Boolean) as string[]
    return ports.length ? ports.slice().sort() : null
  } catch {
    return null
  }
}

/**
 * Backfill `is_user_modified` for curated installs whose host port diverged from
 * the catalog default before that flag existed (pre-1.33).
 *
 * The catalog-sync loop in ServiceSeeder overwrites `container_config` and
 * `ui_location` for every curated service that isn't `is_custom` or
 * `is_user_modified`. For a pre-1.33 install on a non-default port that means
 * its port is reset to the catalog default on the next boot, desyncing the row
 * from the running container and breaking the app's Open link.
 *
 * Flagging these rows `is_user_modified` lets the existing sync loop skip them.
 * This runs before `db:seed`, so the flag is set before the sync would clobber
 * the port. Tradeoff: these installs stop receiving future catalog config
 * changes — an acceptable price for keeping their working port.
 */
export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.defer(async (db) => {
      const rows = await db
        .from(this.tableName)
        .where('installed', true)
        .where('is_custom', false)
        .where('is_user_modified', false)
        .select('id', 'service_name', 'container_config')

      for (const row of rows) {
        const expected = CATALOG_DEFAULT_HOST_PORTS[row.service_name]
        if (!expected) continue
        const actual = hostPortsOf(row.container_config)
        if (!actual) continue
        if (actual.join(',') !== expected.slice().sort().join(',')) {
          await db.from(this.tableName).where('id', row.id).update({ is_user_modified: true })
        }
      }
    })
  }

  async down() {
    // One-way data backfill: `is_user_modified` is not restored, since we can't
    // distinguish rows flagged here from ones the user modified directly, and
    // un-flagging would re-expose them to the port-clobbering sync.
  }
}
