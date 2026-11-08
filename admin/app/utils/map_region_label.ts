/**
 * Human-readable names for downloaded map region files, for the map's "Jump to" box.
 *
 * Region files come from two places, each with its own filename convention:
 *   - Curated collection packs: `{resource_id}_{version}.pmtiles` (e.g. `new_york_2025-12.pmtiles`),
 *     titled from the maps manifest.
 *   - Country/region extracts: `{slug}_{dateSlug}_z{maxzoom}.pmtiles` (see MapService.extractRegion),
 *     where slug is a lowercase ISO alpha-2 code, a country group id, or `custom-{hash}`.
 */

export type MapRegionLabelLookups = {
  /** ISO alpha-2 code (any case) -> country name */
  countries: Record<string, string>
  /** Country group id (e.g. `europe`) -> group name */
  groups: Record<string, string>
  /** Curated map resource id (e.g. `new_york`) -> resource title */
  curated: Record<string, string>
}

export type MapRegion = {
  /** Filename on disk, e.g. `ba_20261107_z15.pmtiles` */
  file: string
  /** Name shown to the user, unique within the list */
  label: string
}

const EXTRACT_RE = /^([a-z0-9-]+)_([\d-]+)_z(\d+)$/i

type ParsedRegion = { file: string; label: string; detail: string | null }

function humanize(stem: string): string {
  return stem
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function parseRegion(file: string, lookups: MapRegionLabelLookups): ParsedRegion {
  const stem = file.replace(/\.pmtiles$/i, '')

  // The full Protomaps planet build is stored under its build key, e.g. `20261107.pmtiles`
  // (same convention as inertia/lib/global_map_banner.ts).
  if (/^\d{8}$/.test(stem)) {
    return { file, label: 'Whole world', detail: stem }
  }

  const extract = EXTRACT_RE.exec(stem)
  if (extract) {
    const [, slug, , zoom] = extract
    const detail = `zoom ${zoom}`
    const lower = slug.toLowerCase()
    if (/^[a-z]{2}$/.test(lower) && lookups.countries[lower.toUpperCase()]) {
      return { file, label: lookups.countries[lower.toUpperCase()], detail }
    }
    if (lookups.groups[lower]) {
      return { file, label: lookups.groups[lower], detail }
    }
    if (lower.startsWith('custom-')) {
      return { file, label: 'Custom region', detail: lower.slice('custom-'.length) }
    }
  }

  // Curated packs: the longest resource id that prefixes the stem wins, so `new_york` beats `new`.
  const curatedId = Object.keys(lookups.curated)
    .filter((id) => stem === id || stem.startsWith(`${id}_`))
    .sort((a, b) => b.length - a.length)[0]
  if (curatedId) {
    const version = stem.slice(curatedId.length + 1)
    // Some manifest titles use underscores ("New_York"); show them as words.
    const title = lookups.curated[curatedId].replace(/_+/g, ' ').trim()
    return { file, label: title, detail: version || null }
  }

  return { file, label: humanize(stem), detail: null }
}

/**
 * Label every region file, disambiguating labels that would otherwise collide (the same
 * country extracted at two zoom levels, two custom regions, two versions of one pack),
 * and sort them alphabetically.
 */
export function labelMapRegions(files: string[], lookups: MapRegionLabelLookups): MapRegion[] {
  const parsed = files.map((file) => parseRegion(file, lookups))

  const counts = new Map<string, number>()
  for (const region of parsed) {
    const key = region.label.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const labelled = parsed.map((region) => {
    const collides = (counts.get(region.label.toLowerCase()) ?? 0) > 1
    if (!collides) return { file: region.file, label: region.label }
    const detail = region.detail ?? region.file.replace(/\.pmtiles$/i, '')
    return { file: region.file, label: `${region.label} (${detail})` }
  })

  // Same name and same detail (e.g. one country extracted twice at the same zoom from two
  // builds): fall back to the filename, which is unique on disk.
  const finalCounts = new Map<string, number>()
  for (const region of labelled) {
    const key = region.label.toLowerCase()
    finalCounts.set(key, (finalCounts.get(key) ?? 0) + 1)
  }
  const unique = labelled.map((region) =>
    (finalCounts.get(region.label.toLowerCase()) ?? 0) > 1
      ? {
          file: region.file,
          label: `${region.label.replace(/ \(.*\)$/, '')} (${region.file.replace(/\.pmtiles$/i, '')})`,
        }
      : region
  )

  return unique.sort((a, b) => a.label.localeCompare(b.label))
}
