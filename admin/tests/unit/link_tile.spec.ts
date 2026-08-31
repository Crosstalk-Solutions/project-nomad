/**
 * Dashboard link tiles: URL normalisation and the icon allowlist.
 *
 * The URL rules matter beyond tidiness. `normalizeCustomUrl` restricting the
 * result to http(s) is the only thing stopping a `javascript:` or `data:` URL
 * being stored and later rendered into an href, so the rejection cases below are
 * a security boundary rather than input hygiene.
 *
 * Pure functions only, no MySQL, Redis, Qdrant or Ollama needed:
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeCustomUrl } from '../../app/validators/system.js'
import {
  DEFAULT_LINK_TILE_ICON,
  LINK_TILE_ICONS,
  isLinkTileIcon,
} from '../../constants/link_tile_icons.js'
import {
  DEFAULT_LINK_TILE_COLOR,
  LINK_TILE_COLORS,
  LINK_TILE_COLOR_IDS,
  linkTileColor,
} from '../../constants/link_tile_colors.js'

test('a bare host:port gains http, which is what most LAN devices need', () => {
  assert.equal(normalizeCustomUrl('192.168.1.50:8080'), 'http://192.168.1.50:8080/')
  assert.equal(normalizeCustomUrl('nas.local'), 'http://nas.local/')
})

test('an explicit https scheme is preserved rather than downgraded', () => {
  assert.equal(normalizeCustomUrl('https://nas.local'), 'https://nas.local/')
  assert.equal(normalizeCustomUrl('https://nas.local:9443'), 'https://nas.local:9443/')
})

test('a path survives normalisation', () => {
  assert.equal(normalizeCustomUrl('192.168.1.50:8080/admin'), 'http://192.168.1.50:8080/admin')
  assert.equal(normalizeCustomUrl('https://nas.local/ui/dashboard'), 'https://nas.local/ui/dashboard')
})

test('a query string and port are both kept', () => {
  assert.equal(
    normalizeCustomUrl('http://10.0.0.5:3000/app?tab=media'),
    'http://10.0.0.5:3000/app?tab=media'
  )
})

test('surrounding whitespace is trimmed', () => {
  assert.equal(normalizeCustomUrl('   192.168.1.50:8080   '), 'http://192.168.1.50:8080/')
})

test('empty input is null, not an error', () => {
  // The caller treats null as "no URL given" and refuses to save, rather than
  // storing a tile that goes nowhere.
  assert.equal(normalizeCustomUrl(''), null)
  assert.equal(normalizeCustomUrl('   '), null)
  assert.equal(normalizeCustomUrl(null), null)
  assert.equal(normalizeCustomUrl(undefined), null)
})

test('script-bearing schemes are rejected, which is the XSS boundary', () => {
  // These are the ones that matter: a stored javascript:/data: value would later
  // be rendered into an href. They are refused because prefixing http:// leaves a
  // non-numeric "port", which makes new URL() throw.
  assert.equal(normalizeCustomUrl('javascript:alert(1)'), null)
  assert.equal(normalizeCustomUrl('JAVASCRIPT:alert(1)'), null)
  assert.equal(normalizeCustomUrl('  javascript:alert(1)'), null)
  assert.equal(normalizeCustomUrl('data:text/html,<script>alert(1)</script>'), null)
  assert.equal(normalizeCustomUrl('vbscript:msgbox'), null)
})

test('file: and ftp: are mangled into harmless http URLs rather than rejected', () => {
  // Documenting existing shared behaviour rather than endorsing it. Neither
  // scheme survives: both end up as an http URL pointing at a host named "file"
  // or "ftp", which goes nowhere and cannot execute anything. It is a usability
  // wart, not a security hole, and normalizeCustomUrl is shared with the custom
  // app URL feature, so it is not changed here.
  assert.equal(normalizeCustomUrl('file:///etc/passwd'), 'http://file///etc/passwd')
  assert.equal(normalizeCustomUrl('ftp://example.com'), 'http://ftp//example.com')
})

test('a scheme in mixed case is still recognised as http(s)', () => {
  // The scheme test is case-insensitive, so this must not be double-prefixed
  // into "http://HTTPS://nas.local".
  assert.equal(normalizeCustomUrl('HTTPS://nas.local'), 'https://nas.local/')
})

test('the icon set is exactly 36, so the picker fills a 6x6 grid', () => {
  assert.equal(LINK_TILE_ICONS.length, 36)
  assert.equal(new Set(LINK_TILE_ICONS).size, 36, 'no duplicates')
})

test('isLinkTileIcon accepts only names in the set', () => {
  assert.equal(isLinkTileIcon('IconServer'), true)
  assert.equal(isLinkTileIcon(DEFAULT_LINK_TILE_ICON), true)
  // Real Tabler icons that are deliberately not offered must still be refused,
  // otherwise the server would store a name the picker cannot round-trip.
  assert.equal(isLinkTileIcon('IconTrash'), false)
  assert.equal(isLinkTileIcon('IconNotARealIcon'), false)
  assert.equal(isLinkTileIcon(''), false)
  assert.equal(isLinkTileIcon(null), false)
  assert.equal(isLinkTileIcon(42), false)
})

test('the default icon is part of the offered set', () => {
  assert.ok((LINK_TILE_ICONS as readonly string[]).includes(DEFAULT_LINK_TILE_ICON))
})

test('link tile colors resolve from the brand palette', () => {
  // Unknown, null and empty all fall back rather than rendering an untinted card.
  assert.equal(linkTileColor('orange').id, 'orange')
  assert.equal(linkTileColor(null).id, DEFAULT_LINK_TILE_COLOR)
  assert.equal(linkTileColor('chartreuse').id, DEFAULT_LINK_TILE_COLOR)
})

test('every link tile color ships complete, literal Tailwind classes', () => {
  // Tailwind scans for literal class strings, so an interpolated name would be
  // dropped from the build and the tile would render untinted.
  for (const option of LINK_TILE_COLORS) {
    assert.ok(option.border.startsWith('border-desert-'), option.id)
    assert.ok(option.bg.startsWith('bg-desert-'), option.id)
    assert.ok(option.marker.startsWith('text-desert-'), option.id)
    assert.ok(!`${option.border}${option.bg}${option.marker}`.includes('${'), option.id)
  }
})

test('the default color is one of the offered options', () => {
  assert.ok(LINK_TILE_COLOR_IDS.includes(DEFAULT_LINK_TILE_COLOR))
})
