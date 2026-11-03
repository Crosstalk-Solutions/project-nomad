import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codeBlockText } from '../../inertia/lib/chat_copy.js'
import { canUseAsyncClipboard, copyToClipboard } from '../../inertia/lib/clipboard.js'

/** hast for ```bash\nls -la\ncd /tmp\n``` as react-markdown hands it to `pre`. */
const FENCED_PRE = {
  type: 'element',
  tagName: 'pre',
  children: [
    {
      type: 'element',
      tagName: 'code',
      properties: { className: ['language-bash'] },
      children: [{ type: 'text', value: 'ls -la\ncd /tmp\n' }],
    },
  ],
}

test('codeBlockText returns the code without the trailing fence newline', () => {
  assert.equal(codeBlockText(FENCED_PRE), 'ls -la\ncd /tmp')
})

test('codeBlockText keeps intentional blank lines and only drops one newline', () => {
  const node = {
    type: 'element',
    children: [{ type: 'element', children: [{ type: 'text', value: 'a\n\nb\n\n' }] }],
  }
  assert.equal(codeBlockText(node), 'a\n\nb\n')
})

test('codeBlockText concatenates nested text nodes (e.g. highlighted spans)', () => {
  const node = {
    type: 'element',
    children: [
      {
        type: 'element',
        children: [
          { type: 'element', children: [{ type: 'text', value: 'echo' }] },
          { type: 'text', value: ' "hi"\r\n' },
        ],
      },
    ],
  }
  assert.equal(codeBlockText(node), 'echo "hi"')
})

test('codeBlockText tolerates a missing node', () => {
  assert.equal(codeBlockText(undefined), '')
  assert.equal(codeBlockText(null), '')
})

test('canUseAsyncClipboard needs a secure context AND a writeText function', () => {
  const clipboard = { writeText: async () => {} }
  assert.equal(canUseAsyncClipboard({ isSecureContext: true, clipboard }), true)
  // Plain HTTP on a LAN IP: not a secure context (the common NOMAD case).
  assert.equal(canUseAsyncClipboard({ isSecureContext: false, clipboard }), false)
  // Browsers leave navigator.clipboard undefined outside secure contexts.
  assert.equal(canUseAsyncClipboard({ isSecureContext: false, clipboard: undefined }), false)
  assert.equal(canUseAsyncClipboard({ isSecureContext: true, clipboard: undefined }), false)
  assert.equal(canUseAsyncClipboard({ isSecureContext: true, clipboard: null }), false)
  assert.equal(canUseAsyncClipboard({ isSecureContext: true, clipboard: {} }), false)
  assert.equal(canUseAsyncClipboard({}), false)
})

test('copyToClipboard reports failure instead of throwing when no DOM is available', async () => {
  assert.equal(await copyToClipboard('x'), false)
})

/**
 * Temporarily install fake browser globals for one test. `navigator` is a
 * configurable getter on Node's globalThis, so it is swapped via
 * defineProperty and restored afterwards.
 */
async function withBrowserGlobals(
  globals: { isSecureContext: boolean; navigator: unknown; document: unknown },
  fn: () => Promise<void>
) {
  const g = globalThis as Record<string, unknown>
  const saved = {
    isSecureContext: Object.getOwnPropertyDescriptor(g, 'isSecureContext'),
    navigator: Object.getOwnPropertyDescriptor(g, 'navigator'),
    document: Object.getOwnPropertyDescriptor(g, 'document'),
  }
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(g, key, { value, configurable: true, writable: true })
  }
  try {
    await fn()
  } finally {
    for (const [key, desc] of Object.entries(saved)) {
      if (desc) Object.defineProperty(g, key, desc)
      else delete g[key]
    }
  }
}

function fakeDocument(execResult: boolean) {
  const calls = { appended: 0, removed: 0, copied: [] as string[] }
  const textarea = {
    value: '',
    style: {} as Record<string, string>,
    setAttribute() {},
    select() {},
    setSelectionRange() {},
  }
  const document = {
    body: {
      appendChild: () => calls.appended++,
      removeChild: () => calls.removed++,
    },
    activeElement: null,
    createElement: () => textarea,
    execCommand: (cmd: string) => {
      assert.equal(cmd, 'copy')
      calls.copied.push(textarea.value)
      return execResult
    },
  }
  return { document, calls }
}

test('copyToClipboard uses navigator.clipboard in a secure context', async () => {
  const written: string[] = []
  const { document, calls } = fakeDocument(true)
  await withBrowserGlobals(
    {
      isSecureContext: true,
      navigator: { clipboard: { writeText: async (t: string) => void written.push(t) } },
      document,
    },
    async () => {
      assert.equal(await copyToClipboard('hello'), true)
    }
  )
  assert.deepEqual(written, ['hello'])
  assert.deepEqual(calls.copied, [])
})

test('copyToClipboard falls back to execCommand over plain HTTP (#1376)', async () => {
  const { document, calls } = fakeDocument(true)
  await withBrowserGlobals({ isSecureContext: false, navigator: {}, document }, async () => {
    assert.equal(await copyToClipboard('ls -la'), true)
  })
  assert.deepEqual(calls.copied, ['ls -la'])
  // The temporary textarea must not be left in the page.
  assert.equal(calls.appended, 1)
  assert.equal(calls.removed, 1)
})

test('copyToClipboard falls back when writeText rejects, and reports failure honestly', async () => {
  const { document, calls } = fakeDocument(false)
  await withBrowserGlobals(
    {
      isSecureContext: true,
      navigator: {
        clipboard: {
          writeText: async () => {
            throw new Error('NotAllowedError')
          },
        },
      },
      document,
    },
    async () => {
      assert.equal(await copyToClipboard('x'), false)
    }
  )
  assert.deepEqual(calls.copied, ['x'])
  assert.equal(calls.removed, 1)
})
