/**
 * Strips unpaired UTF-16 surrogates from a string.
 *
 * Chunk boundaries and the char caps in `OllamaService.embed()` both cut by
 * UTF-16 code unit, so an emoji or other astral character split across a
 * boundary leaves a lone high or low surrogate in one of the pieces. Lone
 * surrogates cannot be encoded as well-formed JSON, and strict JSON parsers —
 * Python's `json` module among them, which is what many OpenAI-compatible
 * gateways run on — reject the whole request body with a 400 ("no low
 * surrogate in string"), failing the entire embed call. Dropping the orphan
 * half-pairs is lossless for meaning: the other half of the pair lives in the
 * adjacent chunk.
 */
export function stripLoneSurrogates(s: string): string {
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}
