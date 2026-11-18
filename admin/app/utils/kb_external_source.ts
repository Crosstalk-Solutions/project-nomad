import { resolve, sep } from 'node:path'

/**
 * External read-only Knowledge Base source (#1422).
 *
 * Some users keep their authoritative documents somewhere NOMAD doesn't own —
 * typically a NAS share mounted on the host — and want NOMAD to index them
 * without copying them into kb_uploads. The admin runs in a container, so the
 * folder reaches it as an optional read-only bind mount at this fixed path
 * (relative to the app root, i.e. `/app/kb_external` in the image):
 *
 *   - /mnt/nas/library:/app/kb_external:ro
 *
 * Deliberately a fixed path rather than a setting, and deliberately outside
 * `storage/`:
 *
 * - The mount being there IS the switch. No mount means the directory doesn't
 *   exist, the scanner skips it (ENOENT), and nothing changes for anyone who
 *   hasn't opted in. A configurable path would let it be pointed at (or over)
 *   NOMAD's own storage, where the read-only guards below would start
 *   shielding kb_uploads from its own Delete button, and the same file could
 *   be indexed twice under two roots.
 * - Outside `storage/` it never mixes with NOMAD-owned data: a storage move
 *   (#1050), a disk-usage walk, or anything else that operates on the storage
 *   volume can't touch it, and no empty mountpoint is left behind in the
 *   user's storage folder on the host.
 *
 * The `:ro` flag is the real boundary; the guards here are defence in depth so
 * that NOMAD never even *attempts* to write, move, or delete under this root,
 * and so a mount that was accidentally left read-write is still treated as
 * read-only.
 */
export const KB_EXTERNAL_STORAGE_PATH = 'kb_external'

/**
 * True when `path` lies strictly inside `root`. Both are resolved first so
 * traversal segments ("/../") can't step out, and the trailing separator keeps
 * a sibling such as `<root>-backup/x.pdf` from qualifying as a prefix match.
 * The root itself is not "inside" itself.
 */
export function isPathUnderRoot(path: string, root: string): boolean {
  return resolve(path).startsWith(resolve(root) + sep)
}

/**
 * Absolute roots the knowledge-base scanner walks, in scan order.
 *
 * The external root is always listed: whether it's actually *there* is decided
 * at walk time, where a missing directory is skipped and kept out of
 * `scannedRoots`. That keeps the orphan sweep's existing rule — only ever purge
 * under a root that was really walked (#1050), never under an empty one
 * (#1378), never most of a root at once — applying to the external folder with
 * no special case. Which is exactly the protection it needs: a NAS share that
 * drops off the network shows up as a missing or empty mountpoint, and must
 * not wipe the index built from it.
 */
export function buildKbScanRoots(roots: {
  kbUploadsPath: string
  zimPath: string
  externalPath: string
}): string[] {
  return [roots.kbUploadsPath, roots.zimPath, roots.externalPath]
}

export type KbFileDeleteAction =
  /** A NOMAD-owned upload: remove its vectors, state row, and the file. */
  | 'delete_file_and_index'
  /** Not ours to delete from disk (ZIM, bundled docs, or an external file
   * that is already gone): remove only its vectors and state row. */
  | 'purge_index_only'
  /** An external file that still exists: refuse. Dropping its vectors would
   * be undone by the next sync, which would just re-index it. */
  | 'refuse_external'

/**
 * Decide what the user-facing "Delete" action may do for a stored source.
 *
 * External files are never deleted from disk, whatever the mount flags say.
 * While one still exists in the source folder, removing it from the index is
 * refused outright — the source folder is authoritative, so the way to drop a
 * file is to remove it there. Once it is gone (deleted upstream, or the folder
 * was unmounted for good) the leftover index entry can be purged, so a stale
 * row is never stuck in the Stored Files list.
 *
 * The upload check is evaluated after the external check on purpose: should
 * the two roots ever overlap, the read-only rule wins.
 */
export function decideKbFileDelete(input: {
  source: string
  uploadsRoot: string
  externalRoot: string
  existsOnDisk: boolean
}): KbFileDeleteAction {
  if (isPathUnderRoot(input.source, input.externalRoot)) {
    return input.existsOnDisk ? 'refuse_external' : 'purge_index_only'
  }
  if (isPathUnderRoot(input.source, input.uploadsRoot)) return 'delete_file_and_index'
  return 'purge_index_only'
}

export type ScanRootErrorAction = 'skip_missing' | 'skip_unreadable' | 'throw'

/**
 * What the scanner does when walking a root throws.
 *
 * A missing root has always been skipped (a fresh install has no kb_uploads
 * until the first upload). The external folder (#1422) additionally skips on
 * any other error — permission denied on a NAS share, a stale network mount
 * (EIO, ESTALE) — because it's outside NOMAD's control and a flaky share must
 * not fail the whole sync for kb_uploads and zim. Either way the root stays
 * out of `scannedRoots`, so the orphan sweep treats it as unseen and purges
 * nothing under it.
 *
 * NOMAD's own roots keep throwing on anything but ENOENT: an unreadable
 * storage volume is a real fault the operator should see, not something to
 * paper over.
 */
export function decideScanRootError(
  errorCode: string | undefined,
  isExternalRoot: boolean
): ScanRootErrorAction {
  if (errorCode === 'ENOENT') return 'skip_missing'
  return isExternalRoot ? 'skip_unreadable' : 'throw'
}
