import type { ZimCategoriesSpec } from '../../types/collections.js'

/**
 * Observed state of the FDA drug dataset, gathered at admin boot by
 * DrugInstallRowProvider.
 */
export interface DrugRowReconcileInput {
  /** Rows in `drug_labels`. */
  rowCount: number
  /** Whether the `installed_resources` 'dataset' row already exists. */
  hasInstallRow: boolean
  /** KV `drugReference.lastUpdatedExportDate`; only the final ingest pass sets it. */
  lastUpdatedExportDate: string | null
  /** Whether KV `drugReference.downloadState` still holds a marker. */
  hasDownloadMarker: boolean
  /** Whether either drug queue has an active/waiting/delayed job. */
  jobInFlight: boolean
}

export type DrugRowReconcileDecision =
  | { action: 'backfill'; version: string }
  | { action: 'skip'; reason: string }

/**
 * Decide whether a completed drug ingest is missing its `installed_resources`
 * row and should get one.
 *
 * On 1.34.0 the column was still enum('zim','map'), so every ingest finished
 * `ready` with 261k labels and a failed row write. The tier-status math reads
 * that row, so Medicine never resolved its Standard tier. The same state also
 * follows a manual ingest (no resourceMeta), including a reset-and-reingest.
 *
 * Backfill only when the ingest provably finished: the export-date marker is
 * written by the final pass, and the download marker is cleared right after it
 * (the same "completed" inference getIngestStatus() makes). A running job is
 * left alone, since it writes its own row on `ready`.
 */
export function decideDrugRowReconcile(input: DrugRowReconcileInput): DrugRowReconcileDecision {
  if (input.hasInstallRow) return { action: 'skip', reason: 'install row present' }
  if (input.rowCount <= 0) return { action: 'skip', reason: 'no drug labels ingested' }
  if (input.jobInFlight) return { action: 'skip', reason: 'drug download/ingest in flight' }
  if (input.hasDownloadMarker) {
    return { action: 'skip', reason: 'download marker present (ingest not finished)' }
  }
  const version = input.lastUpdatedExportDate?.trim()
  if (!version) return { action: 'skip', reason: 'no export date (ingest never completed)' }
  return { action: 'backfill', version }
}

/**
 * Slug of the curated category whose tiers carry the given dataset resource,
 * for the row's `collection_ref`. Null when the spec is absent or no tier lists it.
 */
export function findDatasetCategorySlug(
  spec: ZimCategoriesSpec | null,
  resourceId: string
): string | null {
  for (const category of spec?.categories ?? []) {
    for (const tier of category.tiers ?? []) {
      if ((tier.resources ?? []).some((r) => r.type === 'dataset' && r.id === resourceId)) {
        return category.slug
      }
    }
  }
  return null
}
