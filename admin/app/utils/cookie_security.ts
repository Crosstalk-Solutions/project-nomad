/**
 * Decide whether cookies should be marked Secure from the public URL users visit.
 */
export function shouldUseSecureCookies(publicUrl: string): boolean {
  try {
    return new URL(publicUrl).protocol === 'https:'
  } catch {
    return false
  }
}
