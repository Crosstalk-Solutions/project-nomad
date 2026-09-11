import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import vine from '@vinejs/vine'

import {
  filterWikipediaOptions,
  isSupportedContentLanguage,
  manifestCacheKey,
  manifestUrlFor,
  mergeWikipediaOptions,
  mergeZimCategorySpecs,
  namespaceForLanguage,
  parseContentLanguages,
  toKiwixLangParam,
  validateContentLanguagesValue,
} from '../../app/utils/content_languages.js'
import { validateSettingValue } from '../../app/validators/settings.js'
import { wikipediaSpecSchema } from '../../app/validators/curated_collections.js'
import type { ZimCategoriesSpec } from '../../types/collections.js'

/**
 * The invariant that matters most: with the default setting (English only)
 * nothing observable changes. Same manifest URLs, same cache keys, same
 * category slugs, same Wikipedia options. Other languages are additive.
 */

// ---- parsing & validation of the `content.languages` setting ----

test('parseContentLanguages defaults to English when the setting is unset or unusable', () => {
  assert.deepEqual(parseContentLanguages(null), ['en'])
  assert.deepEqual(parseContentLanguages(undefined), ['en'])
  assert.deepEqual(parseContentLanguages(''), ['en'])
  assert.deepEqual(parseContentLanguages('xx, zz'), ['en'])
})

test('parseContentLanguages keeps order, trims, lowercases, drops unknown codes and duplicates', () => {
  assert.deepEqual(parseContentLanguages(' FR , en,fr,xx '), ['fr', 'en'])
  assert.deepEqual(parseContentLanguages('fr'), ['fr'])
})

test('validateContentLanguagesValue accepts a comma-separated list of supported codes', () => {
  assert.equal(validateContentLanguagesValue('en'), null)
  assert.equal(validateContentLanguagesValue('en,fr'), null)
  assert.equal(validateContentLanguagesValue(' fr , DE '), null)
})

test('validateContentLanguagesValue rejects empty, unknown and non-string values', () => {
  assert.match(validateContentLanguagesValue('')!, /at least one/)
  assert.match(validateContentLanguagesValue(' , ')!, /at least one/)
  assert.match(
    validateContentLanguagesValue('en,klingon')!,
    /Unsupported content language: klingon/
  )
  assert.match(validateContentLanguagesValue(['en', 'fr'])!, /comma-separated/)
  // the body parser turns an empty string into null before validation
  assert.match(validateContentLanguagesValue(null)!, /at least one/)
  assert.match(validateContentLanguagesValue(undefined)!, /at least one/)
})

test('the settings endpoint validates content.languages through the same rule', () => {
  assert.equal(validateSettingValue('content.languages', 'en,fr'), null)
  assert.ok(validateSettingValue('content.languages', 'xx'))
  assert.ok(validateSettingValue('content.languages', ''))
})

// ---- Kiwix catalog filter ----

test('toKiwixLangParam maps ISO 639-1 codes to the ISO 639-3 codes Kiwix filters on', () => {
  assert.equal(toKiwixLangParam(['en']), 'eng')
  assert.equal(toKiwixLangParam(['fr', 'en']), 'fra,eng')
  assert.equal(toKiwixLangParam([]), 'eng')
})

// ---- manifest URLs and cache keys ----

test('English manifest URLs are byte-for-byte the historical ones', () => {
  assert.equal(
    manifestUrlFor('zim_categories', 'en'),
    'https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/collections/kiwix-categories.json'
  )
  assert.equal(
    manifestUrlFor('wikipedia', 'en'),
    'https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/collections/wikipedia.json'
  )
})

test('other languages read a per-language directory that released builds never request', () => {
  assert.equal(
    manifestUrlFor('zim_categories', 'fr'),
    'https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/collections/fr/kiwix-categories.json'
  )
  assert.equal(
    manifestUrlFor('wikipedia', 'fr'),
    'https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/collections/fr/wikipedia.json'
  )
})

