import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CANONICAL_ZIM_BASE_URL,
  FAILED_MEASUREMENT_TTL_MS,
  MEASUREMENT_TTL_MS,
  canonicalZimRelativePath,
  isMeasurementFresh,
  parseMirrorMeasurement,
  parseMirrorOverride,
  pickFastestMirror,
  resolveZimMirror,
  rewriteZimUrlToMirror,
  type ZimMirrorMeasurement,
} from '../../app/utils/zim_mirror.js'

const WIKI = 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_maxi_2026-01.zim'
const YOUR_ORG = 'https://ftpmirror.your.org/pub/kiwix/zim/'
const DOTSRC = 'https://mirrors.dotsrc.org/kiwix/zim/'

const SOURCES = [
  { id: 1, base_url: 'https://cdimage.debian.org/mirror/kiwix.org/zim/' },
  { id: 2, base_url: YOUR_ORG },
  { id: 3, base_url: DOTSRC },
]

function measured(
  baseUrl: string | null,
  measuredAt = new Date().toISOString()
): ZimMirrorMeasurement {
  return { baseUrl, measuredAt, results: [] }
}

// ---- URL rewriting ----

test('rewrites a canonical Kiwix ZIM URL onto a mirror base', () => {
  assert.equal(
    rewriteZimUrlToMirror(WIKI, YOUR_ORG),
    'https://ftpmirror.your.org/pub/kiwix/zim/wikipedia/wikipedia_en_all_maxi_2026-01.zim'
  )
})

test('adds the missing trailing slash on the mirror base', () => {
  assert.equal(
    rewriteZimUrlToMirror(WIKI, 'https://mirrors.dotsrc.org/kiwix/zim'),
    'https://mirrors.dotsrc.org/kiwix/zim/wikipedia/wikipedia_en_all_maxi_2026-01.zim'
  )
})

test('null mirror base leaves the URL untouched', () => {
  assert.equal(rewriteZimUrlToMirror(WIKI, null), WIKI)
})

test('non-canonical URLs are never rewritten', () => {
  const gated = 'https://nomad-packs-worker.chris-556.workers.dev/content/field-manuals_2026-07.zim'
  const alreadyMirror = 'https://mirrors.dotsrc.org/kiwix/zim/other/foo_2026-01.zim'
  const pmtiles = 'https://download.kiwix.org/maps/foo.pmtiles'
  const meta4 = 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_maxi_2026-01.zim.meta4'
  for (const url of [gated, alreadyMirror, pmtiles, meta4, 'not a url']) {
    assert.equal(rewriteZimUrlToMirror(url, YOUR_ORG), url)
  }
})

test('a malformed mirror base falls back to the canonical URL', () => {
  assert.equal(rewriteZimUrlToMirror(WIKI, 'not a url'), WIKI)
})

test('canonicalZimRelativePath extracts the path below /zim/', () => {
  assert.equal(canonicalZimRelativePath(WIKI), 'wikipedia/wikipedia_en_all_maxi_2026-01.zim')
  assert.equal(canonicalZimRelativePath('https://download.kiwix.org/zim/'), null)
  assert.equal(canonicalZimRelativePath('ftp://download.kiwix.org/zim/a/b.zim'), null)
})

// ---- Picking the fastest ----

test('picks the highest throughput', () => {
  assert.equal(
    pickFastestMirror([
      { baseUrl: CANONICAL_ZIM_BASE_URL, bytesPerSecond: 4.1e6 },
      { baseUrl: YOUR_ORG, bytesPerSecond: 36.7e6 },
      { baseUrl: DOTSRC, bytesPerSecond: 20.4e6 },
    ]),
    YOUR_ORG
  )
})

test('failed and timed-out probes are ignored', () => {
  assert.equal(
    pickFastestMirror([
      { baseUrl: CANONICAL_ZIM_BASE_URL, bytesPerSecond: 1e6 },
      { baseUrl: YOUR_ORG, bytesPerSecond: null },
      { baseUrl: DOTSRC, bytesPerSecond: Number.NaN },
      { baseUrl: 'https://x/zim/', bytesPerSecond: 0 },
      { baseUrl: 'https://y/zim/', bytesPerSecond: Number.POSITIVE_INFINITY },
    ]),
    CANONICAL_ZIM_BASE_URL
  )
})

test('returns null when every probe failed (offline box)', () => {
  assert.equal(
    pickFastestMirror([
      { baseUrl: CANONICAL_ZIM_BASE_URL, bytesPerSecond: null },
      { baseUrl: YOUR_ORG, bytesPerSecond: null },
    ]),
    null
  )
  assert.equal(pickFastestMirror([]), null)
})

