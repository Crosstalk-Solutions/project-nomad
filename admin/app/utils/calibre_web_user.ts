/**
 * Resolve the UID/GID used when preparing Calibre-Web storage.
 * Prefers `PUID`/`PGID` from the service's container env, then `process.env`,
 * falling back to `1000:1000` (the default LinuxServer.io Calibre-Web UID/GID).
 */
export function resolveCalibreWebUidGid(
  serviceEnvEntries?: string[] | null,
  processEnv: NodeJS.ProcessEnv = process.env
): { uid: number; gid: number } {
  const parseId = (value: string | undefined): number | undefined => {
    if (!value) return undefined
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) return undefined
    const n = Number.parseInt(trimmed, 10)
    return Number.isSafeInteger(n) && n >= 0 ? n : undefined
  }

  let envUid: number | undefined
  let envGid: number | undefined
  for (const entry of serviceEnvEntries ?? []) {
    const eqIdx = entry.indexOf('=')
    if (eqIdx === -1) continue
    const key = entry.slice(0, eqIdx)
    const val = entry.slice(eqIdx + 1)
    if (key === 'PUID') envUid = parseId(val)
    if (key === 'PGID') envGid = parseId(val)
  }

  return {
    uid: envUid ?? parseId(processEnv.PUID) ?? 1000,
    gid: envGid ?? parseId(processEnv.PGID) ?? 1000,
  }
}
