// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  setGlobalNotificationCallback,
  capitalizeFirstLetter,
  formatBytes,
  generateRandomString,
  generateUUID,
  extractFileName,
  catchInternal
} from './util' 

describe('util', () => {
  describe('capitalizeFirstLetter', () => {
    it('should capitalize the first letter of a string', () => {
      expect(capitalizeFirstLetter('nomad')).toBe('Nomad')
      expect(capitalizeFirstLetter('PROJECT')).toBe('PROJECT')
    })

    it('should handle empty or null values safely', () => {
      expect(capitalizeFirstLetter('')).toBe('')
      expect(capitalizeFirstLetter(null)).toBe('')
      expect(capitalizeFirstLetter(undefined)).toBe('')
    })
  })

  describe('formatBytes', () => {
    it('should format bytes into human readable sizes', () => {
      expect(formatBytes(0)).toBe('0 Bytes')
      expect(formatBytes(1024)).toBe('1 KB')
      expect(formatBytes(1048576)).toBe('1 MB')
    })

    it('should respect decimal places', () => {
      expect(formatBytes(1500, 2)).toBe('1.46 KB')
      expect(formatBytes(1500, 0)).toBe('1 KB')
    })
  })

  describe('generateRandomString', () => {
    it('should generate a string of the exact specified length', () => {
      expect(generateRandomString(10)).toHaveLength(10)
      expect(generateRandomString(0)).toBe('')
    })
  })

  describe('generateUUID', () => {
    it('should generate a valid UUID v4 format string', () => {
      const uuid = generateUUID()
      // Regex UUID
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })
  })

  describe('extractFileName', () => {
    it('should extract filename from unix-style paths', () => {
      expect(extractFileName('/storage/zim/wikipedia.zim')).toBe('wikipedia.zim')
    })

    it('should extract filename from windows-style paths', () => {
      expect(extractFileName('C:\\Users\\nomad\\downloads\\map.pmtiles')).toBe('map.pmtiles')
    })

    it('should return the original string if no path separators exist', () => {
      expect(extractFileName('just-a-file.pdf')).toBe('just-a-file.pdf')
    })
  })

  describe('catchInternal', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
      setGlobalNotificationCallback(null as any) 
    })

    it('should return the result of the wrapped function if successful', async () => {
      const fn = vi.fn().mockResolvedValue('success data')
      const wrapped = catchInternal(fn)
      const result = await wrapped()

      expect(result).toBe('success data')
      expect(fn).toHaveBeenCalled()
    })

    it('should catch errors, log to console, and trigger global notification', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const notificationMock = vi.fn()
      setGlobalNotificationCallback(notificationMock)

      const fn = vi.fn().mockRejectedValue(new Error('API Timeout'))
      const wrapped = catchInternal(fn)
      const result = await wrapped()

      expect(result).toBeUndefined()
      expect(consoleSpy).toHaveBeenCalledWith('Internal error caught:', expect.any(Error))
      expect(notificationMock).toHaveBeenCalledWith({
        message: expect.stringContaining('API Timeout'),
        type: 'error',
        duration: 5000
      })
    })
  })
})