test('a tie keeps the earlier (canonical-first) entry', () => {
  assert.equal(
    pickFastestMirror([
      { baseUrl: CANONICAL_ZIM_BASE_URL, bytesPerSecond: 5e6 },
      { baseUrl: YOUR_ORG, bytesPerSecond: 5e6 },
    ]),
    CANONICAL_ZIM_BASE_URL
  )
})

// ---- Resolver precedence: override > measured > default ----

test('override beats the measurement', () => {
  assert.deepEqual(
    resolveZimMirror({ override: '3', measurement: measured(YOUR_ORG), sources: SOURCES }),
    { baseUrl: DOTSRC, reason: 'override' }
  )
})

test("'canonical' override pins download.kiwix.org even with a measurement", () => {
  assert.deepEqual(
    resolveZimMirror({ override: 'canonical', measurement: measured(YOUR_ORG), sources: SOURCES }),
    { baseUrl: null, reason: 'override' }
  )
})

test('auto uses the measured mirror', () => {
  assert.deepEqual(
    resolveZimMirror({ override: 'auto', measurement: measured(YOUR_ORG), sources: SOURCES }),
    { baseUrl: YOUR_ORG, reason: 'measured' }
  )
})

test('a measurement won by the canonical host resolves to no rewrite', () => {
  assert.deepEqual(
    resolveZimMirror({
      override: 'auto',
      measurement: measured(CANONICAL_ZIM_BASE_URL),
      sources: SOURCES,
    }),
    { baseUrl: null, reason: 'measured' }
  )
})

test('no measurement (or a failed one) falls back to the canonical default', () => {
  assert.deepEqual(resolveZimMirror({ override: 'auto', measurement: null, sources: SOURCES }), {
    baseUrl: null,
    reason: 'default',
  })
  assert.deepEqual(
    resolveZimMirror({ override: 'auto', measurement: measured(null), sources: SOURCES }),
    { baseUrl: null, reason: 'default' }
  )
})

test('an override naming a deleted source falls through to the measurement', () => {
  assert.deepEqual(
    resolveZimMirror({ override: '99', measurement: measured(DOTSRC), sources: SOURCES }),
    { baseUrl: DOTSRC, reason: 'measured' }
  )
})

// ---- Stored values ----

test('parseMirrorOverride accepts only known shapes', () => {
  assert.equal(parseMirrorOverride(null), 'auto')
  assert.equal(parseMirrorOverride('auto'), 'auto')
  assert.equal(parseMirrorOverride('canonical'), 'canonical')
  assert.equal(parseMirrorOverride('7'), '7')
  assert.equal(parseMirrorOverride('0'), 'auto')
  assert.equal(parseMirrorOverride('7; drop'), 'auto')
})

test('parseMirrorMeasurement round-trips and rejects junk', () => {
  const m: ZimMirrorMeasurement = {
    baseUrl: YOUR_ORG,
    measuredAt: '2026-11-01T00:00:00.000Z',
    results: [{ baseUrl: YOUR_ORG, bytesPerSecond: 1e6 }],
  }
  assert.deepEqual(parseMirrorMeasurement(JSON.stringify(m)), m)
  assert.equal(parseMirrorMeasurement(null), null)
  assert.equal(parseMirrorMeasurement('{'), null)
  assert.equal(parseMirrorMeasurement('{"baseUrl":5,"measuredAt":"2026-11-01"}'), null)
  assert.equal(parseMirrorMeasurement('{"baseUrl":null,"measuredAt":"nope"}'), null)
})

test('freshness: successful measurements live 7 days, failed ones 1 day', () => {
  const now = Date.parse('2026-11-10T00:00:00.000Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()

  assert.equal(isMeasurementFresh(null, now), false)
  assert.equal(isMeasurementFresh(measured(YOUR_ORG, ago(MEASUREMENT_TTL_MS - 1000)), now), true)
  assert.equal(isMeasurementFresh(measured(YOUR_ORG, ago(MEASUREMENT_TTL_MS + 1000)), now), false)
  assert.equal(isMeasurementFresh(measured(null, ago(FAILED_MEASUREMENT_TTL_MS - 1000)), now), true)
  assert.equal(
    isMeasurementFresh(measured(null, ago(FAILED_MEASUREMENT_TTL_MS + 1000)), now),
    false
  )
  // A clock that went backwards must not pin a measurement forever.
  assert.equal(isMeasurementFresh(measured(YOUR_ORG, ago(-60_000)), now), false)
})
