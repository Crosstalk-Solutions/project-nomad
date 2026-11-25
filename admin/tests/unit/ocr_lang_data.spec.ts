import * as assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { resolveTesseractLangPath, tesseractWorkerOptions } from '../../app/utils/ocr_lang_data.js'

test('the bundled English model is where the OCR worker will look for it (#1457)', () => {
  const langPath = resolveTesseractLangPath()
  assert.ok(
    existsSync(join(langPath, 'eng.traineddata.gz')),
    `missing eng.traineddata.gz under ${langPath}`
  )
})

test('worker options read the bundled model and skip the download cache', () => {
  const options = tesseractWorkerOptions()
  assert.equal(options.cacheMethod, 'none')
  assert.equal(options.gzip, true)
  assert.ok(options.langPath.endsWith('4.0.0_best_int'))
})
