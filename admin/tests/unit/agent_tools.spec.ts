import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { articleToText, normalizeArticlePath, parseSearchXml } from '../../app/agent/kiwix.js'

test('parseSearchXml extracts hits and drops non-article links', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Water purification</title><link>/content/wikipedia_en_all_mini_2026-06/Water_purification</link>
      <description>Boil &lt;b&gt;water&lt;/b&gt; for one minute</description><book><title>Wikipedia</title></book></item>
    <item><title>junk</title><link>/search?x</link><description>x</description><book><title>W</title></book></item>
  </channel></rss>`
  const hits = parseSearchXml(xml)
  assert.equal(hits.length, 1)
  assert.equal(hits[0].book, 'Wikipedia')
  assert.equal(hits[0].snippet, 'Boil water for one minute')
  assert.ok(hits[0].url.endsWith('/content/wikipedia_en_all_mini_2026-06/Water_purification'))
})

test('normalizeArticlePath accepts paths, bare names and full URLs', () => {
  assert.equal(normalizeArticlePath('http://localhost:8090/content/a/B#x'), '/content/a/B')
  assert.equal(normalizeArticlePath('/content/a/B'), '/content/a/B')
  assert.equal(normalizeArticlePath('a/B'), '/content/a/B')
})

test('articleToText keeps headings, list items and table rows', () => {
  const html = `<html><head><title>Boiling</title></head><body>
    <h2>Method</h2><p>Bring to a rolling boil.</p><ul><li>One minute</li></ul>
    <table><tr><th>Altitude</th><th>Time</th></tr><tr><td>&gt;2000 m</td><td>3 min</td></tr></table>
    <script>x()</script></body></html>`
  const { title, text } = articleToText(html)
  assert.equal(title, 'Boiling')
  assert.match(text, /## Method/)
  assert.match(text, /- One minute/)
  assert.match(text, /Altitude \| Time/)
  assert.doesNotMatch(text, /x\(\)/)
})
