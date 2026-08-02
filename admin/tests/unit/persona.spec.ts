import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { hasPersonaOverride, mergePersona } from '../../app/services/persona_service.js'
import { DEFAULT_PERSONA, PERSONAS, PERSONA_KEYS, isPersonaKey } from '../../constants/ollama.js'
import {
  cleanChatOutput,
  stripHedgeCloser,
  stripLatex,
  truncateAtNonLatin,
} from '../../shared/strip_latex.js'

test('persona keys accept only configured own keys and default to generalist', () => {
  assert.equal(DEFAULT_PERSONA, 'generalist')
  assert.deepEqual(PERSONA_KEYS, Object.keys(PERSONAS))
  assert.equal(isPersonaKey(DEFAULT_PERSONA), true)
  assert.equal(isPersonaKey('medic'), true)
  assert.equal(isPersonaKey('toString'), false)
  assert.equal(isPersonaKey('unknown'), false)
  assert.equal(isPersonaKey(undefined), false)
})

test('mergePersona applies values, preserves defaults for nulls, and keeps examples', () => {
  const base = PERSONAS.generalist
  const merged = mergePersona(base, {
    label: 'Field Guide',
    description: null,
    system_prompt: 'Be concise.',
  })

  assert.equal(merged.key, base.key)
  assert.equal(merged.label, 'Field Guide')
  assert.equal(merged.description, base.description)
  assert.equal(merged.systemPrompt, 'Be concise.')
  assert.equal(merged.examples, base.examples)
  assert.equal(mergePersona(base), base)
})

test('hasPersonaOverride ignores empty rows and detects active fields', () => {
  assert.equal(hasPersonaOverride(), false)
  assert.equal(hasPersonaOverride({ label: null, description: null, system_prompt: null }), false)
  assert.equal(
    hasPersonaOverride({ label: null, description: 'Updated', system_prompt: null }),
    true
  )
})

test('stripLatex converts delimiters, macros, fractions, and units to plain text', () => {
  assert.equal(
    stripLatex('Use \\[ \\frac{40}{5} \\times 2 \\text{ gallons} \\]'),
    'Use (40)/(5) × 2 gallons'
  )
})

test('stripHedgeCloser removes only a trailing hedge paragraph', () => {
  const substantive = 'Use a 20-amp breaker.\n\nLabel the panel when finished.'
  assert.equal(stripHedgeCloser(substantive), substantive)
  assert.equal(
    stripHedgeCloser('Use a 20-amp breaker.\n\nAlways consult a qualified electrician.'),
    'Use a 20-amp breaker.'
  )
  assert.equal(
    stripHedgeCloser('Always consult a qualified electrician.'),
    'Always consult a qualified electrician.'
  )
})

test('truncateAtNonLatin cuts at a prior sentence boundary or at the first script leak', () => {
  assert.equal(truncateAtNonLatin('Keep this sentence. 然后继续'), 'Keep this sentence.')
  assert.equal(truncateAtNonLatin('Prefix Затем'), 'Prefix')
  assert.equal(truncateAtNonLatin('Café costs €2.'), 'Café costs €2.')
})

test('cleanChatOutput composes latex, non-Latin, and hedge cleanup deterministically', () => {
  const dirty = 'Store \\(40 \\times 2\\) gallons.\n\n然后继续\n\nAlways consult a professional.'
  assert.equal(cleanChatOutput(dirty), 'Store 40 × 2 gallons.')
  assert.equal(cleanChatOutput(cleanChatOutput(dirty)), cleanChatOutput(dirty))
})
