/**
 * Pure helpers for DockerService's container lifecycle (install/update/recreate), kept free of
 * Docker and the database so they can be unit-tested.
 */

// Docker tag grammar: up to 128 chars of [A-Za-z0-9_.-], not starting with '.' or '-'.
const IMAGE_TAG_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/

export function isValidImageTag(tag: unknown): tag is string {
  return typeof tag === 'string' && IMAGE_TAG_RE.test(tag)
}

/**
 * Number of rows a Lucid write query affected. The model query builder wraps the driver result
 * in an array (`[affectedRows]` on mysql2); accept a bare number too.
 */
export function affectedRowCount(result: unknown): number {
  const raw = Array.isArray(result) ? result[0] : result
  if (typeof raw === 'number') return raw
  // Some drivers return a header object ({ affectedRows }) instead of a number.
  const affected = (raw as { affectedRows?: unknown } | null)?.affectedRows
  return typeof affected === 'number' ? affected : 0
}

/**
 * Labels set on the container itself, without the ones inherited from its image. `docker inspect`
 * reports the merged set; copying image labels onto a container built from a newer image would
 * pin the old image's metadata (version, etc.) on it. A label whose value differs from the
 * image's was overridden by the container, so it is kept.
 */
export function containerOnlyLabels(
  containerLabels: Record<string, string> | null | undefined,
  imageLabels: Record<string, string> | null | undefined
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(containerLabels ?? {})) {
    if (imageLabels?.[key] !== value) result[key] = value
  }
  return result
}
