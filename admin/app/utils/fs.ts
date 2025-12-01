import { mkdir, readdir, readFile, stat, unlink } from 'fs/promises'
import { join } from 'path'
import { DriveDisks } from '@adonisjs/drive/types'
import driveConfig from '#config/drive'
import app from '@adonisjs/core/services/app'
import { FileEntry } from '../../types/files.js'

export async function listDirectoryContents(path: string): Promise<FileEntry[]> {
  const entries = await readdir(path, { withFileTypes: true })
  const results: FileEntry[] = []
  for (const entry of entries) {
    if (entry.isFile()) {
      results.push({
        type: 'file',
        key: join(path, entry.name),
        name: entry.name,
      })
    } else if (entry.isDirectory()) {
      results.push({
        type: 'directory',
        prefix: join(path, entry.name),
        name: entry.name,
      })
    }
  }
  return results
}

export async function listDirectoryContentsRecursive(path: string): Promise<FileEntry[]> {
  let results: FileEntry[] = []
  const entries = await readdir(path, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(path, entry.name)
    if (entry.isDirectory()) {
      const subdirectoryContents = await listDirectoryContentsRecursive(fullPath)
      results = results.concat(subdirectoryContents)
    } else {
      results.push({
        type: 'file',
        key: fullPath,
        name: entry.name,
      })
    }
  }
  return results
}

export async function ensureDirectoryExists(path: string): Promise<void> {
  try {
    await stat(path)
  } catch (error) {
    if (error.code === 'ENOENT') {
      await mkdir(path, { recursive: true })
    }
  }
}

export async function getFile(path: string, returnType: 'buffer'): Promise<Buffer | null>
export async function getFile(path: string, returnType: 'string'): Promise<string | null>
export async function getFile(path: string, returnType: 'buffer' | 'string' = 'buffer'): Promise<Buffer | string | null> {
  try {
    if (returnType === 'buffer') {
      return await readFile(path)
    } else {
      return await readFile(path, 'utf-8')
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function getFileStatsIfExists(
  path: string
): Promise<{ size: number; modifiedTime: Date } | null> {
  try {
    const stats = await stat(path)
    return {
      size: stats.size,
      modifiedTime: stats.mtime,
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function deleteFileIfExists(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
}

export async function getFullDrivePath(diskName: keyof DriveDisks): Promise<string> {
  const config = await driveConfig.resolver(app)
  const serviceConfig = config.config.services[diskName]
  const resolved = serviceConfig()
  if (!resolved) {
    throw new Error(`Disk ${diskName} not configured`)
  }

  let path = resolved.options.location
  if (path instanceof URL) {
    return path.pathname
  }
  return path
}
