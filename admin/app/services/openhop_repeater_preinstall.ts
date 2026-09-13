import { randomUUID } from 'node:crypto'
import { chmod, chown, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const OPENHOP_REPEATER_UID = 15888
export const OPENHOP_REPEATER_GID = 15888

export const OPENHOP_REPEATER_SEED_CONFIG = `repeater:
  mode: no_tx
  security:
    max_clients: 1
    admin_password: null
    guest_password: null
    allow_read_only: false
    jwt_secret: null
    jwt_expiry_minutes: 60
radio_type: null
storage:
  storage_dir: /var/lib/openhop_repeater
`

interface Ownership {
  uid: number
  gid: number
}

export interface OpenHopRepeaterStorageResult {
  configPath: string
  created: boolean
}

async function hasNonEmptyFile(path: string): Promise<boolean> {
  try {
    const fileStats = await stat(path)
    return fileStats.size > 0
  } catch (error: any) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

/**
 * Prepare openHop Repeater's two persistent directories and a safe first-run config.
 * Existing non-empty configuration is authoritative and is never overwritten.
 */
export async function prepareOpenHopRepeaterStorage(
  storageRoot: string,
  ownership: Ownership = { uid: OPENHOP_REPEATER_UID, gid: OPENHOP_REPEATER_GID }
): Promise<OpenHopRepeaterStorageResult> {
  const appRoot = join(storageRoot, 'openhop-repeater')
  const configDir = join(appRoot, 'config')
  const dataDir = join(appRoot, 'data')
  const configPath = join(configDir, 'config.yaml')

  await mkdir(configDir, { recursive: true })
  await mkdir(dataDir, { recursive: true })
  await chown(configDir, ownership.uid, ownership.gid)
  await chown(dataDir, ownership.uid, ownership.gid)

  if (await hasNonEmptyFile(configPath)) {
    return { configPath, created: false }
  }

  const temporaryPath = join(configDir, `.config.yaml.${randomUUID()}.tmp`)
  try {
    await writeFile(temporaryPath, OPENHOP_REPEATER_SEED_CONFIG, { mode: 0o600 })
    await chmod(temporaryPath, 0o600)
    await chown(temporaryPath, ownership.uid, ownership.gid)
    await rename(temporaryPath, configPath)
  } finally {
    await rm(temporaryPath, { force: true })
  }

  return { configPath, created: true }
}
