import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MIN_CONTEXT,
  UNKNOWN_BACKEND_CONTEXT,
  computeKvBytesPerToken,
  estimateKvBytesPerToken,
  parseParameterBillions,
  parseUserContextCap,
  readContextLength,
  readModelfileNumCtx,
  resolveContextWindow,
  snapToLadder,
  withheldKvHeadsKey,
} from '../../app/utils/context_window.js'

const GB = 2 ** 30
const KIB = 1024

/** Real /api/show model_info for llama3:8b, trimmed to the keys we read. */
const LLAMA3_8B_INFO = {
  'general.architecture': 'llama',
  'llama.attention.head_count': 32,
  'llama.attention.head_count_kv': 8,
  'llama.block_count': 32,
  'llama.context_length': 8192,
  'llama.embedding_length': 4096,
}

test('reads context length via the architecture prefix', () => {
  assert.equal(readContextLength(LLAMA3_8B_INFO), 8192)
})

test('falls back to any *.context_length when architecture is missing', () => {
  assert.equal(readContextLength({ 'qwen3.context_length': 32768 }), 32768)
})

test('readContextLength copes with a Map, and with nothing', () => {
  assert.equal(readContextLength(new Map(Object.entries(LLAMA3_8B_INFO))), 8192)
  assert.equal(readContextLength(undefined), undefined)
  assert.equal(readContextLength({}), undefined)
  assert.equal(readContextLength({ 'llama.block_count': 32 }), undefined)
})

test('reads num_ctx out of the modelfile parameters block', () => {
  assert.equal(readModelfileNumCtx('num_keep 24\nnum_ctx                        16384\nstop "<|eot_id|>"'), 16384)
  assert.equal(readModelfileNumCtx('num_keep 24\nstop "<|eot_id|>"'), undefined)
  assert.equal(readModelfileNumCtx(undefined), undefined)
})

test('computes exact KV bytes per token from GGUF metadata', () => {
  // 2 (K+V) * 32 layers * 8 kv-heads * 128 head_dim * 2 bytes = 128 KiB/token,
  // which puts an 8k window at exactly 1 GiB.
  assert.equal(computeKvBytesPerToken(LLAMA3_8B_INFO), 128 * KIB)
  assert.equal(computeKvBytesPerToken(LLAMA3_8B_INFO)! * 8192, 1 * GB)
})

test('uses grouped-query KV head count, not attention head count', () => {
  // head_count 32 vs head_count_kv 8: using the wrong one overstates cost 4x and
  // would hand every GQA model a quarter of the window it can afford.
  const noGqa = { ...LLAMA3_8B_INFO, 'llama.attention.head_count_kv': 32 }
  assert.equal(computeKvBytesPerToken(noGqa), 4 * computeKvBytesPerToken(LLAMA3_8B_INFO)!)
})

/** GGUF metadata for qwen3.5:0.8b: a scalar KV head count, full attention every 4th layer. */
const QWEN35_08B_INFO = {
  'general.architecture': 'qwen35',
  'qwen35.attention.head_count': 8,
  'qwen35.attention.head_count_kv': 2,
  'qwen35.attention.key_length': 256,
  'qwen35.block_count': 24,
  'qwen35.full_attention_interval': 4,
}

/** GGUF metadata for qwen3.5:122b: KV heads listed per layer, 0 on the linear-attention layers. */
const QWEN35_122B_INFO = {
  'general.architecture': 'qwen35moe',
  'qwen35moe.attention.head_count': 32,
  'qwen35moe.attention.head_count_kv': Array.from({ length: 48 }, (_, i) => (i % 4 === 3 ? 2 : 0)),
  'qwen35moe.attention.key_length': 256,
  'qwen35moe.block_count': 48,
  'qwen35moe.full_attention_interval': 4,
}

test('hybrid attention: only every Nth layer keeps a KV cache (#1406)', () => {
  // 2 (K+V) * 6 full-attention layers * 2 kv-heads * 256 head_dim * 2 bytes.
  assert.equal(computeKvBytesPerToken(QWEN35_08B_INFO), 12 * KIB)
})

test('hybrid attention: per-layer KV head counts are summed (#1406)', () => {
  // 2 (K+V) * (12 layers * 2 kv-heads) * 256 head_dim * 2 bytes. Charging all 48
  // layers at head_count 32 came to 1.5 MiB/token and held the 122b to 8K.
  assert.equal(computeKvBytesPerToken(QWEN35_122B_INFO), 24 * KIB)
})

test('flags a KV head array that /api/show withheld', () => {
  const key = 'qwen35moe.attention.head_count_kv'
  assert.equal(withheldKvHeadsKey({ ...QWEN35_122B_INFO, [key]: null }), key)
  assert.equal(withheldKvHeadsKey({ ...QWEN35_122B_INFO, [key]: [] }), key)
  assert.equal(withheldKvHeadsKey(QWEN35_122B_INFO), undefined)
  assert.equal(withheldKvHeadsKey(LLAMA3_8B_INFO), undefined)
  assert.equal(withheldKvHeadsKey(undefined), undefined)
})

test('a withheld KV head array still counts only full-attention layers', () => {
  const withheld = { ...QWEN35_122B_INFO, 'qwen35moe.attention.head_count_kv': null }
  // Falls back to head_count (32) over the 12 full-attention layers.
  assert.equal(computeKvBytesPerToken(withheld), 2 * 12 * 32 * 256 * 2)
})

