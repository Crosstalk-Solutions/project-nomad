import KVStore from '#models/kv_store'
import { DEFAULT_KEEP_ALIVE } from '../../constants/ollama.js'

/**
 * The keep_alive the chat sends. Shared with the ancillary calls that run on the
 * chat model, which must send the same value or Ollama reschedules the model.
 */
export async function resolveKeepAlive(): Promise<string | number> {
  return (await KVStore.getValue('ai.keepAlive')) || DEFAULT_KEEP_ALIVE
}
