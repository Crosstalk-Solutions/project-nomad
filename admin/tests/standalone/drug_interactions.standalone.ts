/**
 * Standalone gate test for the drug-interaction parser.
 *
 * Japa cannot boot locally without MySQL/Redis, so this file exercises the pure
 * parser directly under `node --experimental-strip-types`. It mirrors the Japa
 * spec at tests/unit/drug_interactions.spec.ts. Run:
 *   node --experimental-strip-types tests/standalone/drug_interactions.standalone.ts
 */
import assert from 'node:assert/strict'
import {
  parseInteractions,
  parseLabelSection,
  isSectionHeader,
  isLabelSectionHeader,
  type InteractionBlock,
} from '../../util/drug_interactions.ts'

const MAXALT =
  '7 DRUG INTERACTIONS 7.1 Propranolol The dose of MAXALT should be adjusted in ' +
  'propranolol-treated patients, as propranolol has been shown to increase the plasma ' +
  'AUC of rizatriptan by 70% [see Dosage and Administration (2.4) and Clinical Pharmacology (12.3)] . ' +
  '7.2 Ergot-Containing Drugs Ergot-containing drugs have been reported to cause prolonged ' +
  'vasospastic reactions. 7.3 Other 5-HT 1 Agonists Because their vasospastic effects may be ' +
  'additive, co-administration of MAXALT and other 5-HT 1 agonists within 24 hours of each other ' +
  'is contraindicated [see Contraindications (4)] . 7.5 Monoamine Oxidase Inhibitors MAXALT is ' +
  'contraindicated in patients taking MAO-A inhibitors and non-selective MAO inhibitors.'

const ADVAIR =
  '7 DRUG INTERACTIONS ADVAIR DISKUS has been used concomitantly with other drugs without ' +
  'adverse drug reactions [see Clinical Pharmacology ( 12.2 )] . No formal drug interaction trials ' +
  'have been performed with ADVAIR DISKUS . • Strong cytochrome P450 3A4 inhibitors (e.g., ritonavir, ' +
  'ketoconazole): Use not recommended. ( 7.1 ) • Monoamine oxidase inhibitors and tricyclic ' +
  'antidepressants: Use with extreme caution. ( 7.2 ) • Beta-blockers: Use with caution. ( 7.3 ) ' +
  '7.1 Inhibitors of Cytochrome P450 3A4 Fluticasone propionate and salmeterol are substrates of CYP3A4.'

// Other FDA label sections — the generalized parser must read each section's own
// number (2 for dosage, 5 for warnings) and never split on cross-refs to others.
const DOSAGE =
  '2 DOSAGE AND ADMINISTRATION 2.1 Recommended Dosage The recommended dosage is 10 mg ' +
  'orally once daily [see Clinical Pharmacology (12.3)] . 2.2 Dose Adjustment in Renal ' +
  'Impairment Reduce the dose to 5 mg in patients with severe renal impairment. 2.3 ' +
  'Administration Swallow tablets whole; do not crush.'

const WARNINGS =
  '5 WARNINGS AND PRECAUTIONS 5.1 Hypersensitivity Reactions Anaphylaxis has been reported. ' +
  'Discontinue if a reaction occurs. 5.2 Hepatotoxicity Monitor liver enzymes. 5.3 Embryo-Fetal ' +
  'Toxicity Can cause fetal harm [see Use in Specific Populations (8.1)] .'

// Subsections present but no leading "N SECTION NAME" header line.
const NO_HEADER = '3.1 Tablets 10 mg, white, round. 3.2 Oral Solution 5 mg/5 mL, clear.'

const PLAIN = 'There are no known contraindications for this product.'