test('KV computation returns undefined on incomplete metadata', () => {
  assert.equal(computeKvBytesPerToken({ 'general.architecture': 'llama' }), undefined)
  assert.equal(computeKvBytesPerToken({}), undefined)
  assert.equal(computeKvBytesPerToken(undefined), undefined)
})

test('KV estimate falls back by parameter size, monotonically', () => {
  assert.ok(estimateKvBytesPerToken(1) < estimateKvBytesPerToken(8))
  assert.ok(estimateKvBytesPerToken(8) < estimateKvBytesPerToken(70))
  // Unknown size is treated as mid-range rather than free.
  assert.equal(estimateKvBytesPerToken(undefined), estimateKvBytesPerToken(8))
})

test('parses parameter size from details, falling back to the tag name', () => {
  assert.equal(parseParameterBillions('8.0B'), 8)
  assert.equal(parseParameterBillions('1.5B'), 1.5)
  assert.equal(parseParameterBillions(undefined, 'qwen2.5:0.5b'), 0.5)
  assert.equal(parseParameterBillions(undefined, 'llama3.2:3b'), 3)
  // The case the old name-regex got wrong: no size in the name at all. Better to
  // say "unknown" than to silently assume 8B.
  assert.equal(parseParameterBillions(undefined, 'phi3'), undefined)
})

test('snaps down to a ladder rung', () => {
  assert.equal(snapToLadder(9000), 8192)
  assert.equal(snapToLadder(8192), 8192)
  assert.equal(snapToLadder(100), MIN_CONTEXT)
})

test('the model trained context is a hard ceiling', () => {
  const d = resolveContextWindow({
    modelMaxCtx: 8192,
    kvBytesPerToken: 128 * KIB,
    availableBytes: 80 * GB,
  })
  assert.equal(d.contextWindow, 8192)
  assert.equal(d.limitedBy, 'model')
})

test('never exceeds trained context even to reach the floor', () => {
  // tinyllama trains to 2048. Requesting 4096 pushes RoPE past anything the
  // weights saw; a smaller-than-floor window is the correct answer here.
  const d = resolveContextWindow({
    modelMaxCtx: 2048,
    kvBytesPerToken: 22 * KIB,
    availableBytes: 8 * GB,
  })
  assert.equal(d.contextWindow, 2048)
  assert.equal(d.limitedBy, 'model')
})

test('memory limits the window when the model would allow more', () => {
  // gemma-class KV cost against a small card.
  const d = resolveContextWindow({
    modelMaxCtx: 262144,
    kvBytesPerToken: 1536 * KIB,
    availableBytes: 24 * GB,
    modelBytes: 7.6 * GB,
  })
  assert.ok(d.contextWindow < 262144)
  assert.ok(d.contextWindow >= MIN_CONTEXT)
})

test('a user cap only ever lowers the result', () => {
  const capped = resolveContextWindow({
    modelMaxCtx: 131072,
    kvBytesPerToken: 112 * KIB,
    availableBytes: 24 * GB,
    userCap: 8192,
  })
  assert.equal(capped.contextWindow, 8192)
  assert.equal(capped.limitedBy, 'user')

  // A cap above what the model or memory allows must not raise anything.
  const notRaised = resolveContextWindow({
    modelMaxCtx: 8192,
    kvBytesPerToken: 128 * KIB,
    availableBytes: 24 * GB,
    userCap: 131072,
  })
  assert.equal(notRaised.contextWindow, 8192)
})

test('weights are subtracted from the memory pool', () => {
  const inputs = { modelMaxCtx: 131072, kvBytesPerToken: 128 * KIB, availableBytes: 8 * GB }
  const withoutWeights = resolveContextWindow(inputs)
  const withWeights = resolveContextWindow({ ...inputs, modelBytes: 5 * GB })
  assert.ok(withWeights.contextWindow < withoutWeights.contextWindow)
})

test('falls back to a conservative default when nothing is known', () => {
  const d = resolveContextWindow({ kvBytesPerToken: 128 * KIB })
  assert.equal(d.contextWindow, UNKNOWN_BACKEND_CONTEXT)
  assert.equal(d.limitedBy, 'default')
})

test('the resolver is deterministic — the same inputs give the same window', () => {
  // Stability is the whole point: a window that varies between requests makes
  // Ollama unload and reload the model, stalling the turn and dropping the KV cache.
  const inputs = {
    modelMaxCtx: 131072,
    kvBytesPerToken: 128 * KIB,
    availableBytes: 8 * GB,
    modelBytes: 4.7 * GB,
  }
  const first = resolveContextWindow(inputs)
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(resolveContextWindow(inputs), first)
  }
})

test('parses the user context cap setting', () => {
  assert.equal(parseUserContextCap('16384'), 16384)
  assert.equal(parseUserContextCap('auto'), undefined)
  assert.equal(parseUserContextCap(null), undefined)
  assert.equal(parseUserContextCap(''), undefined)
  assert.equal(parseUserContextCap('nonsense'), undefined)
  // Below the floor is meaningless; treat it as unset rather than crippling chat.
  assert.equal(parseUserContextCap('512'), undefined)
})
