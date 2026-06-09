import { SERVICE_NAMES } from './service_names.js'

// In-app docs page (admin/docs/supply-depot-apps.md) served at /docs/supply-depot-apps.
export const SUPPLY_DEPOT_DOC_PAGE = 'supply-depot-apps'

// Maps a Supply Depot service to its section anchor on that page. Only services listed here get a
// "Docs" item in the Manage dropdown, so the link never points at a section that doesn't exist yet.
// Each anchor MUST match the heading id set in the .md file (e.g. `## Vaultwarden {% #vaultwarden %}`).
// Add an entry here the moment that app's section is written.
export const SUPPLY_DEPOT_DOC_ANCHORS: Record<string, string> = {
  [SERVICE_NAMES.STIRLING_PDF]: 'stirling-pdf',
  [SERVICE_NAMES.FILEBROWSER]: 'file-browser',
  [SERVICE_NAMES.CALIBREWEB]: 'calibre-web',
  [SERVICE_NAMES.IT_TOOLS]: 'it-tools',
  [SERVICE_NAMES.EXCALIDRAW]: 'excalidraw',
  [SERVICE_NAMES.HOMEBOX]: 'homebox',
  [SERVICE_NAMES.VAULTWARDEN]: 'vaultwarden',
  [SERVICE_NAMES.JELLYFIN]: 'jellyfin',
  [SERVICE_NAMES.MESHTASTIC_WEB]: 'meshtastic-web',
  [SERVICE_NAMES.MESHCORE_WEB]: 'meshcore-web',
}

// Returns the in-app docs link for a service, or null if it has no documentation section.
export function getSupplyDepotDocLink(serviceName: string): string | null {
  const anchor = SUPPLY_DEPOT_DOC_ANCHORS[serviceName]
  return anchor ? `/docs/${SUPPLY_DEPOT_DOC_PAGE}#${anchor}` : null
}