test('English cache keys are unchanged so no migration is needed; other languages get their own row', () => {
  assert.equal(manifestCacheKey('zim_categories', 'en'), 'zim_categories')
  assert.equal(manifestCacheKey('wikipedia', 'en'), 'wikipedia')
  assert.equal(manifestCacheKey('zim_categories', 'fr'), 'zim_categories:fr')
})

test('namespaceForLanguage leaves English ids alone and is idempotent', () => {
  assert.equal(namespaceForLanguage('medicine', 'en'), 'medicine')
  assert.equal(namespaceForLanguage('medicine', 'fr'), 'fr:medicine')
  assert.equal(namespaceForLanguage('fr:medicine', 'fr'), 'fr:medicine')
})

// ---- merging curated categories ----

function categorySpec(version: string, slugs: string[], language = 'en'): ZimCategoriesSpec {
  return {
    spec_version: version,
    categories: slugs.map((slug) => ({
      name: slug,
      slug,
      icon: 'IconBooks',
      description: `${slug} description`,
      language,
      tiers: [{ name: 'Essential', slug: 'essential', description: 'd', resources: [] }],
    })),
  }
}

test('mergeZimCategorySpecs returns the English spec untouched when English is the only language', () => {
  const english = categorySpec('2026-09-01', ['medicine', 'survival'])
  assert.equal(mergeZimCategorySpecs([{ language: 'en', spec: english }]), english)
})

test('mergeZimCategorySpecs ignores a language whose manifest does not exist yet', () => {
  const english = categorySpec('2026-09-01', ['medicine'])
  assert.equal(
    mergeZimCategorySpecs([
      { language: 'en', spec: english },
      { language: 'fr', spec: null },
    ]),
    english
  )
  assert.equal(mergeZimCategorySpecs([{ language: 'fr', spec: null }]), null)
})

test('mergeZimCategorySpecs namespaces non-English slugs and stamps each category with its language', () => {
  const merged = mergeZimCategorySpecs([
    { language: 'en', spec: categorySpec('1.0', ['medicine']) },
    // `language` in the file is overridden by the directory it was fetched from
    { language: 'fr', spec: categorySpec('1.1', ['medicine', 'fr:repair'], 'en') },
  ])!
  assert.deepEqual(
    merged.categories.map((c) => [c.slug, c.language]),
    [
      ['medicine', 'en'],
      ['fr:medicine', 'fr'],
      ['fr:repair', 'fr'],
    ]
  )
  assert.equal(merged.spec_version, 'en@1.0+fr@1.1')
})

test('mergeZimCategorySpecs offers French alone when English is deselected', () => {
  const merged = mergeZimCategorySpecs([
    { language: 'fr', spec: categorySpec('1.1', ['medicine']) },
  ])!
  assert.deepEqual(
    merged.categories.map((c) => c.slug),
    ['fr:medicine']
  )
})

// ---- Wikipedia options ----

const englishOptions = [
  { id: 'none', name: 'No Wikipedia', url: null },
  { id: 'all-mini', name: 'Mini', url: 'https://x/wikipedia_en_all_mini_2026-05.zim' },
  { id: 'all-maxi', name: 'Maxi', url: 'https://x/wikipedia_en_all_maxi_2026-05.zim' },
]
const frenchOptions = [
  { id: 'none', name: 'Pas de Wikipédia', url: null },
  {
    id: 'all-maxi',
    name: 'Wikipédia complète',
    url: 'https://x/wikipedia_fr_all_maxi_2026-05.zim',
  },
]

test('mergeWikipediaOptions with English only just tags every option as English', () => {
  const merged = mergeWikipediaOptions(englishOptions, [])
  assert.deepEqual(
    merged.map((o) => [o.id, o.language]),
    [
      ['none', 'en'],
      ['all-mini', 'en'],
      ['all-maxi', 'en'],
    ]
  )
})

test('mergeWikipediaOptions namespaces other languages and keeps a single "none" option', () => {
  const merged = mergeWikipediaOptions(englishOptions, [{ language: 'fr', options: frenchOptions }])
  assert.deepEqual(
    merged.map((o) => [o.id, o.language]),
    [
      ['none', 'en'],
      ['all-mini', 'en'],
      ['all-maxi', 'en'],
      ['fr:all-maxi', 'fr'],
    ]
  )
})

