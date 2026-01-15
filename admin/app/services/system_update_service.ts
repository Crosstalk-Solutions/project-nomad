import logger from '@adonisjs/core/services/logger'
import { readFileSync, existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'

interface UpdateStatus {
  stage: 'idle' | 'starting' | 'pulling' | 'pulled' | 'recreating' | 'complete' | 'error'
  progress: number
  message: string
  timestamp: string
}

export class SystemUpdateService {
  private static SHARED_DIR = '/app/update-shared'
  private static REQUEST_FILE = join(SystemUpdateService.SHARED_DIR, 'update-request')
  private static STATUS_FILE = join(SystemUpdateService.SHARED_DIR, 'update-status')
  private static LOG_FILE = join(SystemUpdateService.SHARED_DIR, 'update-log')

  /**
   * Requests a system update by creating a request file that the sidecar will detect
   */
  async requestUpdate(): Promise<{ success: boolean; message: string }> {
    try {
      const currentStatus = this.getUpdateStatus()      
      if (currentStatus && !['idle', 'complete', 'error'].includes(currentStatus.stage)) {
        return {
          success: false,
          message: `Update already in progress (stage: ${currentStatus.stage})`,
        }
      }

      const requestData = {
        requested_at: new Date().toISOString(),
        requester: 'admin-api',
      }

      await writeFile(SystemUpdateService.REQUEST_FILE, JSON.stringify(requestData, null, 2))
      logger.info('[SystemUpdateService]: System update requested - sidecar will process shortly')

      return {
        success: true,
        message: 'System update initiated. The admin container will restart during the process.',
      }
    } catch (error) {
      logger.error('[SystemUpdateService]: Failed to request system update:', error)
      return {
        success: false,
        message: `Failed to request update: ${error.message}`,
      }
    }
  }

  getUpdateStatus(): UpdateStatus | null {
    try {
      if (!existsSync(SystemUpdateService.STATUS_FILE)) {
        return {
          stage: 'idle',
          progress: 0,
          message: 'No update in progress',
          timestamp: new Date().toISOString(),
        }
      }

      const statusContent = readFileSync(SystemUpdateService.STATUS_FILE, 'utf-8')
      return JSON.parse(statusContent) as UpdateStatus
    } catch (error) {
      logger.error('[SystemUpdateService]: Failed to read update status:', error)
      return null
    }
  }

  getUpdateLogs(): string {
    try {
      if (!existsSync(SystemUpdateService.LOG_FILE)) {
        return 'No update logs available'
      }

      return readFileSync(SystemUpdateService.LOG_FILE, 'utf-8')
    } catch (error) {
      logger.error('[SystemUpdateService]: Failed to read update logs:', error)
      return `Error reading logs: ${error.message}`
    }
  }

  /**
   * Check if the update sidecar is reachable (i.e. shared volume is mounted)
   */
  isSidecarAvailable(): boolean {
    try {
      return existsSync(SystemUpdateService.SHARED_DIR)
    } catch (error) {
      return false
    }
  }
}
