/**
 * Drug Reference v1 — types.
 *
 * Enums, DTOs, and manifest types for the openFDA drug-label feature.
 * All server → client data transfer shapes are defined here.
 */

// ─── Product type ─────────────────────────────────────────────────────────────

export const PRODUCT_TYPES = {
  OTC: 'HUMAN OTC DRUG',
  RX: 'HUMAN PRESCRIPTION DRUG',
} as const

export type ProductType = (typeof PRODUCT_TYPES)[keyof typeof PRODUCT_TYPES]

// ─── Manifest (from api.fda.gov/download.json) ────────────────────────────────

export interface DrugLabelPartition {
  display_name: string
  file: string        // full URL to the .zip
  size_mb: string     // string in the JSON
  records: number
}

export interface DrugLabelManifest {
  export_date: string
  total_records: number
  partitions: DrugLabelPartition[]
}

// ─── Download-state marker (persisted in KV, no migration) ────────────────────

/**
 * One downloaded part recorded in the `drugReference.downloadState` KV marker.
 * `index` is the manifest partition position so a manual ingest with no manifest
 * in its params can rebuild the ordered part list (and resolve each on-disk zip
 * via partZipPath) without re-fetching the manifest from the network.
 */
export interface DownloadStatePart {
  index: number
  name: string
  path: string
  bytes: number
}

/**
 * The download-phase completion marker. Written to KV after the LAST part lands
 * on disk; read by the ingest job + the service to know parts are available for
 * the manual "Ingest into search" path and to gate POST /ingest. Cleared after a
 * full ingest succeeds (when the parts are deleted).
 */
export interface DownloadStateMarker {
  export_date: string
  totalParts: number
  /**
   * Manifest `total_records` (~259k), persisted so a manual or auto-chained
   * ingest that rebuilds the manifest from this marker (rather than carrying it
   * in job data) still knows the real label-count denominator — the source of
   * the "X of ~259k labels" counter, the records-based progress %, and the ETA.
   * Older markers written before this field exists parse back as 0 (unknown).
   */
  totalRecords: number
  parts: DownloadStatePart[]
  completedAtMs: number
}

// ─── Install-state metadata (tier-installer → InstalledResource row) ──────────

/**
 * Identity an install writes to the `installed_resources` table when the drug
 * dataset reaches `ready`, so the curated-tier "installed" math (which is row-
 * driven for ZIM/map) recognizes the dataset uniformly. Threaded from the tier
 * installer (the manifest `dataset` resource) through the download job into the
 * ingest job, which writes the row. Absent on a manual download (the standalone
 * "Download FDA data" path), in which case no row is written — the install-state
 * row only exists when the install came through a curated tier.
 *
 * `version` is filled with the dataset's openFDA `export_date` at write time
 * (the real freshness key), NOT the manifest's placeholder `version` string.
 */
export interface DrugDatasetResourceMeta {
  resourceId: string
  /** Manifest `version` placeholder; the row's real version is the export_date. */
  version: string
  collectionRef: string | null
}

// ─── Job params ───────────────────────────────────────────────────────────────

/**
 * DownloadDrugDataJob params. Pass 0 fetches the manifest; each later pass
 * downloads one part to disk. `phase` was previously written into job data but
 * never typed — it is part of the contract now.
 */
export interface DownloadDrugDataJobParams {
  partIndex?: number
  manifest?: DrugLabelManifest
  totalParts?: number
  /** Auto-dispatch the ingest phase after the last part downloads. Default true. */
  autoChain?: boolean
  /** Epoch ms when the download began (set on pass 0, carried through continuations). */
  startedAt?: number
  /** Bytes downloaded for the current part (live progress). */
  bytesDownloaded?: number
  currentPartName?: string | null
  phase?: 'manifest' | 'downloading' | 'downloaded' | 'failed'
  /**
   * Install-state identity, present only when the install came through a curated
   * tier. Carried through the continuation chain and handed to the ingest job so
   * it can write the `installed_resources` row on `ready`.
   */
  resourceMeta?: DrugDatasetResourceMeta
}

