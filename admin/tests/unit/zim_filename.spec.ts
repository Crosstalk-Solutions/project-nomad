import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { findReplacedWikipediaFiles, zimFilenameStem } from '../../app/utils/zim_filename.js'

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
