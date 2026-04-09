/**
 * Standalone verification script for selectRewriteModel.
 * Run with: npx tsx tests/unit/rag_utils_verify.ts
 * Does NOT require AdonisJS, Redis, or MySQL.
 */
import { selectRewriteModel } from '../../app/utils/rag_utils.js'

const PREFERRED = 'qwen2.5:3b'

let passed = 0
let failed = 0

function check(description: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`  ${ok ? '✓' : '✗'} ${description}`)
  if (!ok) {
    console.log(`      expected: ${JSON.stringify(expected)}`)
    console.log(`      actual:   ${JSON.stringify(actual)}`)
    failed++
  } else {
    passed++
  }
}

console.log('\nselectRewriteModel\n')

// 1. Preferred model is available
let r = selectRewriteModel([{ name: PREFERRED }, { name: 'llama3.2:8b' }], PREFERRED)
check('uses preferred model when available', r, { model: PREFERRED, isFallback: false })

// 2. Preferred not available — falls back to first
r = selectRewriteModel([{ name: 'llama3.2:8b' }, { name: 'mistral:7b' }], PREFERRED)
check('falls back to first model when preferred missing', r, { model: 'llama3.2:8b', isFallback: true })

// 3. No models at all
r = selectRewriteModel([], PREFERRED)
check('returns undefined model when list is empty', r, { model: undefined, isFallback: true })

// 4. Preferred appears later in the list
r = selectRewriteModel([{ name: 'llama3.2:8b' }, { name: PREFERRED }], PREFERRED)
check('finds preferred even when not first in list', r, { model: PREFERRED, isFallback: false })

// 5. Single model, not preferred
r = selectRewriteModel([{ name: 'mistral:7b' }], PREFERRED)
check('single non-preferred model used as fallback', r, { model: 'mistral:7b', isFallback: true })

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
