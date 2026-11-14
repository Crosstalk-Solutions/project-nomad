import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { pagePassages } from '../../app/utils/pdf_passages.js'

test('short pages are joined into one passage labelled with its page range (#1445)', () => {
  assert.deepEqual(pagePassages(['Tie a bowline.', 'Then a clove hitch.', 'Last, a sheet bend.']), [
    { label: 'pages 1-3', text: 'Tie a bowline.\nThen a clove hitch.\nLast, a sheet bend.' },
  ])
})

test('a new passage starts once the current one reaches the size', () => {
  const long = 'x'.repeat(40)
  assert.deepEqual(
    pagePassages([long, long, 'short', long], 50).map((p) => p.label),
    ['pages 1-2', 'pages 3-4']
  )
  assert.deepEqual(
    pagePassages([long, 'y'.repeat(60)], 30).map((p) => p.label),
    ['page 1', 'page 2']
  )
})

test('pages without text add no passage of their own', () => {
  assert.deepEqual(pagePassages(['', '  \n', ''], 1), [])
  assert.deepEqual(pagePassages(['', 'Splint the arm.'], 1), [
    { label: 'page 2', text: 'Splint the arm.' },
  ])
})
