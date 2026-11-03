/**
 * Clipboard helper shared by the UI (#1376).
 *
 * NOMAD is normally reached over plain HTTP on a LAN address
 * (`http://192.168.x.x:8080`). That is not a secure context, and browsers only
 * expose `navigator.clipboard` on HTTPS or `localhost` — so on almost every
 * real install it is `undefined`, and a `writeText()`-only implementation
 * would silently do nothing. We therefore use the async Clipboard API when it
 * is genuinely available and otherwise fall back to the legacy hidden
 * `<textarea>` + `document.execCommand('copy')` path, which still works in
 * insecure contexts as long as it runs inside a user gesture (a click).
 */

export interface ClipboardEnv {
  isSecureContext?: boolean
  clipboard?: { writeText?: unknown } | null
}

/** True when the async Clipboard API can be used in this environment. */
export function canUseAsyncClipboard(env: ClipboardEnv): boolean {
  return env.isSecureContext === true && typeof env.clipboard?.writeText === 'function'
}

/**
 * The browser globals we touch, typed locally and read off `globalThis`.
 * This module is also imported by the node unit tests, whose tsconfig has no
 * DOM lib, so it must not name `window`/`document` types directly.
 */
interface BrowserGlobals {
  isSecureContext?: boolean
  navigator?: { clipboard?: { writeText(text: string): Promise<void> } }
  document?: {
    body: { appendChild(el: unknown): unknown; removeChild(el: unknown): unknown } | null
    activeElement: { focus?: () => void } | null
    createElement(tag: 'textarea'): {
      value: string
      style: Record<string, string>
      setAttribute(name: string, value: string): void
      select(): void
      setSelectionRange(start: number, end: number): void
    }
    execCommand(command: 'copy'): boolean
  }
}

const browser = globalThis as unknown as BrowserGlobals

/**
 * Legacy copy via a temporary off-screen textarea. It must run synchronously
 * inside the click handler: browsers refuse execCommand('copy') without a
 * user gesture.
 */
function copyViaExecCommand(text: string): boolean {
  const document = browser.document
  if (!document?.body) return false
  const previouslyFocused = document.activeElement
  const textarea = document.createElement('textarea')
  textarea.value = text
  // readonly keeps mobile keyboards from popping up; fixed + off-screen keeps
  // the page from scrolling or flashing while the text is selected.
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  try {
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
    previouslyFocused?.focus?.()
  }
}

/**
 * Copy `text` to the clipboard. Resolves to whether the copy succeeded so
 * callers can show an honest "Copied" / "Copy failed" confirmation.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const clipboard = browser.navigator?.clipboard
  if (clipboard && canUseAsyncClipboard({ isSecureContext: browser.isSecureContext, clipboard })) {
    try {
      await clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or document not focused; try the legacy path.
    }
  }
  return copyViaExecCommand(text)
}
