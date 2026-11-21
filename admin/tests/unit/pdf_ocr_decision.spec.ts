import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  decidePdfOcr,
  pageNeedsOcr,
  PDF_PAGE_MIN_TEXT_CHARS,
} from '../../app/utils/pdf_ocr_decision.js'

test('a scanned PDF with no text layer needs OCR on every page (#1457)', () => {
  // pdf-parse returns an empty string per page for a pure scan; the old
  // whole-document gate saw only its own page separators and never fired.
  const pages = Array.from({ length: 13 }, () => '')
  const plan = decidePdfOcr(pages)
  assert.deepEqual(plan.ocrPages, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
  assert.equal(plan.textPages, 0)
})

test('a text PDF needs no OCR', () => {
  const pages = [
    'EMERGENCY CHILDBIRTH. A reference guide for students of the medical self-help training course.',
    'We wish to acknowledge with grateful appreciation the many services provided by the AMA.',
  ]
  const plan = decidePdfOcr(pages)
  assert.deepEqual(plan.ocrPages, [])
  assert.equal(plan.textPages, 2)
})

test("a mixed PDF is OCR'd only on the pages without text", () => {
  const pages = [
    'Chapter 1. Bandaging and splinting of the upper extremity, with figures.',
    '',
    '\n \t',
    'x',
    'Page four has a full paragraph of extracted text layer content here.',
  ]
  const plan = decidePdfOcr(pages)
  assert.deepEqual(plan.ocrPages, [2, 3, 4])
  assert.equal(plan.textPages, 2)
})

test('pageNeedsOcr ignores whitespace and uses the documented threshold', () => {
  assert.equal(pageNeedsOcr('   \n\n  '), true)
  assert.equal(pageNeedsOcr('a'.repeat(PDF_PAGE_MIN_TEXT_CHARS - 1)), true)
  assert.equal(pageNeedsOcr('a'.repeat(PDF_PAGE_MIN_TEXT_CHARS)), false)
  assert.equal(pageNeedsOcr(' a '.repeat(PDF_PAGE_MIN_TEXT_CHARS)), false)
})
