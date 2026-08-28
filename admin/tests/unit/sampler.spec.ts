/**
 * Sampler resolution for the Response Style setting.
 *
 * Chat sent no sampler settings at all before this, so every one of these paths
 * is new and the interesting cases are the ones where a value has two sources:
 * a model that declares its own parameters, a caller that pins temperature, and
 * a transport that cannot carry min_p.
 *
 * Pure functions only — no MySQL, Redis, Qdrant, or Ollama needed:
 *   npm run test:unit
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { SAMPLER_PRESETS } from '../../constants/ollama.js'
import {
  compatSamplerParams,
  nativeSamplerOptions,
  parseResponseStyle,
  readModelfileSamplers,
  resolveSamplerProfile,
} from '../../app/utils/sampler.js'

// --- parseResponseStyle -------------------------------------------------------

test('an unset style is auto, not off', () => {
  // The whole point of the setting is that the default samples. Falling back to
  // "send nothing" would restore the bug and look identical in the UI.
  assert.equal(parseResponseStyle(null), 'auto')
  assert.equal(parseResponseStyle(undefined), 'auto')
  assert.equal(parseResponseStyle(''), 'auto')
  assert.equal(parseResponseStyle('   '), 'auto')
})

test('a stored style round-trips', () => {
  assert.equal(parseResponseStyle('auto'), 'auto')
  assert.equal(parseResponseStyle('focused'), 'focused')
  assert.equal(parseResponseStyle('creative'), 'creative')
  assert.equal(parseResponseStyle('off'), 'off')
})

test('case and surrounding whitespace are tolerated', () => {
  assert.equal(parseResponseStyle('  Focused '), 'focused')
})

test('an unrecognised value falls back to auto rather than disabling sampling', () => {
  assert.equal(parseResponseStyle('turbo'), 'auto')
  assert.equal(parseResponseStyle('0.7'), 'auto')
})

// --- readModelfileSamplers ----------------------------------------------------

const QWEN_PARAMETERS = [
  'repeat_penalty                 1',
  'stop                           "<|im_start|>"',
  'stop                           "<|im_end|>"',
  'temperature                    0.6',
  'top_k                          20',
  'top_p                          0.95',
].join('\n')

test('reads the sampler parameters a model author baked in', () => {
  assert.deepEqual(readModelfileSamplers(QWEN_PARAMETERS), {
    repeatPenalty: 1,
    temperature: 0.6,
    topK: 20,
    topP: 0.95,
  })
})

test('a model that declares nothing yields an empty profile', () => {
  assert.deepEqual(readModelfileSamplers('num_ctx                        8192'), {})
  assert.deepEqual(readModelfileSamplers(undefined), {})
  assert.deepEqual(readModelfileSamplers(null), {})
  assert.deepEqual(readModelfileSamplers(42), {})
})

test('a repeated PARAMETER line takes its last value, as Ollama does', () => {
  assert.deepEqual(readModelfileSamplers('temperature 0.2\ntemperature 0.9'), { temperature: 0.9 })
})

test('a non-numeric or negative value is ignored rather than propagated', () => {
  assert.deepEqual(readModelfileSamplers('temperature abc\ntop_k -5'), {})
})

test('a key embedded in another key name is not matched', () => {
  // `min_p` must not be read out of a hypothetical `xmin_p` line, and the
  // trailing-anchor is what stops `top_p 0.9 # comment` scoring as 0.9.
  assert.deepEqual(readModelfileSamplers('xtop_p 0.5'), {})
  assert.deepEqual(readModelfileSamplers('top_p 0.9 trailing'), {})
})

// --- resolveSamplerProfile ----------------------------------------------------

test('off resolves to no profile at all', () => {
  assert.equal(resolveSamplerProfile('off'), undefined)
  assert.equal(resolveSamplerProfile('off', { temperature: 0.6 }), undefined)
})

test('auto on a model that declares nothing is the baseline preset', () => {
  assert.deepEqual(resolveSamplerProfile('auto'), SAMPLER_PRESETS.auto)
  assert.deepEqual(resolveSamplerProfile('auto', {}), SAMPLER_PRESETS.auto)
})

test('auto lets the model author win key by key, and still supplies min_p', () => {
  const resolved = resolveSamplerProfile('auto', readModelfileSamplers(QWEN_PARAMETERS))
  assert.equal(resolved?.temperature, 0.6)
  assert.equal(resolved?.topK, 20)
  assert.equal(resolved?.topP, 0.95)
  assert.equal(resolved?.repeatPenalty, 1)
  // The one value no modelfile in the wild sets, and the reason this exists.
  assert.equal(resolved?.minP, SAMPLER_PRESETS.auto.minP)
})

test("auto sends the author's nucleus on the compat transport too", () => {
  // A declared top_p is a better stand-in for the missing min_p than the
  // preset's generic fallback.
  const resolved = resolveSamplerProfile('auto', { topP: 0.95 })
  assert.equal(resolved?.compatTopP, 0.95)
})

test('a style the user picked by name overrides the model, or it would do nothing', () => {
  const declared = readModelfileSamplers(QWEN_PARAMETERS)
  assert.deepEqual(resolveSamplerProfile('focused', declared), SAMPLER_PRESETS.focused)
  assert.deepEqual(resolveSamplerProfile('creative', declared), SAMPLER_PRESETS.creative)
})

test('resolving does not mutate the shared preset', () => {
  resolveSamplerProfile('auto', { temperature: 0.1, topP: 0.5 })
  assert.equal(SAMPLER_PRESETS.auto.temperature, 0.6)
  assert.equal(SAMPLER_PRESETS.auto.compatTopP, 0.9)
})

// --- transport mapping --------------------------------------------------------

test('the native path carries the truncation settings', () => {
  const options = nativeSamplerOptions(SAMPLER_PRESETS.auto)
  assert.deepEqual(options, {
    top_p: 1,
    top_k: 40,
    min_p: 0.05,
    repeat_penalty: 1.1,
  })
})

test('temperature is not a sampler option, so an explicit caller value still wins', () => {
  // OllamaService applies chatRequest.temperature after this, and the eval
  // harness and the grammar-constrained task calls both depend on that ordering.
  assert.equal('temperature' in nativeSamplerOptions(SAMPLER_PRESETS.focused), false)
})

test('no profile means no options, which is what off has to produce', () => {
  assert.deepEqual(nativeSamplerOptions(undefined), {})
  assert.deepEqual(compatSamplerParams(undefined), {})
})

test('the compat path substitutes a real nucleus for the min_p it cannot send', () => {
  // Passing topP straight through would be top_p 1.0 with no min_p behind it:
  // the raw distribution, which is worse than the 0.9 default it replaced.
  assert.deepEqual(compatSamplerParams(SAMPLER_PRESETS.auto), { top_p: 0.9 })
  assert.deepEqual(compatSamplerParams(SAMPLER_PRESETS.focused), { top_p: 0.85 })
  assert.deepEqual(compatSamplerParams(SAMPLER_PRESETS.creative), { top_p: 0.95 })
})

test('the compat path sends nothing it has no equivalent for', () => {
  const params = compatSamplerParams(SAMPLER_PRESETS.auto)
  assert.deepEqual(Object.keys(params), ['top_p'])
})

test('a profile with no compat fallback falls back to its own top_p', () => {
  assert.deepEqual(compatSamplerParams({ topP: 0.8 }), { top_p: 0.8 })
})

test('every preset supplies min_p and a compat nucleus below 1', () => {
  // Two invariants worth failing a retune over: the preset that forgets min_p
  // is the bug this setting exists to fix, and a compat nucleus of 1 is the
  // untruncated distribution.
  for (const [name, preset] of Object.entries(SAMPLER_PRESETS)) {
    assert.ok(preset.minP !== undefined && preset.minP > 0, `${name} is missing min_p`)
    assert.ok(
      preset.compatTopP !== undefined && preset.compatTopP < 1,
      `${name} would sample the raw distribution on a compat backend`
    )
  }
})
