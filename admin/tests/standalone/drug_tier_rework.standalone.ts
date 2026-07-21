/**
 * Standalone gate test for the tier-rework pure helpers added in the
 * drug-reference opt-in-tier rework (PR #1040 follow-up):
 *   - manifestBytesTotal  (Active Downloads card totalBytes)
 *   - isExportDateNewer   (drug auto-update freshness compare)
 *
 * Japa can't boot locally without MySQL/Redis, so these exercise the pure
 * helpers directly under `node --experimental-strip-types`. Run:
 *   node --experimental-strip-types tests/standalone/drug_tier_rework.standalone.ts
 */
import assert from 'node:assert/strict'
import { manifestBytesTotal, isExportDateNewer } from '../../util/drug_labels.ts'
import type { DrugLabelManifest } from '../../types/drug_reference.ts'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ok - ${name}`)
}

const MB = 1024 * 1024

function manifest(sizes: string[]): DrugLabelManifest {
  return {
    export_date: '2025-01-01',
    total_records: 1000,
    partitions: sizes.map((s, i) => ({
      display_name: `part ${i + 1}`,
      file: `https://download.open.fda.gov/drug/label/p-${i}.json.zip`,
      size_mb: s,
      records: 100,
    })),
  }
}

// ── manifestBytesTotal ────────────────────────────────────────────────────────
check('manifestBytesTotal sums partition MB into bytes', () =>
  assert.equal(manifestBytesTotal(manifest(['100', '200', '50'])), 350 * MB))
check('manifestBytesTotal treats a non-numeric size as 0 (no NaN)', () =>
  assert.equal(manifestBytesTotal(manifest(['100', 'oops', '50'])), 150 * MB))
check('manifestBytesTotal treats a negative/zero size as 0', () =>
  assert.equal(manifestBytesTotal(manifest(['100', '0', '-5'])), 100 * MB))
check('manifestBytesTotal of an empty partition list is 0', () =>
  assert.equal(manifestBytesTotal(manifest([])), 0))

// ── isExportDateNewer ─────────────────────────────────────────────────────────
// No baseline → any valid candidate is "newer" (first install with no marker).
check('isExportDateNewer: empty baseline is always newer', () =>
  assert.equal(isExportDateNewer('2025-06-01', null), true))
check('isExportDateNewer: empty-string baseline is always newer', () =>
  assert.equal(isExportDateNewer('2025-06-01', ''), true))
// Empty candidate → nothing to update to.
check('isExportDateNewer: empty candidate is never newer', () =>
  assert.equal(isExportDateNewer('', '2025-06-01'), false))
// Identical → already current.
check('isExportDateNewer: identical dates are not newer', () =>
  assert.equal(isExportDateNewer('2025-06-01', '2025-06-01'), false))
// ISO YYYY-MM-DD — both Date.parse paths and lexicographic agree.
check('isExportDateNewer: ISO later date is newer', () =>
  assert.equal(isExportDateNewer('2025-06-02', '2025-06-01'), true))
check('isExportDateNewer: ISO earlier date is not newer', () =>
  assert.equal(isExportDateNewer('2025-05-31', '2025-06-01'), false))
// Cross-month / cross-year ISO ordering.
check('isExportDateNewer: ISO across year boundary', () =>
  assert.equal(isExportDateNewer('2026-01-01', '2025-12-31'), true))
// US M/D/YYYY format — Date.parse handles this; a naive lexicographic compare
// would get it WRONG ('1/2/2026' < '12/31/2025' lexically). This proves the
// Date.parse-first path is doing the work.
check('isExportDateNewer: US-format newer date (Date.parse path)', () =>
  assert.equal(isExportDateNewer('1/2/2026', '12/31/2025'), true))
check('isExportDateNewer: US-format older date (Date.parse path)', () =>
  assert.equal(isExportDateNewer('12/30/2025', '12/31/2025'), false))
// Zero-padded compact YYYYMMDD — Date.parse rejects it, lexicographic fallback
// is correct for this zero-padded ordered form.
check('isExportDateNewer: compact YYYYMMDD newer (lexicographic fallback)', () =>
  assert.equal(isExportDateNewer('20260102', '20251231'), true))
check('isExportDateNewer: compact YYYYMMDD older (lexicographic fallback)', () =>
  assert.equal(isExportDateNewer('20251230', '20251231'), false))

console.log(`\nAll ${passed} standalone assertions passed.`)
