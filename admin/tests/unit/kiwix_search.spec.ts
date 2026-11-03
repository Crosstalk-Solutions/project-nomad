import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_SEARCH_URL_LENGTH,
  buildKiwixMultiBookSearchUrl,
  groupSearchableBooksByLanguage,
  kiwixBookNameFromPath,
  parseBookLanguages,
  pickDefaultSearchLanguage,
  type SearchableBook,
} from '../../app/utils/kiwix_search.js'

const BASE = 'http://nomad.local:8090'

function book(name: string, language: string | null, articleCount?: number): SearchableBook {
  return { name, title: name, language, articleCount }
}

// --- kiwixBookNameFromPath: must match libkiwix getHumanReadableIdFromPath ---

test('book name is the ZIM basename without extension, date kept', () => {
  assert.equal(
    kiwixBookNameFromPath('/data/wikipedia_en_all_maxi_2024-01.zim'),
    'wikipedia_en_all_maxi_2024-01'
  )
})

test('book name is lowercased, unaccented, spaces to _ and + to plus', () => {
  assert.equal(kiwixBookNameFromPath('/data/Café Notes+Extra.zim'), 'cafe_notesplusextra')
})

test('book name drops split-archive extensions like .zimaa', () => {
  assert.equal(kiwixBookNameFromPath('/data/big_book_2025-01.zimaa'), 'big_book_2025-01')
})

// --- parseBookLanguages ---

test('parses single, multi and missing language attributes', () => {
  assert.deepEqual(parseBookLanguages('eng'), ['eng'])
  assert.deepEqual(parseBookLanguages('eng, fra,,deu'), ['eng', 'fra', 'deu'])
  assert.deepEqual(parseBookLanguages(''), [])
  assert.deepEqual(parseBookLanguages(null), [])
  assert.deepEqual(parseBookLanguages(undefined), [])
})

// --- groupSearchableBooksByLanguage ---

test('groups by language, dominant language first, largest books first', () => {
  const groups = groupSearchableBooksByLanguage([
    book('gardening_en', 'eng', 100),
    book('wikipedia_fr', 'fra', 5_000_000),
    book('wikipedia_en', 'eng', 6_000_000),
    book('appropedia_en', 'eng', 2_000),
  ])
  assert.deepEqual(groups, [
    { language: 'eng', bookNames: ['wikipedia_en', 'appropedia_en', 'gardening_en'] },
    { language: 'fra', bookNames: ['wikipedia_fr'] },
  ])
})

test('leaves out multi-language and language-less books (confusion-of-tongues)', () => {
  const groups = groupSearchableBooksByLanguage([
    book('ted_mul_a', 'eng,fra,spa'),
    book('no_lang', null),
    book('empty_lang', ''),
    book('wikibooks_en', 'eng'),
  ])
  assert.deepEqual(groups, [{ language: 'eng', bookNames: ['wikibooks_en'] }])
})

test('de-duplicates names and skips nameless books', () => {
  const groups = groupSearchableBooksByLanguage([
    book('dup', 'eng'),
    book('dup', 'eng'),
    book('', 'eng'),
  ])
  assert.deepEqual(groups, [{ language: 'eng', bookNames: ['dup'] }])
})

test('empty library gives no groups', () => {
  assert.deepEqual(groupSearchableBooksByLanguage([]), [])
})

// --- pickDefaultSearchLanguage ---

const GROUPS = [
  { language: 'eng', bookNames: ['a', 'b'] },
  { language: 'fra', bookNames: ['c'] },
]

test('defaults to the viewer language when installed, matching 2- and 3-letter codes', () => {
  assert.equal(pickDefaultSearchLanguage(GROUPS, ['fr-CA', 'en-US']), 'fra')
})

test('falls back to the dominant language', () => {
  assert.equal(pickDefaultSearchLanguage(GROUPS, ['de-DE']), 'eng')
  assert.equal(pickDefaultSearchLanguage(GROUPS), 'eng')
  assert.equal(pickDefaultSearchLanguage(GROUPS, ['not a locale!']), 'eng')
})

