import { setTimeout } from 'node:timers/promises'
import Database from 'better-sqlite3'
import { MapRegionError } from './map_region_catalog.js'

/** A separate SQLite file per component lets the OS release the write lock
 * when a process exits. Keep the file in place so every process locks the
 * same inode, including across pauses and restarts. No database rows are used. */
export async function withMapRegionLock<T>(path: string, callback: () => Promise<T>): Promise<T> {
  const database = new Database(path, { timeout: 0 })
  const deadline = performance.now() + 30000
  try {
    while (true) {
      try {
        database.exec('BEGIN IMMEDIATE')
        break
      } catch (error) {
        if ((error as { code?: string }).code !== 'SQLITE_BUSY') throw error
        if (performance.now() >= deadline)
          throw new MapRegionError('This region is busy; retry shortly.', 409)
        await setTimeout(30)
      }
    }
    return await callback()
  } finally {
    database.close()
  }
}
