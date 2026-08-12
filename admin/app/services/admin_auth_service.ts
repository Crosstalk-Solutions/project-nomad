import { timingSafeEqual } from 'node:crypto'
import env from '#start/env'

const FALLBACK_ADMIN_USER = 'admin'

export default class AdminAuthService {
  /**
   * Resolve the configured admin username. The password must still be provided
   * with ADMIN_PASS before login is enabled.
   */
  static user(): string {
    return env.get('ADMIN_USER', FALLBACK_ADMIN_USER).trim() || FALLBACK_ADMIN_USER
  }

  /**
   * Admin login is disabled until ADMIN_PASS has a non-empty value.
   */
  static isConfigured(): boolean {
    return Boolean(env.get('ADMIN_PASS')?.trim())
  }

  /**
   * Compare supplied credentials to environment-controlled credentials.
   */
  static authenticate(user: string, password: string): boolean {
    const configuredPassword = env.get('ADMIN_PASS')?.trim()

    if (!configuredPassword) {
      return false
    }

    return (
      this.secureCompare(user, this.user()) &&
      this.secureCompare(password, configuredPassword)
    )
  }

  private static secureCompare(input: string, expected: string): boolean {
    const inputBuffer = Buffer.from(input)
    const expectedBuffer = Buffer.from(expected)

    if (inputBuffer.length !== expectedBuffer.length) {
      return false
    }

    return timingSafeEqual(inputBuffer, expectedBuffer)
  }
}
