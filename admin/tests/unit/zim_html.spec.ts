import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  extractStructuredContent,
  isNonContentHeading,
  tableToText,
} from '../../app/utils/zim_html.js'
import * as cheerio from 'cheerio'

test('isNonContentHeading flags boilerplate headings, case-insensitive', () => {
  assert.equal(isNonContentHeading('References'), true)
  assert.equal(isNonContentHeading('see also'), true)
  assert.equal(isNonContentHeading('EXTERNAL LINKS'), true)
  assert.equal(isNonContentHeading('Further reading'), true)
})

test('isNonContentHeading keeps real content headings', () => {
  assert.equal(isNonContentHeading('Uses'), false)
  assert.equal(isNonContentHeading('Side effects'), false)
  assert.equal(isNonContentHeading('History'), false)
})

test('extractStructuredContent drops non-content sections at emit time (#902)', () => {
  const html = `<body>
        <h1>Aspirin</h1>
        <p>Aspirin is a medication used to reduce pain and fever.</p>
        <h2>Uses</h2>
        <p>It is used to treat fever, pain, and inflammation.</p>
        <h2>References</h2>
        <ul><li>Smith 2020</li><li>Jones 2019</li></ul>
        <h2>See also</h2>
        <p>Ibuprofen, Paracetamol</p>
        <h2>External links</h2>
        <p>https://example.com/aspirin</p>
    </body>`

  const { sections } = extractStructuredContent(html)
  const headings = sections.map((s) => s.heading)

  assert.deepEqual(headings, ['Introduction', 'Uses'])
  assert.equal(
    sections.some((s) => /Smith 2020|Ibuprofen|example\.com/.test(s.text)),
    false,
    'boilerplate-section content must not reach any emitted chunk'
  )
})

test('extractStructuredContent keeps real sections including their content', () => {
  const html = `<body>
        <h1>Aspirin</h1>
        <p>Intro text here.</p>
        <h2>Side effects</h2>
        <p>May cause stomach upset.</p>
    </body>`

  const { sections } = extractStructuredContent(html)
  const sideEffects = sections.find((s) => s.heading === 'Side effects')

  assert.ok(sideEffects, 'real content section should be emitted')
  assert.match(sideEffects.text, /stomach upset/)
})

test('tableToText renders rows as delimited text, not concatenated cell soup (#902)', () => {
  const html = `<table>
        <tr><th>Age</th><th>Dose</th></tr>
        <tr><td>Adult</td><td>500 mg</td></tr>
        <tr><td>Child</td><td>250 mg</td></tr>
    </table>`
  const $ = cheerio.load(html)
  const out = tableToText($, $('table').get(0))

  assert.match(out, /Age \| Dose/)
  assert.match(out, /Adult \| 500 mg/)
  assert.match(out, /Child \| 250 mg/)
  assert.ok(out.includes('\n'), 'rows should be newline-separated')
  assert.equal(
    /AgeDose|Adult500/.test(out),
    false,
    'cells must not be concatenated without separators'
  )
})

test('extractStructuredContent keeps table structure inside a content section', () => {
  const html = `<body>
        <h2>Dosage</h2>
        <table>
            <tr><th>Age</th><th>Dose</th></tr>
            <tr><td>Adult</td><td>500 mg</td></tr>
        </table>
    </body>`

  const { sections } = extractStructuredContent(html)
  const dosage = sections.find((s) => s.heading === 'Dosage')

  assert.ok(dosage, 'section with a table should be emitted')
  assert.match(dosage.text, /Age \| Dose/)
  assert.match(dosage.text, /Adult \| 500 mg/)
})
