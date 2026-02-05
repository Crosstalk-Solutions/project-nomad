import { Notification } from "~/context/NotificationContext"

// Global notification callback that can be set by the NotificationProvider
let globalNotificationCallback: ((notification: Notification) => void) | null = null

export function setGlobalNotificationCallback(callback: (notification: Notification) => void) {
  globalNotificationCallback = callback
}

export function capitalizeFirstLetter(str?: string | null): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function generateRandomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  return result
}

export function generateUUID(): string {
  const arr = new Uint8Array(16)
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(arr)
  } else {
    // Fallback for non-secure contexts where window.crypto is not available
    // This is not cryptographically secure, but can be used for non-critical purposes
    for (let i = 0; i < 16; i++) {
      arr[i] = Math.floor(Math.random() * 256)
    }
  }

  arr[6] = (arr[6] & 0x0f) | 0x40 // Version 4
  arr[8] = (arr[8] & 0x3f) | 0x80 // Variant bits

  const hex = Array.from(arr, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Extracts the file name from a given path while handling both forward and backward slashes.
 * @param path The full file path.
 * @returns The extracted file name.
 */
export const extractFileName = (path: string) => {
  if (!path) return ''
  if (path.includes('/')) {
    return path.substring(path.lastIndexOf('/') + 1)
  }
  if (path.includes('\\')) {
    return path.substring(path.lastIndexOf('\\') + 1)
  }
  return path
}

/**
 * A higher-order function that wraps an asynchronous function to catch and log internal errors.
 * @param fn The asynchronous function to be wrapped.
 * @returns A new function that executes the original function and logs any errors. Returns undefined in case of an error.
 */
export function catchInternal<Fn extends (...args: any[]) => any>(fn: Fn): (...args: Parameters<Fn>) => Promise<ReturnType<Fn> | undefined> {
  return async (...args: any[]) => {
    try {
      return await fn(...args)
    } catch (error) {
      console.error('Internal error caught:', error)

      if (globalNotificationCallback) {
        const errorMessage = 'An internal error occurred. Please try again or check the console for details. ' + (error instanceof Error ? String(error.message).slice(0, 50) : '')
        globalNotificationCallback({
          message: errorMessage,
          type: 'error',
          duration: 5000
        })
      }

      return undefined
    }
  }
}