function words(s: string): string[] {
  return s.replace(/•/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
}

function reconstruct(blocks: InteractionBlock[]): string {
  return blocks
    .map((b) => {
      const parts: string[] = []
      if (b.label) parts.push(b.label)
      if (b.text) parts.push(b.text)
      if (b.bullets) parts.push(b.bullets.join(' '))
      return parts.join(' ')
    })
    .join(' ')
}

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ok - ${name}`)
}

// ── content fidelity (safety) ─────────────────────────────────────────────────
check('preserves every word of numbered (MAXALT) text', () => {
  assert.deepEqual(words(reconstruct(parseInteractions(MAXALT))), words(MAXALT))
})
check('preserves every word of bulleted (ADVAIR) text', () => {
  assert.deepEqual(words(reconstruct(parseInteractions(ADVAIR))), words(ADVAIR))
})

// ── structure ─────────────────────────────────────────────────────────────────
check('splits numbered text into labeled subsections', () => {
  const labels = parseInteractions(MAXALT)
    .map((b) => b.label)
    .filter((l): l is string => l !== null)
  assert.deepEqual(labels, ['7.1', '7.2', '7.3', '7.5'])
})
check('does not split on parenthetical cross-references', () => {
  const labels = parseInteractions(MAXALT).map((b) => b.label)
  assert.ok(!labels.includes('2.4'))
  assert.ok(!labels.includes('12.3'))
})
check('renders bulleted text as a bullet block', () => {
  const blocks = parseInteractions(ADVAIR)
  const bulletBlock = blocks.find((b) => b.bullets !== null)
  assert.ok(bulletBlock, 'expected a bullet block')
  assert.ok(bulletBlock!.bullets!.length > 2)
  assert.ok(blocks.map((b) => b.label).includes('7.1'))
})
check('separates the section header from the body', () => {
  assert.ok(isSectionHeader(parseInteractions(MAXALT)[0].text))
})
check('empty or null input yields no blocks', () => {
  assert.deepEqual(parseInteractions(null), [])
  assert.deepEqual(parseInteractions(''), [])
  assert.deepEqual(parseInteractions('   '), [])
})

// ── generalized to all FDA label sections ─────────────────────────────────────
check('preserves every word of a dosage section', () => {
  assert.deepEqual(words(reconstruct(parseLabelSection(DOSAGE))), words(DOSAGE))
})
check('splits a dosage section on its own (2.x) numbers, not cross-refs', () => {
  const labels = parseLabelSection(DOSAGE)
    .map((b) => b.label)
    .filter((l): l is string => l !== null)
  assert.deepEqual(labels, ['2.1', '2.2', '2.3'])
})
check('preserves every word of a warnings section', () => {
  assert.deepEqual(words(reconstruct(parseLabelSection(WARNINGS))), words(WARNINGS))
})
check('warnings keeps its (5.x) numbers and ignores the (8.1) cross-ref', () => {
  const labels = parseLabelSection(WARNINGS).map((b) => b.label)
  assert.deepEqual(
    labels.filter((l): l is string => l !== null),
    ['5.1', '5.2', '5.3']
  )
  assert.ok(!labels.includes('8.1'))
})
check('falls back to the dominant subsection number with no leading header', () => {
  const labels = parseLabelSection(NO_HEADER)
    .map((b) => b.label)
    .filter((l): l is string => l !== null)
  assert.deepEqual(labels, ['3.1', '3.2'])
  assert.deepEqual(words(reconstruct(parseLabelSection(NO_HEADER))), words(NO_HEADER))
})
check('plain text with no structure is one preserved block', () => {
  const blocks = parseLabelSection(PLAIN)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].text, PLAIN)
})
check('isLabelSectionHeader matches numbered all-caps headers only', () => {
  assert.ok(isLabelSectionHeader('2 DOSAGE AND ADMINISTRATION'))
  assert.ok(isLabelSectionHeader('5 WARNINGS'))
  assert.ok(!isLabelSectionHeader('DO NOT EXCEED 4 DOSES'))
  assert.ok(!isLabelSectionHeader('2.1 Recommended Dosage'))
})

console.log(`\n${passed} checks passed`)
