import * as assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'

import Markdoc from '@markdoc/markdoc'

import { blockingFindings, markdocConfig } from '../../app/utils/docs_markdoc.js'

function findings(content: string) {
  return blockingFindings(Markdoc.validate(Markdoc.parse(content), markdocConfig))
}

test('a bold span hard-wrapped across lines does not block rendering (#1427)', () => {
  const wrapped = '**8GB is workable for a small\nmodel, 16GB is comfortable.**\n'
  assert.ok(Markdoc.validate(Markdoc.parse(wrapped), markdocConfig).length > 0)
  assert.deepEqual(findings(wrapped), [])
})

test('an unknown tag still blocks rendering', () => {
  assert.equal(findings('{% nope %}\ntext\n{% /nope %}\n').length, 1)
})

const docsDir = new URL('../../docs/', import.meta.url)
const entries = await readdir(docsDir)
const docs = entries.filter((name) => name.endsWith('.md'))

for (const name of docs) {
  test(`docs/${name} passes DocsService validation`, async () => {
    const content = await readFile(new URL(name, docsDir), 'utf8')
    assert.deepEqual(
      findings(content).map((f) => `line ${f.lines[0] + 1}: ${f.error.message}`),
      []
    )
  })
}
