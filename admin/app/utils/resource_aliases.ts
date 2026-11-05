import type { ZimCategoriesSpec } from '../../types/collections.js'

/**
 * Renamed curated resources (#1171).
 *
 * openZIM sometimes changes a book's identifier, not just its date
 * (`fas-military-medicine_en` -> `irp.fas.org_en_military-medicine`). When we
 * repoint the manifest to the new id, an install that already has the old file
 * would otherwise read it as not installed, re-download it under the new name,
 * and keep the old file forever. A manifest entry lists its former ids in
 * `previous_ids`, and these helpers map an old id to the current one.
 */

/** Map of former id -> current id, built from every resource in the spec. */
export function buildPreviousIdMap(spec: ZimCategoriesSpec | null | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (!spec) return map
  for (const category of spec.categories ?? []) {
    for (const tier of category.tiers ?? []) {
      for (const resource of tier.resources ?? []) {
        for (const previousId of resource.previous_ids ?? []) {
          // A former id that is also some resource's current id would make the
          // mapping ambiguous; skip it rather than reroute a live resource.
          if (previousId && previousId !== resource.id) map.set(previousId, resource.id)
        }
      }
    }
  }
  // Drop any former id that is still a current id elsewhere in the spec.
  for (const category of spec.categories ?? []) {
    for (const tier of category.tiers ?? []) {
      for (const resource of tier.resources ?? []) map.delete(resource.id)
    }
  }
  return map
}

/** The current id for `resourceId`: itself unless it is a known former id. */
export function currentResourceId(resourceId: string, previousIdMap: Map<string, string>): string {
  return previousIdMap.get(resourceId) ?? resourceId
}

/**
 * True when `filename` is a dated build (`<id>_YYYY-MM...`) of one of `ids`. Used
 * to bound old-file deletion to the resource's own files, including files named
 * under a former id.
 */
export function filenameBelongsToResource(filename: string, ids: string[]): boolean {
  return ids.some((id) => !!id && filename.startsWith(`${id}_`))
}

/** Former ids that map to `resourceId` (empty when it was never renamed). */
export function previousIdsFor(resourceId: string, previousIdMap: Map<string, string>): string[] {
  const ids: string[] = []
  for (const [previousId, currentId] of previousIdMap) {
    if (currentId === resourceId) ids.push(previousId)
  }
  return ids
}
