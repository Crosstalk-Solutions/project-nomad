import { resolve, sep } from 'node:path'

/**
 * Decides whether a curated resource's PREVIOUSLY-installed file should be
 * deleted now that a newer version has been downloaded (issue #634 — old map
 * and ZIM versions accumulated on disk indefinitely because only Wikipedia had
 * version cleanup).
 *
 * This is intentionally a pure function so every safety rail is unit-testable
 * without touching the DB or filesystem. The caller looks up the prior
 * `InstalledResource` row, records the new version, then asks this whether the
 * old file is safe to remove.
 *
 * Safety rails (a "delete" decision requires ALL of these):
 *  - There was a prior install for this exact resource_id (`existing` non-null).
 *    Untracked / sideloaded files have no row and are therefore never touched.
 *  - The old file path actually differs from the new one (a genuine version
 *    swap, not a re-download of the same file).
 *  - The new file is confirmed present on disk — we never remove the old copy
 *    before the replacement is verified.
 *  - The new version is strictly newer than the recorded one, so a re-install
 *    or downgrade can't wipe a newer file.
 *  - The old path resolves to within the resource's storage directory, so a
 *    malformed DB value can't direct a delete outside the content store.
 */

export interface SupersededInputs {
  /** Prior InstalledResource row for this resource_id, or null on first install. */
  existing: { file_path: string; version: string } | null
  /** Absolute path of the newly downloaded file. */
  newFilePath: string
  /** Version of the newly downloaded file (e.g. "2026-05"). */
  newVersion: string
  /** Whether the new file is confirmed present on disk. */
  newFileExists: boolean
  /** Absolute storage directory the old file must live under to be eligible. */
  storageBaseDir: string
}

export type SupersededReason =
  | 'first_install'
  | 'same_file'
  | 'new_file_missing'
  | 'not_newer'
  | 'outside_storage'
  | 'superseded'

export interface SupersededDecision {
  delete: boolean
  /** Resolved old path to delete — set only when `delete` is true. */
  path?: string
  reason: SupersededReason
}

export function decideSupersededDeletion(inputs: SupersededInputs): SupersededDecision {
  const { existing, newFilePath, newVersion, newFileExists, storageBaseDir } = inputs

  if (!existing) return { delete: false, reason: 'first_install' }
  if (existing.file_path === newFilePath) return { delete: false, reason: 'same_file' }
  if (!newFileExists) return { delete: false, reason: 'new_file_missing' }
  // Versions are zero-padded date strings (YYYY-MM / YYYY-MM-DD), so a lexical
  // compare orders them correctly. Require strictly newer.
  if (!(newVersion > existing.version)) return { delete: false, reason: 'not_newer' }

  const resolvedOld = resolve(existing.file_path)
  const base = resolve(storageBaseDir)
  if (resolvedOld !== base && !resolvedOld.startsWith(base + sep)) {
    return { delete: false, reason: 'outside_storage' }
  }

  return { delete: true, path: resolvedOld, reason: 'superseded' }
}
