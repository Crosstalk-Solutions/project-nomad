import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  findReplacedWikipediaFiles,
  isSelectorManagedWikipedia,
  isWikipediaZimFilename,
  wikipediaFilenameLanguage,
  zimFilenameStem,
} from '../../app/utils/zim_filename.js'

test('zimFilenameStem strips YYYY-MM date suffix', () => {
  assert.equal(zimFilenameStem('wikipedia_en_all_nopic_2026-02.zim'), 'wikipedia_en_all_nopic')
})

test('zimFilenameStem strips YYYY-MM-DD date suffix', () => {
  assert.equal(zimFilenameStem('wikipedia_en_all_nopic_2026-02-15.zim'), 'wikipedia_en_all_nopic')
})

test('zimFilenameStem returns input unchanged when no date suffix present', () => {
  assert.equal(
    zimFilenameStem('wikipedia_en_my_custom_extract.zim'),
    'wikipedia_en_my_custom_extract.zim'
  )
})

test('findReplacedWikipediaFiles cleans up older version of same variant', () => {
  assert.deepEqual(
    findReplacedWikipediaFiles('wikipedia_en_all_nopic_2026-04.zim', [
      'wikipedia_en_all_nopic_2026-02.zim',
      'wikipedia_en_all_nopic_2026-04.zim',
    ]),
    ['wikipedia_en_all_nopic_2026-02.zim']
  )
})

test('findReplacedWikipediaFiles preserves co-existing distinct corpora — the #884 regression case', () => {
  assert.deepEqual(
    findReplacedWikipediaFiles('wikipedia_en_medicine_nopic_2026-04.zim', [
      'wikipedia_en_simple_all_nopic_2026-02.zim',
      'wikipedia_en_medicine_nopic_2026-04.zim',
    ]),
    []
  )
})

test('findReplacedWikipediaFiles preserves all unrelated variants when a new variant lands', () => {
  assert.deepEqual(
    findReplacedWikipediaFiles('wikipedia_en_all_nopic_2026-04.zim', [
      'wikipedia_en_simple_all_nopic_2026-02.zim',
      'wikipedia_en_medicine_nopic_2026-04.zim',
      'wikipedia_en_wikivoyage_2026-02.zim',
      'wikipedia_en_climate_change_2025-08.zim',
      'wikipedia_en_all_nopic_2026-04.zim',
    ]),
    []
  )
})

test('findReplacedWikipediaFiles ignores files without wikipedia_en_ prefix', () => {
  assert.deepEqual(
    findReplacedWikipediaFiles('wikipedia_en_all_nopic_2026-04.zim', [
      'wiktionary_en_all_2026-02.zim',
      'gutenberg_en_all_2026-01.zim',
      'wikipedia_en_all_nopic_2026-04.zim',
    ]),
    []
  )
})

test('findReplacedWikipediaFiles preserves manually-named files without a date suffix', () => {
  assert.deepEqual(
    findReplacedWikipediaFiles('wikipedia_en_all_nopic_2026-04.zim', [
      'wikipedia_en_my_custom_extract.zim',
      'wikipedia_en_all_nopic_2026-04.zim',
    ]),
    []
  )
})

test('isWikipediaZimFilename recognises Wikipedia ZIMs in any language, from a name or a URL', () => {
  assert.equal(isWikipediaZimFilename('wikipedia_en_all_maxi_2026-05.zim'), true)
  assert.equal(isWikipediaZimFilename('wikipedia_fr_all_maxi_2026-05.zim'), true)
  assert.equal(isWikipediaZimFilename('wikipedia_zh-classical_all_2025-01.zim'), true)
  assert.equal(
    isWikipediaZimFilename(
      'https://download.kiwix.org/zim/wikipedia/wikipedia_de_all_nopic_2026-04.zim'
    ),
    true
  )
})

test('isWikipediaZimFilename ignores other projects, including ones whose directory is "wikipedia"', () => {
  assert.equal(isWikipediaZimFilename('wiktionary_fr_all_2026-02.zim'), false)
  assert.equal(isWikipediaZimFilename('vikidia_fr_all_maxi_2026-09.zim'), false)
  assert.equal(
    isWikipediaZimFilename('https://mirror/zim/wikipedia/ifixit_fr_all_2026-03.zim'),
    false
  )
})

test('wikipediaFilenameLanguage extracts the language segment', () => {
  assert.equal(wikipediaFilenameLanguage('wikipedia_fr_all_maxi_2026-05.zim'), 'fr')
  assert.equal(wikipediaFilenameLanguage('https://x/wikipedia_en_all_mini_2026-05.zim'), 'en')
  assert.equal(wikipediaFilenameLanguage('gutenberg_fr_all_2026-01.zim'), null)
})

test('findReplacedWikipediaFiles cleans up an older version of a non-English variant', () => {
  assert.deepEqual(
    findReplacedWikipediaFiles('wikipedia_fr_all_maxi_2026-05.zim', [
      'wikipedia_fr_all_maxi_2025-11.zim',
      'wikipedia_fr_all_maxi_2026-05.zim',
    ]),
    ['wikipedia_fr_all_maxi_2025-11.zim']
  )
})

test('findReplacedWikipediaFiles never removes a corpus in another language', () => {
  assert.deepEqual(
    findReplacedWikipediaFiles('wikipedia_fr_all_maxi_2026-05.zim', [
      'wikipedia_en_all_maxi_2026-05.zim',
      'wikipedia_en_all_maxi_2025-11.zim',
      'wikipedia_fr_all_maxi_2026-05.zim',
    ]),
    []
  )
})

// ---- which downloads the Wikipedia picker manages ----

const OPTIONS = [
  'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_maxi_2026-05.zim',
  'https://download.kiwix.org/zim/wikipedia/wikipedia_fr_all_mini_2026-05.zim',
]

test('isSelectorManagedWikipedia: the selected file and known options are managed', () => {
  assert.equal(isSelectorManagedWikipedia('wikipedia_en_all_maxi_2026-05.zim', null, OPTIONS), true)
  assert.equal(
    isSelectorManagedWikipedia('https://mirror/x/wikipedia_fr_all_mini_2026-05.zim', null, OPTIONS),
    true
  )
})

test('isSelectorManagedWikipedia: a newer release of the selected variant is managed (auto-update)', () => {
  assert.equal(
    isSelectorManagedWikipedia(
      'wikipedia_en_all_nopic_2026-08.zim',
      'wikipedia_en_all_nopic_2026-05.zim',
      []
    ),
    true
  )
})

test('isSelectorManagedWikipedia: curated Wikipedia-derived corpora are NOT managed', () => {
  // Medicine tiers ship WikiMed; it must not hijack the Wikipedia selection
  assert.equal(
    isSelectorManagedWikipedia(
      'wikipedia_en_medicine_maxi_2026-01.zim',
      'wikipedia_en_all_maxi_2026-05.zim',
      OPTIONS
    ),
    false
  )
  assert.equal(
    isSelectorManagedWikipedia('wikipedia_fr_medicine_nopic_2026-07.zim', null, OPTIONS),
    false
  )
})

test('isSelectorManagedWikipedia: non-Wikipedia files are never managed', () => {
  assert.equal(
    isSelectorManagedWikipedia('ifixit_fr_all_2026-03.zim', 'ifixit_fr_all_2025-12.zim', []),
    false
  )
})
