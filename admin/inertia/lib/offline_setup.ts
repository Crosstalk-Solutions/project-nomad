/**
 * What the Easy Setup wizard can and cannot do with no internet connection.
 *
 * NOMAD can be installed air-gapped from an offline artifact bundle (see
 * docs/offline-install.md). A bundle built with `--with-apps` carries the app
 * images, so the Command Center really can install those capabilities with the
 * cable pulled — the install path skips the registry pull whenever the image is
 * already in the local Docker daemon. Everything else the wizard offers (map
 * regions, curated content tiers, creator packs, AI models, Wikipedia) is
 * fetched from a remote catalog at run time and genuinely cannot work offline.
 *
 * The wizard used to draw no distinction: a single `!isOnline` check disabled
 * Next and Complete Setup, so an air-gapped operator could not install the
 * capabilities their bundle had already put on disk. These helpers split the
 * two cases so the UI can allow the first and explain the second.
 *
 * Pure functions, no React — unit-tested in tests/unit/offline_setup.spec.ts.
 */

/** The kinds of selection the review step can be carrying. */
export type OfflineBlocker =
  | 'services'
  | 'maps'
  | 'content'
  | 'creator-packs'
  | 'ai-models'
  | 'wikipedia'

export type WizardSelections = {
  /** service_name values queued for install. */
  services: string[]
  mapCollections: string[]
  creatorPacks: string[]
  /** Number of curated category tiers picked (selectedTiers.size). */
  categoryTierCount: number
  aiModels: string[]
  /** Wikipedia option id, or null when untouched. 'none' means "remove/skip". */
  wikipediaOptionId: string | null
}

/** Human-readable reason shown next to the disabled Complete Setup button. */
export const OFFLINE_BLOCKER_LABELS: Record<OfflineBlocker, string> = {
  services: 'apps whose image is not on this machine',
  maps: 'map regions',
  content: 'content categories',
  'creator-packs': 'creator packs',
  'ai-models': 'AI models',
  wikipedia: 'Wikipedia',
}

/**
 * True when this app can be installed with no internet: its image is already in
 * the local Docker daemon (loaded from an offline bundle, or left behind by a
 * previous install/uninstall), so the install skips the registry pull.
 */
export function isServiceInstallableOffline(
  serviceName: string,
  locallyAvailableServices: string[]
): boolean {
  return locallyAvailableServices.includes(serviceName)
}

/**
 * The selections that would need to reach the internet to complete. Empty means
 * the whole setup can run air-gapped.
 *
 * A Wikipedia pick of 'none' is a local deletion, not a download, so it never
 * blocks. Order is stable (declaration order) so the message reads the same way
 * every time.
 */
export function offlineBlockers(
  selections: WizardSelections,
  locallyAvailableServices: string[]
): OfflineBlocker[] {
  const blockers: OfflineBlocker[] = []

  const needsPull = selections.services.some(
    (service) => !isServiceInstallableOffline(service, locallyAvailableServices)
  )
  if (needsPull) blockers.push('services')
  if (selections.mapCollections.length > 0) blockers.push('maps')
  if (selections.categoryTierCount > 0) blockers.push('content')
  if (selections.creatorPacks.length > 0) blockers.push('creator-packs')
  if (selections.aiModels.length > 0) blockers.push('ai-models')
  if (selections.wikipediaOptionId !== null && selections.wikipediaOptionId !== 'none') {
    blockers.push('wikipedia')
  }

  return blockers
}

/** True when every selection can be carried out with no internet connection. */
export function canCompleteSetupOffline(
  selections: WizardSelections,
  locallyAvailableServices: string[]
): boolean {
  return offlineBlockers(selections, locallyAvailableServices).length === 0
}

/** "map regions and AI models" — for the message explaining a blocked finish. */
export function describeOfflineBlockers(blockers: OfflineBlocker[]): string {
  const labels = blockers.map((blocker) => OFFLINE_BLOCKER_LABELS[blocker])
  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}
