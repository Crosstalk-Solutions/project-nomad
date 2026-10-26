import { createHash } from 'node:crypto'

/** Fixed namespace for NOMAD knowledge-base point ids (random, never change it: ids would shift). */
export const KB_POINT_ID_NAMESPACE = '3f0b6c1e-8d7a-4b52-9a1e-6c2d5e4f7a90'

/** RFC 4122 UUIDv5 (SHA-1, name-based): the same name always maps to the same UUID. */
export function uuidV5(name: string, namespace: string = KB_POINT_ID_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(ns).update(name, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Deterministic Qdrant point id for one chunk, so re-embedding the same content
 * (e.g. a retried ZIM batch) overwrites its points instead of duplicating them.
 */
export function chunkPointId(seed: string, chunkIndex: number): string {
  return uuidV5(`${seed}\u0000${chunkIndex}`)
}
