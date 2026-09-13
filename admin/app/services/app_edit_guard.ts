import { normalize } from 'node:path'

export interface EditableVolume {
  host_path: string
  container_path: string
}

function normalizedPath(path: string): string {
  return normalize(path).replace(/\/+$/, '') || '/'
}

function volumeKey(volume: EditableVolume): string {
  return `${normalizedPath(volume.host_path)}\0${normalizedPath(volume.container_path)}`
}

/**
 * Custom apps must re-pass every proposed bind through the security guard. Curated apps may carry
 * trusted system binds that the catalog installed (for example openHop's constrained USB device
 * tree); an unchanged inherited bind is not new user-supplied access and must remain editable.
 */
export function selectVolumesForEditGuard(input: {
  proposed?: EditableVolume[]
  existing?: EditableVolume[]
  isCustom: boolean
}): EditableVolume[] {
  const proposed = input.proposed ?? []
  if (input.isCustom) return proposed

  const inherited = new Set((input.existing ?? []).map(volumeKey))
  return proposed.filter((volume) => !inherited.has(volumeKey(volume)))
}