test('no groups means no default', () => {
  assert.equal(pickDefaultSearchLanguage([], ['en-US']), null)
})

// --- buildKiwixMultiBookSearchUrl ---

test('names every book and the pattern', () => {
  const result = buildKiwixMultiBookSearchUrl({
    baseUrl: BASE,
    bookNames: ['wikipedia_en_all_maxi_2024-01', 'gardening_en'],
    pattern: 'carrot',
  })
  assert.deepEqual(result, {
    url: `${BASE}/search?books.name=wikipedia_en_all_maxi_2024-01&books.name=gardening_en&pattern=carrot`,
    includedCount: 2,
    omittedCount: 0,
  })
})

test('encodes the pattern and trims it', () => {
  const result = buildKiwixMultiBookSearchUrl({
    baseUrl: BASE,
    bookNames: ['a'],
    pattern: '  tomato blight & "carrot fly"?#  ',
  })
  assert.equal(
    result?.url,
    `${BASE}/search?books.name=a&pattern=tomato%20blight%20%26%20%22carrot%20fly%22%3F%23`
  )
})

test('encodes book names', () => {
  const result = buildKiwixMultiBookSearchUrl({ baseUrl: BASE, bookNames: ['a&b=c'], pattern: 'x' })
  assert.equal(result?.url, `${BASE}/search?books.name=a%26b%3Dc&pattern=x`)
})

test('works under a custom URL with a path and trailing slash', () => {
  const result = buildKiwixMultiBookSearchUrl({
    baseUrl: 'https://kiwix.example.lan/library/',
    bookNames: ['a'],
    pattern: 'x',
  })
  assert.equal(result?.url, 'https://kiwix.example.lan/library/search?books.name=a&pattern=x')
})

test('returns null for a blank pattern or no books', () => {
  assert.equal(buildKiwixMultiBookSearchUrl({ baseUrl: BASE, bookNames: ['a'], pattern: '' }), null)
  assert.equal(
    buildKiwixMultiBookSearchUrl({ baseUrl: BASE, bookNames: ['a'], pattern: '   ' }),
    null
  )
  assert.equal(buildKiwixMultiBookSearchUrl({ baseUrl: BASE, bookNames: [], pattern: 'x' }), null)
})

test('de-duplicates book names', () => {
  const result = buildKiwixMultiBookSearchUrl({
    baseUrl: BASE,
    bookNames: ['a', 'a'],
    pattern: 'x',
  })
  assert.equal(result?.url, `${BASE}/search?books.name=a&pattern=x`)
  assert.equal(result?.includedCount, 1)
})

test('keeps the URL within the length limit, dropping the trailing (smallest) books', () => {
  const names = Array.from({ length: 400 }, (_, i) => `book_number_${i}_en_all_maxi_2025-01`)
  const result = buildKiwixMultiBookSearchUrl({
    baseUrl: BASE,
    bookNames: names,
    pattern: 'carrot',
  })
  assert.ok(result)
  assert.ok(result.url.length <= MAX_SEARCH_URL_LENGTH)
  assert.ok(result.includedCount > 0 && result.includedCount < names.length)
  assert.equal(result.includedCount + result.omittedCount, names.length)
  // Order is preserved, so the first (largest) books are the ones kept.
  assert.ok(result.url.includes('books.name=book_number_0_en_all_maxi_2025-01&'))
  assert.ok(!result.url.includes(`books.name=${names[names.length - 1]}&`))
})

test('72 typical English books fit comfortably (the #1519 measurement)', () => {
  const names = Array.from({ length: 72 }, (_, i) => `some_book_en_all_maxi_${i}_2025-01`)
  const result = buildKiwixMultiBookSearchUrl({
    baseUrl: BASE,
    bookNames: names,
    pattern: 'carrot',
  })
  assert.equal(result?.includedCount, 72)
  assert.equal(result?.omittedCount, 0)
})

test('returns null when not even one book fits the limit', () => {
  assert.equal(
    buildKiwixMultiBookSearchUrl({
      baseUrl: BASE,
      bookNames: ['a'],
      pattern: 'x',
      maxUrlLength: 10,
    }),
    null
  )
})
