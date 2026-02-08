import { mkdir, readdir, readFile, stat, unlink } from 'fs/promises'
import path, { join } from 'path'
import { FileEntry } from '../../types/files.js'
import { createReadStream } from 'fs'
import { LSBlockDevice, NomadDiskInfoRaw } from '../../types/system.js'

export const ZIM_STORAGE_PATH = '/storage/zim'

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
export async function getFile(
  path: string,
  returnType: 'stream'
): Promise<NodeJS.ReadableStream | null>
export async function getFile(path: string, returnType: 'string'): Promise<string | null>
export async function getFile(
  path: string,
  returnType: 'buffer' | 'string' | 'stream' = 'buffer'
): Promise<Buffer | string | NodeJS.ReadableStream | null> {
  try {
    if (returnType === 'string') {
      return await readFile(path, 'utf-8')
    } else if (returnType === 'stream') {
      return createReadStream(path)
    }
    return await readFile(path)
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

export function getAllFilesystems(
  device: LSBlockDevice,
  fsSize: NomadDiskInfoRaw['fsSize']
): NomadDiskInfoRaw['fsSize'] {
  const filesystems: NomadDiskInfoRaw['fsSize'] = []
  const seen = new Set()

  function traverse(dev: LSBlockDevice) {
    // Try to find matching filesystem
    const fs = fsSize.find((f) => matchesDevice(f.fs, dev.name))

    if (fs && !seen.has(fs.fs)) {
      filesystems.push(fs)
      seen.add(fs.fs)
    }

    // Traverse children recursively
    if (dev.children) {
      dev.children.forEach((child) => traverse(child))
    }
  }

  traverse(device)
  return filesystems
}

export function matchesDevice(fsPath: string, deviceName: string): boolean {
  // Remove /dev/ and /dev/mapper/ prefixes
  const normalized = fsPath.replace('/dev/mapper/', '').replace('/dev/', '')

  // Direct match
  if (normalized === deviceName) {
    return true
  }

  // LVM volumes use dashes instead of slashes
  // e.g., ubuntu--vg-ubuntu--lv matches the device name
  if (fsPath.includes(deviceName)) {
    return true
  }

  return false
}

export function determineFileType(filename: string): 'image' | 'pdf' | 'text' | 'zim' | 'unknown' {
  const ext = path.extname(filename).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'].includes(ext)) {
    return 'image'
  } else if (ext === '.pdf') {
    return 'pdf'
  } else if (['.txt', '.md', '.docx', '.rtf'].includes(ext)) {
    return 'text'
  } else if (ext === '.zim') {
    return 'zim'
  } else {
    return 'unknown'
  }
}

/**
 * Sanitize a filename by removing potentially dangerous characters.
 * @param filename The original filename
 * @returns The sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_')
}