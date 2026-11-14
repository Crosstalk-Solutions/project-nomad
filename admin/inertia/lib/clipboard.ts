/**
 * Copy text to the clipboard, including over plain HTTP.
 *
 * NOMAD is usually reached at a LAN address over plain HTTP, which is not a
 * secure context, so `navigator.clipboard` is undefined there. Fall back to a
 * hidden textarea + `document.execCommand('copy')` in that case.
 *
 * Returns true when the copy succeeded.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or document not focused: try the fallback below.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  // Off-screen rather than display:none, which some browsers refuse to select.
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  const previousFocus = document.activeElement as HTMLElement | null
  textarea.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
    previousFocus?.focus?.()
  }
}