/**
 * IngestDrugDataJob params. Each pass reads one on-disk part and streams it into
 * drug_labels. Zero network I/O. `manifest` is optional: a manual ingest can run
 * from the KV download-state marker alone.
 */
export interface IngestDrugDataJobParams {
  partIndex?: number
  manifest?: DrugLabelManifest
  totalParts?: number
  recordsIngested?: number
  recordsSkipped?: number
  /** Epoch ms when the ingest began (set on pass 0, carried through continuations). */
  startedAt?: number
  /**
   * drug_labels row count when this ingest RUN began (set on pass 0, carried
   * through continuations). Progress baseline: on a re-ingest into a full table
   * the raw row count reads ~100% from second zero, so this-run progress is
   * driven by jobRecords vs max(0, rowCount - startRowCount) instead.
   */
  startRowCount?: number
  currentPartName?: string | null
  phase?: 'ingesting' | 'ready' | 'failed'
  /**
   * Install-state identity, forwarded from the download job when the install
   * came through a curated tier. The ingest job writes the `installed_resources`
   * row on `ready` using this. Absent on a manual ingest.
   */
  resourceMeta?: DrugDatasetResourceMeta
}

// ─── Search result DTO (collapsed by brand+generic) ──────────────────────────

/**
 * Slim result row — one per distinct (brand_name, generic_name) pair.
 * `id` is a representative row id for the detail view; `labelCount` tells
 * the UI how many individual FDA set_ids collapsed into this result.
 */
export interface DrugSearchResult {
  id: number
  brand_name: string | null
  generic_name: string | null
  manufacturer: string | null
  route: string | null
  product_type: string | null
  labelCount: number
}

// ─── Detail DTO (full label body) ─────────────────────────────────────────────

export interface DrugLabelDetail {
  id: number
  set_id: string
  spl_id: string | null
  version: string | null
  brand_name: string | null
  generic_name: string | null
  manufacturer: string | null
  product_ndc: string | null
  route: string | null
  product_type: string | null
  indications: string | null
  dosage: string | null
  warnings: string | null
  boxed_warning: string | null
  drug_interactions: string | null
  contraindications: string | null
  when_using: string | null
  stop_use: string | null
  source_updated_at: string | null
  ingested_at: string
}

// ─── Interaction comparison DTO ───────────────────────────────────────────────

/**
 * Slim DTO for the side-by-side interaction comparison view.
 * Contains only the fields needed to render one column: identity + label text.
 */
export interface DrugInteractionEntry {
  id: number
  brand_name: string | null
  generic_name: string | null
  product_type: string | null
  drug_interactions: string | null
}

// ─── Ingest status (two-phase) ────────────────────────────────────────────────

/**
 * Top-level state machine across both phases. `downloaded` means parts are on
 * disk and ingest hasn't started/finished — the manual "Ingest into search"
 * button is available. `ready` means a full ingest succeeded (parts deleted).
 */
export type DrugIngestPhase =
  | 'idle'
  | 'downloading'
  | 'downloaded'
  | 'ingesting'
  | 'ready'
  | 'failed'

/** Per-phase run state. */
export type DrugPhaseState = 'idle' | 'running' | 'completed' | 'failed'

/** Download-phase sub-status. */
export interface DrugDownloadStatus {
  state: DrugPhaseState
  partsDone: number
  totalParts: number
  bytesDownloaded?: number
  bytesTotal?: number
  currentPartName: string | null
  failedReason?: string
}

/** Ingest-phase sub-status. */
export interface DrugIngestPhaseStatus {
  state: DrugPhaseState
  records: number
  /** Approx. total records from the manifest (0 if not known yet). Drives the counter + %. */
  expectedTotal: number
  partsDone: number
  totalParts: number
  currentPartName: string | null
  failedReason?: string
}

/**
 * The combined two-phase status DTO returned to the client. `phase` is the
 * top-level state machine derived from the two sub-phases + rowCount.
 */
export interface DrugIngestStatus {
  phase: DrugIngestPhase
  download: DrugDownloadStatus
  ingest: DrugIngestPhaseStatus
  /** Epoch ms the active phase began, for live elapsed + a rough ETA (null if idle). */
  startedAtMs: number | null
  lastUpdated: string | null
  rowCount: number
  error?: string
}
