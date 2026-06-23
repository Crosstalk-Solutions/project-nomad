import { test } from '@japa/runner'
import { parseInteractions, isSectionHeader, type InteractionBlock } from '../../util/drug_interactions.js'

// Representative real FDA `drug_interactions` text, two formats:
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

// Word sequence with bullet markers and whitespace normalized away — used to
// prove the parser never alters or drops FDA wording, only restructures it.
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

test.group('parseInteractions — content fidelity (safety)', () => {
  test('preserves every word of numbered (MAXALT) text', ({ assert }) => {
    assert.deepEqual(words(reconstruct(parseInteractions(MAXALT))), words(MAXALT))
  })

  test('preserves every word of bulleted (ADVAIR) text', ({ assert }) => {
    assert.deepEqual(words(reconstruct(parseInteractions(ADVAIR))), words(ADVAIR))
  })
})

test.group('parseInteractions — structure', () => {
  test('splits numbered text into labeled subsections', ({ assert }) => {
    const labels = parseInteractions(MAXALT)
      .map((b) => b.label)
      .filter((l): l is string => l !== null)
    assert.deepEqual(labels, ['7.1', '7.2', '7.3', '7.5'])
  })

  test('does not split on parenthetical cross-references', ({ assert }) => {
    // "(2.4)", "(12.3)", "(4)" must not become subsections.
    const labels = parseInteractions(MAXALT).map((b) => b.label)
    assert.notInclude(labels, '2.4')
    assert.notInclude(labels, '12.3')
  })

  test('renders bulleted text as a bullet block', ({ assert }) => {
    const blocks = parseInteractions(ADVAIR)
    const bulletBlock = blocks.find((b) => b.bullets !== null)
    assert.isNotNull(bulletBlock)
    assert.isAbove(bulletBlock!.bullets!.length, 2)
    // The real "7.1 Inhibitors..." subsection is still detected.
    assert.include(blocks.map((b) => b.label), '7.1')
  })

  test('separates the section header from the body', ({ assert }) => {
    const first = parseInteractions(MAXALT)[0]
    assert.isTrue(isSectionHeader(first.text))
  })

  test('empty or null input yields no blocks', ({ assert }) => {
    assert.deepEqual(parseInteractions(null), [])
    assert.deepEqual(parseInteractions(''), [])
    assert.deepEqual(parseInteractions('   '), [])
  })
})
