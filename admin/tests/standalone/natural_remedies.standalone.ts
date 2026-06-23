/**
 * Standalone gate test for the natural-remedies pure helpers (Phase 2).
 *
 * Japa cannot boot locally without MySQL/Redis, so this file exercises the pure
 * helpers (parseNaturalRemediesFile, parseRemedyEntry, remediesForCondition,
 * remediesForFreeText) directly under `node --experimental-strip-types`. Run:
 *   node --experimental-strip-types tests/standalone/natural_remedies.standalone.ts
 *
 * Also asserts that admin/app/data/natural_remedies.ts stays in sync with
 * collections/natural_remedies.json (same version + same remedy count + same slugs)
 * and that every remedy condition slug exists in the conditions spine.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseNaturalRemediesFile,
  parseRemedyEntry,
  remediesForCondition,
  remediesForFreeText,
} from '../../util/conditions.ts'
import { NATURAL_REMEDIES_FILE } from '../../app/data/natural_remedies.ts'
import { CONDITIONS_FILE } from '../../app/data/conditions.ts'
import { parseConditionsFile } from '../../util/conditions.ts'
import type { NaturalRemediesFile } from '../../types/conditions.ts'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ok - ${name}`)
}

// ── parseRemedyEntry ──────────────────────────────────────────────────────────

check('parseRemedyEntry accepts a well-formed entry', () => {
  const entry = parseRemedyEntry({
    slug: 'ginger',
    name: 'Ginger',
    commonNames: ['Zingiber officinale'],
    conditions: ['nausea-vomiting'],
    uses: 'Used for nausea.',
    evidence: 'Some evidence.',
    cautions: 'May interact with blood thinners.',
    sourceUrl: 'https://www.nccih.nih.gov/health/ginger',
  })
  assert.ok(entry)
  assert.equal(entry!.slug, 'ginger')
  assert.equal(entry!.name, 'Ginger')
  assert.deepEqual(entry!.commonNames, ['Zingiber officinale'])
  assert.deepEqual(entry!.conditions, ['nausea-vomiting'])
})

check('parseRemedyEntry rejects missing required string fields', () => {
  // missing slug
  assert.equal(
    parseRemedyEntry({
      name: 'Ginger',
      commonNames: [],
      conditions: ['nausea'],
      uses: 'u',
      evidence: 'e',
      cautions: 'c',
      sourceUrl: 'https://example.com',
    }),
    null
  )
  // missing uses
  assert.equal(
    parseRemedyEntry({
      slug: 'ginger',
      name: 'Ginger',
      commonNames: [],
      conditions: ['nausea'],
      evidence: 'e',
      cautions: 'c',
      sourceUrl: 'https://example.com',
    }),
    null
  )
})

check('parseRemedyEntry rejects an entry with no usable conditions', () => {
  assert.equal(
    parseRemedyEntry({
      slug: 'g',
      name: 'G',
      commonNames: [],
      conditions: [],
      uses: 'u',
      evidence: 'e',
      cautions: 'c',
      sourceUrl: 'https://example.com',
    }),
    null
  )
})

check('parseRemedyEntry rejects non-objects', () => {
  assert.equal(parseRemedyEntry(null), null)
  assert.equal(parseRemedyEntry('ginger'), null)
  assert.equal(parseRemedyEntry(42), null)
})

check('parseRemedyEntry keeps non-empty commonNames, drops empties', () => {
  const entry = parseRemedyEntry({
    slug: 'g',
    name: 'G',
    commonNames: ['name', '', '  ', 'other'],
    conditions: ['c'],
    uses: 'u',
    evidence: 'e',
    cautions: 'c',
    sourceUrl: 'https://example.com',
  })
  assert.ok(entry)
  assert.deepEqual(entry!.commonNames, ['name', 'other'])
})

// ── parseNaturalRemediesFile ──────────────────────────────────────────────────

check('parseNaturalRemediesFile parses a valid file', () => {
  const file = parseNaturalRemediesFile({
    version: '2026-06-09',
    source: { name: 'NCCIH', url: 'https://nccih.nih.gov', license: 'Public domain' },
    remedies: [
      {
        slug: 'ginger',
        name: 'Ginger',
        commonNames: ['Zingiber officinale'],
        conditions: ['nausea-vomiting'],
        uses: 'Used for nausea.',
        evidence: 'Some evidence.',
        cautions: 'See a clinician.',
        sourceUrl: 'https://www.nccih.nih.gov/health/ginger',
      },
    ],
  })
  assert.equal(file.version, '2026-06-09')
  assert.equal(file.source.name, 'NCCIH')
  assert.equal(file.remedies.length, 1)
  assert.equal(file.remedies[0].slug, 'ginger')
})

check('parseNaturalRemediesFile drops malformed entries but keeps good ones', () => {
  const file = parseNaturalRemediesFile({
    version: 'v',
    source: { name: 'S', url: 'u', license: 'l' },
    remedies: [
      {
        slug: 'good',
        name: 'Good',
        commonNames: [],
        conditions: ['pain'],
        uses: 'u',
        evidence: 'e',
        cautions: 'c',
        sourceUrl: 'https://example.com',
      },
      { slug: 'bad-no-conditions', name: 'Bad', commonNames: [], conditions: [], uses: 'u', evidence: 'e', cautions: 'c', sourceUrl: 'https://example.com' },
      'not-an-object',
    ],
  })
  assert.equal(file.remedies.length, 1)
  assert.equal(file.remedies[0].slug, 'good')
})

check('parseNaturalRemediesFile de-dupes by slug, keeping the first', () => {
  const file = parseNaturalRemediesFile({
    version: 'v',
    source: { name: '', url: '', license: '' },
    remedies: [
      { slug: 'dup', name: 'First', commonNames: [], conditions: ['pain'], uses: 'u', evidence: 'e', cautions: 'c', sourceUrl: 'https://example.com' },
      { slug: 'dup', name: 'Second', commonNames: [], conditions: ['pain'], uses: 'u2', evidence: 'e2', cautions: 'c2', sourceUrl: 'https://example.com' },
    ],
  })
  assert.equal(file.remedies.length, 1)
  assert.equal(file.remedies[0].name, 'First')
})

check('parseNaturalRemediesFile fail-soft on garbage input', () => {
  const empty = parseNaturalRemediesFile(null)
  assert.equal(empty.version, 'unknown')
  assert.deepEqual(empty.remedies, [])

  const noRemedies = parseNaturalRemediesFile({ version: 'v', source: { name: '', url: '', license: '' } })
  assert.deepEqual(noRemedies.remedies, [])
})

// ── remediesForCondition ──────────────────────────────────────────────────────

const sampleFile = parseNaturalRemediesFile({
  version: 'v',
  source: { name: 'S', url: 'u', license: 'l' },
  remedies: [
    { slug: 'ginger', name: 'Ginger', commonNames: [], conditions: ['nausea-vomiting', 'indigestion'], uses: 'u', evidence: 'e', cautions: 'c', sourceUrl: 'https://example.com/ginger' },
    { slug: 'chamomile', name: 'Chamomile', commonNames: [], conditions: ['sleeplessness', 'indigestion'], uses: 'u', evidence: 'e', cautions: 'c', sourceUrl: 'https://example.com/chamomile' },
    { slug: 'aloe-vera', name: 'Aloe Vera', commonNames: [], conditions: ['burns'], uses: 'u', evidence: 'e', cautions: 'c', sourceUrl: 'https://example.com/aloe-vera' },
  ],
})

check('remediesForCondition returns remedies whose conditions[] includes the slug', () => {
  const result = remediesForCondition(sampleFile, 'indigestion')
  assert.equal(result.length, 2)
  assert.deepEqual(
    result.map((r) => r.slug),
    ['ginger', 'chamomile']
  )
})

check('remediesForCondition returns [] when slug matches nothing', () => {
  assert.deepEqual(remediesForCondition(sampleFile, 'fever'), [])
})

check('remediesForCondition returns [] for empty slug', () => {
  assert.deepEqual(remediesForCondition(sampleFile, ''), [])
  assert.deepEqual(remediesForCondition(sampleFile, '  '), [])
})

check('remediesForCondition preserves stable curated order', () => {
  const result = remediesForCondition(sampleFile, 'indigestion')
  assert.equal(result[0].slug, 'ginger')
  assert.equal(result[1].slug, 'chamomile')
})

check('remediesForCondition returns [] for empty remedies file', () => {
  const emptyFile = parseNaturalRemediesFile({ version: 'v', source: { name: '', url: '', license: '' }, remedies: [] })
  assert.deepEqual(remediesForCondition(emptyFile, 'burns'), [])
})

// ── remediesForFreeText ───────────────────────────────────────────────────────

check('remediesForFreeText matches on name (case-insensitive)', () => {
  const result = remediesForFreeText(sampleFile, 'GINGER')
  assert.equal(result.length, 1)
  assert.equal(result[0].slug, 'ginger')
})

check('remediesForFreeText matches on uses substring', () => {
  // All three have uses === 'u', so a substring match on 'u' returns all
  const result = remediesForFreeText(sampleFile, 'aloe')
  assert.equal(result.length, 1)
  assert.equal(result[0].slug, 'aloe-vera')
})

check('remediesForFreeText returns [] for empty query', () => {
  assert.deepEqual(remediesForFreeText(sampleFile, ''), [])
  assert.deepEqual(remediesForFreeText(sampleFile, '  '), [])
})

check('remediesForFreeText dedupes by slug', () => {
  // "indigestion" should not appear twice even if name AND uses both match
  const result = remediesForFreeText(sampleFile, 'Ginger')
  assert.equal(result.filter((r) => r.slug === 'ginger').length, 1)
})

// ── sync check: NATURAL_REMEDIES_FILE ↔ collections/natural_remedies.json ────

check('NATURAL_REMEDIES_FILE parses cleanly with no dropped entries', () => {
  const parsed = parseNaturalRemediesFile(NATURAL_REMEDIES_FILE)
  assert.equal(parsed.remedies.length, NATURAL_REMEDIES_FILE.remedies.length)
})

check('NATURAL_REMEDIES_FILE matches collections/natural_remedies.json in version + count + slugs', () => {
  // This test file is at admin/tests/standalone/; ../../../ reaches the repo root.
  const __dir = dirname(fileURLToPath(import.meta.url))
  const jsonPath = resolve(__dir, '../../../collections/natural_remedies.json')
  const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as NaturalRemediesFile

  // version
  assert.equal(
    NATURAL_REMEDIES_FILE.version,
    raw.version,
    `version mismatch: TS=${NATURAL_REMEDIES_FILE.version} JSON=${raw.version}`
  )

  // remedy count
  assert.equal(
    NATURAL_REMEDIES_FILE.remedies.length,
    raw.remedies.length,
    `remedy count mismatch: TS=${NATURAL_REMEDIES_FILE.remedies.length} JSON=${raw.remedies.length}`
  )

  // slug set equality
  const tsSlugs = new Set(NATURAL_REMEDIES_FILE.remedies.map((r) => r.slug))
  const jsonSlugs = new Set(raw.remedies.map((r: { slug: string }) => r.slug))
  for (const slug of tsSlugs) {
    assert.ok(jsonSlugs.has(slug), `slug in TS but not in JSON: ${slug}`)
  }
  for (const slug of jsonSlugs) {
    assert.ok(tsSlugs.has(slug), `slug in JSON but not in TS: ${slug}`)
  }
})

check('every remedy condition slug exists in the conditions spine', () => {
  const spine = parseConditionsFile(CONDITIONS_FILE)
  const knownSlugs = new Set(spine.conditions.map((c) => c.slug))
  const unknown: string[] = []
  for (const remedy of NATURAL_REMEDIES_FILE.remedies) {
    for (const condSlug of remedy.conditions) {
      if (!knownSlugs.has(condSlug)) {
        unknown.push(`${remedy.slug} → "${condSlug}"`)
      }
    }
  }
  assert.equal(
    unknown.length,
    0,
    `Unknown condition slugs in remedies:\n  ${unknown.join('\n  ')}`
  )
})

check('shipped NATURAL_REMEDIES_FILE has the 18 curated remedies', () => {
  const n = NATURAL_REMEDIES_FILE.remedies.length
  assert.equal(n, 18, `expected 18 remedies, got ${n}`)
})

check('shipped remedies have unique slugs and non-empty required fields', () => {
  const slugs = new Set<string>()
  for (const r of NATURAL_REMEDIES_FILE.remedies) {
    assert.ok(!slugs.has(r.slug), `duplicate slug: ${r.slug}`)
    slugs.add(r.slug)
    assert.ok(r.name.trim().length > 0, `empty name: ${r.slug}`)
    assert.ok(r.uses.trim().length > 0, `empty uses: ${r.slug}`)
    assert.ok(r.cautions.trim().length > 0, `empty cautions: ${r.slug}`)
    assert.ok(r.sourceUrl.startsWith('https://'), `bad sourceUrl: ${r.slug}`)
    assert.ok(r.conditions.length > 0, `no conditions: ${r.slug}`)
  }
})

console.log(`\n${passed} checks passed`)
