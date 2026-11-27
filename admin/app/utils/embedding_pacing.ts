/**
 * Whether EmbedFileJob should pause between ZIM batches.
 *
 * The pause protects the host from NOMAD's own Ollama container running
 * embeddings on CPU (sustained 100% CPU has starved sshd). It only applies
 * there:
 * - native Ollama (`true`): pace unless the embedding model is on the GPU;
 * - a non-Ollama backend (`false`: LM Studio, llama.cpp…): a server the user
 *   runs and sizes themselves, which reports no placement through the
 *   OpenAI-compatible API; pausing only slowed GPU embedding ~2x;
 * - backend not identified yet (`null`, e.g. unreachable): keep pacing.
 */
export function shouldPaceEmbedding(
  ollamaNative: boolean | null,
  gpuAccelerated: boolean
): boolean {
  if (ollamaNative === false) return false
  if (ollamaNative === null) return true
  return !gpuAccelerated
}
