/**
 * Standalone gate test for the condition-spine pure helpers.
 *
 * Japa cannot boot locally without MySQL/Redis, so this file exercises the pure
 * helpers (parseConditionsFile, parseConditionEntry, buildIndicationQuery,
 * orderOtcFirst, findConditionBySlug, toConditionSummary) directly under
 * `node --experimental-strip-types`. Run:
 *   node --experimental-strip-types tests/standalone/conditions.standalone.ts
 *
 * Also smoke-checks the shipped curated spine (admin/app/data/conditions.ts)
 * parses cleanly and stays in the 30–50 range the spec calls for.
 */
import assert from 'node:assert/strict'
import {
  parseConditionsFile,
  parseConditionEntry,
  buildIndicationQuery,
  orderOtcFirst,
  findConditionBySlug,
  toConditionSummary,
  situationsForIndications,
  OTC_PRODUCT_TYPE,
  RX_PRODUCT_TYPE,
} from '../../util/conditions.ts'
import { CONDITIONS_FILE } from '../../app/data/conditions.ts'
import { PRODUCT_TYPES } from '../../types/drug_reference.ts'
import type { DrugSearchResult } from '../../types/drug_reference.ts'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ok - ${name}`)
}

function makeDrug(id: number, product_type: string | null): DrugSearchResult {
  return {
    id,
    brand_name: `Brand ${id}`,
    generic_name: `generic ${id}`,
    manufacturer: null,
    route: null,
    product_type,
    labelCount: 1,
  }
}

// ── parseConditionEntry ───────────────────────────────────────────────────────
check('parseConditionEntry accepts a well-formed entry', () => {
  const entry = parseConditionEntry({
    slug: 'burns',
    label: 'Burns',
    category: 'Skin & wounds',
    searchTerms: ['burns', 'sunburn'],
  })
  assert.ok(entry)
  assert.equal(entry!.slug, 'burns')
  assert.deepEqual(entry!.searchTerms, ['burns', 'sunburn'])
})

check('parseConditionEntry de-dupes searchTerms case-insensitively', () => {
  const entry = parseConditionEntry({
    slug: 's',
    label: 'L',
    category: 'C',
    searchTerms: ['Burn', 'burn', '  burn  ', 'scald'],
  })
  assert.ok(entry)
  assert.deepEqual(entry!.searchTerms, ['Burn', 'scald'])
})

check('parseConditionEntry rejects missing slug/label/category', () => {
  assert.equal(parseConditionEntry({ label: 'L', category: 'C', searchTerms: ['x'] }), null)
  assert.equal(parseConditionEntry({ slug: 's', category: 'C', searchTerms: ['x'] }), null)
  assert.equal(parseConditionEntry({ slug: 's', label: 'L', searchTerms: ['x'] }), null)
})

check('parseConditionEntry rejects an entry with no usable searchTerms', () => {
  assert.equal(parseConditionEntry({ slug: 's', label: 'L', category: 'C', searchTerms: [] }), null)
  assert.equal(
    parseConditionEntry({ slug: 's', label: 'L', category: 'C', searchTerms: ['', '   '] }),
    null
  )
})

check('parseConditionEntry rejects non-objects', () => {
  assert.equal(parseConditionEntry(null), null)
  assert.equal(parseConditionEntry('burns'), null)
  assert.equal(parseConditionEntry(42), null)
})

// ── parseConditionsFile ───────────────────────────────────────────────────────
check('parseConditionsFile parses a valid file', () => {
  const file = parseConditionsFile({
    version: '2026-06-07',
    conditions: [
      { slug: 'a', label: 'A', category: 'C', searchTerms: ['a'] },
      { slug: 'b', label: 'B', category: 'C', searchTerms: ['b'] },
    ],
  })
  assert.equal(file.version, '2026-06-07')
  assert.equal(file.conditions.length, 2)
})

check('parseConditionsFile drops malformed entries but keeps good ones', () => {
  const file = parseConditionsFile({
    version: 'v',
    conditions: [
      { slug: 'good', label: 'G', category: 'C', searchTerms: ['g'] },
      { slug: 'bad-no-terms', label: 'B', category: 'C', searchTerms: [] },
      'not-an-object',
    ],
  })
  assert.equal(file.conditions.length, 1)
  assert.equal(file.conditions[0].slug, 'good')
})

check('parseConditionsFile de-dupes by slug, keeping the first', () => {
  const file = parseConditionsFile({
    version: 'v',
    conditions: [
      { slug: 'dup', label: 'First', category: 'C', searchTerms: ['x'] },
      { slug: 'dup', label: 'Second', category: 'C', searchTerms: ['y'] },
    ],
  })
  assert.equal(file.conditions.length, 1)
  assert.equal(file.conditions[0].label, 'First')
})

check('parseConditionsFile fail-soft on garbage input', () => {
  assert.deepEqual(parseConditionsFile(null), { version: 'unknown', conditions: [] })
  assert.deepEqual(parseConditionsFile('nope'), { version: 'unknown', conditions: [] })
  assert.deepEqual(parseConditionsFile({ version: 'v' }), { version: 'v', conditions: [] })
})

// ── buildIndicationQuery ──────────────────────────────────────────────────────
check('buildIndicationQuery quotes multi-word phrases, passes single words bare', () => {
  assert.equal(buildIndicationQuery(['burn', 'sore throat']), 'burn "sore throat"')
})

check('buildIndicationQuery de-dupes and drops empties', () => {
  assert.equal(buildIndicationQuery(['burn', 'BURN', '', '  ', 'scald']), 'burn scald')
})

check('buildIndicationQuery strips embedded quotes', () => {
  assert.equal(buildIndicationQuery(['sore "throat"']), '"sore throat"')
})

check('buildIndicationQuery returns empty string for all-empty input', () => {
  assert.equal(buildIndicationQuery([]), '')
  assert.equal(buildIndicationQuery(['', '   ']), '')
})

// ── product-type constants drift-guard ───────────────────────────────────────
check('helper OTC/RX constants match canonical PRODUCT_TYPES', () => {
  assert.equal(OTC_PRODUCT_TYPE, PRODUCT_TYPES.OTC)
  assert.equal(RX_PRODUCT_TYPE, PRODUCT_TYPES.RX)
})

// ── orderOtcFirst ─────────────────────────────────────────────────────────────
check('orderOtcFirst buckets OTC → other → Rx, preserving relevance order', () => {
  const input = [
    makeDrug(1, PRODUCT_TYPES.RX),
    makeDrug(2, PRODUCT_TYPES.OTC),
    makeDrug(3, null),
    makeDrug(4, PRODUCT_TYPES.OTC),
    makeDrug(5, PRODUCT_TYPES.RX),
  ]
  const out = orderOtcFirst(input)
  assert.deepEqual(
    out.map((d) => d.id),
    [2, 4, 3, 1, 5]
  )
})

check('orderOtcFirst does not mutate the input array', () => {
  const input = [makeDrug(1, PRODUCT_TYPES.RX), makeDrug(2, PRODUCT_TYPES.OTC)]
  const snapshot = input.map((d) => d.id)
  orderOtcFirst(input)
  assert.deepEqual(
    input.map((d) => d.id),
    snapshot
  )
})

// ── findConditionBySlug / toConditionSummary ─────────────────────────────────
check('findConditionBySlug returns the matching condition or null', () => {
  const conditions = parseConditionsFile({
    version: 'v',
    conditions: [{ slug: 'fever', label: 'Fever', category: 'C', searchTerms: ['fever'] }],
  }).conditions
  assert.equal(findConditionBySlug(conditions, 'fever')!.label, 'Fever')
  assert.equal(findConditionBySlug(conditions, 'nope'), null)
  assert.equal(findConditionBySlug(conditions, ''), null)
})

check('toConditionSummary strips searchTerms', () => {
  const summary = toConditionSummary({
    slug: 'fever',
    label: 'Fever',
    category: 'Pain',
    searchTerms: ['fever', 'reduces fever'],
  })
  assert.deepEqual(summary, { slug: 'fever', label: 'Fever', category: 'Pain' })
  assert.equal('searchTerms' in summary, false)
})

// ── situationsForIndications (reverse link) ───────────────────────────────────
const sampleConditions = parseConditionsFile({
  version: 'v',
  conditions: [
    { slug: 'fever', label: 'Fever', category: 'Pain', searchTerms: ['fever', 'reduces fever'] },
    { slug: 'pain', label: 'Pain', category: 'Pain', searchTerms: ['pain', 'minor aches'] },
    { slug: 'cough', label: 'Cough', category: 'Cold', searchTerms: ['cough', 'cough suppressant'] },
    {
      slug: 'sore-throat',
      label: 'Sore throat',
      category: 'Cold',
      searchTerms: ['sore throat', 'throat pain'],
    },
  ],
}).conditions

check('situationsForIndications matches a single-word term, case-insensitively', () => {
  const out = situationsForIndications('Temporarily reduces FEVER and relieves minor aches', sampleConditions)
  assert.deepEqual(
    out.map((c) => c.slug),
    ['fever', 'pain']
  )
})

check('situationsForIndications matches a multi-word phrase term', () => {
  const out = situationsForIndications('For the temporary relief of sore throat', sampleConditions)
  assert.deepEqual(
    out.map((c) => c.slug),
    ['sore-throat']
  )
})

check('situationsForIndications preserves curated order, not text order', () => {
  // text mentions cough first, then fever, but curated order is fever before cough
  const out = situationsForIndications('Controls cough; also reduces fever', sampleConditions)
  assert.deepEqual(
    out.map((c) => c.slug),
    ['fever', 'cough']
  )
})

check('situationsForIndications returns summaries (no searchTerms leak)', () => {
  const out = situationsForIndications('pain', sampleConditions)
  assert.equal(out.length, 1)
  assert.equal('searchTerms' in out[0], false)
  assert.deepEqual(out[0], { slug: 'pain', label: 'Pain', category: 'Pain' })
})

check('situationsForIndications returns [] for blank/empty/null input', () => {
  assert.deepEqual(situationsForIndications('', sampleConditions), [])
  assert.deepEqual(situationsForIndications('   ', sampleConditions), [])
  assert.deepEqual(situationsForIndications(null, sampleConditions), [])
  assert.deepEqual(situationsForIndications(undefined, sampleConditions), [])
})

check('situationsForIndications returns [] when nothing matches', () => {
  assert.deepEqual(situationsForIndications('antiseptic for minor cuts', sampleConditions), [])
})

check('situationsForIndications dedupes by slug (one hit per condition)', () => {
  // both "pain" and "minor aches" appear; pain must surface exactly once
  const out = situationsForIndications('relieves minor aches and pain', sampleConditions)
  assert.equal(out.filter((c) => c.slug === 'pain').length, 1)
})

// ── shipped spine smoke check ─────────────────────────────────────────────────
check('shipped CONDITIONS_FILE parses cleanly with no dropped entries', () => {
  const parsed = parseConditionsFile(CONDITIONS_FILE)
  assert.equal(parsed.conditions.length, CONDITIONS_FILE.conditions.length)
})

check('shipped spine holds 30–50 curated conditions (spec range)', () => {
  const n = CONDITIONS_FILE.conditions.length
  assert.ok(n >= 30 && n <= 50, `expected 30–50 conditions, got ${n}`)
})

check('shipped spine has unique slugs and non-empty searchTerms', () => {
  const slugs = new Set<string>()
  for (const c of CONDITIONS_FILE.conditions) {
    assert.ok(!slugs.has(c.slug), `duplicate slug: ${c.slug}`)
    slugs.add(c.slug)
    assert.ok(c.searchTerms.length > 0, `empty searchTerms: ${c.slug}`)
    assert.ok(buildIndicationQuery(c.searchTerms).length > 0, `empty query: ${c.slug}`)
  }
})

console.log(`\n${passed} checks passed`)