test('filterWikipediaOptions shows only the selected languages, plus "none"', () => {
  const merged = mergeWikipediaOptions(englishOptions, [{ language: 'fr', options: frenchOptions }])
  assert.deepEqual(
    filterWikipediaOptions(merged, ['en']).map((o) => o.id),
    ['none', 'all-mini', 'all-maxi']
  )
  assert.deepEqual(
    filterWikipediaOptions(merged, ['fr']).map((o) => o.id),
    ['none', 'fr:all-maxi']
  )
})

test('filterWikipediaOptions keeps the installed selection visible after its language is deselected', () => {
  const merged = mergeWikipediaOptions(englishOptions, [{ language: 'fr', options: frenchOptions }])
  assert.deepEqual(
    filterWikipediaOptions(merged, ['fr'], 'all-mini').map((o) => o.id),
    ['none', 'all-mini', 'fr:all-maxi']
  )
})

test('filterWikipediaOptions treats options without a language as English', () => {
  assert.deepEqual(
    filterWikipediaOptions(englishOptions, ['en']).map((o) => o.id),
    ['none', 'all-mini', 'all-maxi']
  )
})

// ---- manifest schema ----

test('wikipediaSpecSchema keeps the optional language field (VineJS strips undeclared keys)', async () => {
  const spec = {
    spec_version: '1.0',
    options: [
      {
        id: 'all-maxi',
        name: 'Maxi',
        description: 'd',
        size_mb: 1,
        url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_fr_all_maxi_2026-05.zim',
        version: '2026-05',
        language: 'fr',
      },
      { id: 'none', name: 'None', description: 'd', size_mb: 0, url: null, version: null },
    ],
  }
  const validated = await vine.validate({ schema: wikipediaSpecSchema, data: spec })
  assert.equal(validated.options[0].language, 'fr')
  assert.equal(validated.options[1].language, undefined)
})

// ---- security: the setting can never inject into a URL, a path or the picker ----

const HOSTILE_VALUES = [
  '../../etc/passwd',
  'fr/../../secrets',
  'fr%2F..%2F..',
  'fr?token=x',
  'fr#x',
  'fr&lang=eng',
  '<script>alert(1)</script>',
  'FR\u0000',
  'en,../fr',
]

test('security: hostile content.languages values are rejected by the settings endpoint', () => {
  for (const value of HOSTILE_VALUES) {
    assert.ok(
      validateSettingValue('content.languages', value),
      `accepted: ${JSON.stringify(value)}`
    )
  }
})

test('security: hostile values stored anyway (e.g. edited in the DB) are dropped when read', () => {
  for (const value of HOSTILE_VALUES) {
    const codes = parseContentLanguages(value)
    assert.ok(
      codes.every((c) => isSupportedContentLanguage(c)),
      `leaked: ${JSON.stringify(codes)}`
    )
  }
})

test('security: only allow-listed codes can reach a manifest URL or the Kiwix lang filter', () => {
  for (const value of HOSTILE_VALUES) {
    const codes = parseContentLanguages(value)
    for (const code of codes) {
      assert.match(
        manifestUrlFor('zim_categories', code),
        /\/collections\/(?:[a-z]{2}\/)?kiwix-categories\.json$/
      )
    }
    assert.match(toKiwixLangParam(codes), /^[a-z]{3}(,[a-z]{3})*$/)
  }
})

test('security: a non-English manifest cannot shadow English categories or the "none" option', () => {
  const merged = mergeZimCategorySpecs([
    { language: 'en', spec: categorySpec('1.0', ['medicine']) },
    { language: 'fr', spec: categorySpec('1.0', ['medicine']) },
  ])!
  const english = merged.categories.find((c) => c.slug === 'medicine')!
  assert.equal(english.language, 'en')

  const options = mergeWikipediaOptions(englishOptions, [
    { language: 'fr', options: [{ id: 'none', name: 'hijacked none', url: null }] },
  ])
  assert.equal(options.filter((o) => o.id === 'none').length, 1)
  assert.equal(options.find((o) => o.id === 'none')!.name, 'No Wikipedia')
})
