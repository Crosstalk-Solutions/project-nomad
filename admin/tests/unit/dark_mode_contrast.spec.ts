import * as assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const css = await readFile(new URL('../../inertia/css/app.css', import.meta.url), 'utf8')
const builderTagSelector = await readFile(
  new URL('../../inertia/components/BuilderTagSelector.tsx', import.meta.url),
  'utf8'
)

const darkTheme = css.match(/\[data-theme="dark"\]\s*\{(?<tokens>[\s\S]*?)\n\}/)?.groups?.tokens

if (!darkTheme) {
  throw new Error('dark theme token block must exist')
}

function token(name: string) {
  const value = darkTheme!.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]
  assert.ok(value, `${name} must be defined in the dark theme`)
  return value
}

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrast(foreground: string, background: string) {
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

test('dark accent text clears WCAG AA without changing the accent background', () => {
  const accent = token('--color-desert-green-foreground')
  const surfaces = [
    token('--color-desert-sand'),
    token('--color-desert-white'),
    token('--color-surface-secondary'),
  ]

  for (const surface of surfaces) {
    assert.ok(
      contrast(accent, surface) >= 4.5,
      `${accent} on ${surface} must have at least 4.5:1 contrast`
    )
  }

  assert.match(
    css,
    /\[data-theme="dark"\] \.text-desert-green\s*\{\s*color:\s*var\(--color-desert-green-foreground\)/,
    'dark text-desert-green utilities must use the foreground-only accent token'
  )
  assert.ok(
    contrast('#ffffff', token('--color-desert-green')) >= 4.5,
    'the unchanged accent background must retain readable white text'
  )
})

test('Builder Tag controls pair their inverted background with semantic text', () => {
  const controls = builderTagSelector.match(
    /className="[^"]*bg-desert-stone-lighter[^"]*text-text-primary[^"]*"/g
  )

  assert.equal(controls?.length, 3, 'the two selects and number should use semantic text')
  assert.ok(
    contrast(token('--color-text-primary'), token('--color-desert-stone-lighter')) >= 4.5,
    'Builder Tag text and background must have at least 4.5:1 contrast'
  )
})
