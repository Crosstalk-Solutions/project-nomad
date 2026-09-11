/**
 * Strip the trailing `_YYYY-MM(-DD).zim` date suffix from a Kiwix-style ZIM
 * filename so different release dates of the same variant share a stem
 * (e.g., `wikipedia_en_all_nopic`) while distinct corpora keep distinct stems
 * (`wikipedia_en_simple_all_nopic`, `wikipedia_en_medicine_nopic`, etc.).
 */
export function zimFilenameStem(name: string): string {
  return name.replace(/_\d{4}-\d{2}(?:-\d{2})?\.zim$/i, '')
}

const WIKIPEDIA_FILENAME = /^wikipedia_([a-z]{2,3}(?:-[a-z]+)?)_/i

/**
 * True for a Kiwix Wikipedia ZIM in any language (`wikipedia_en_…`,
 * `wikipedia_fr_…`). Accepts a bare filename or a download URL.
 */
export function isWikipediaZimFilename(nameOrUrl: string): boolean {
  const name = nameOrUrl.split('/').pop() ?? ''
  return WIKIPEDIA_FILENAME.test(name)
}

/** Language segment of a Wikipedia ZIM filename (`fr` for `wikipedia_fr_all_maxi_…`), or null. */
export function wikipediaFilenameLanguage(nameOrUrl: string): string | null {
  const name = nameOrUrl.split('/').pop() ?? ''
  const match = name.match(WIKIPEDIA_FILENAME)
  return match ? match[1].toLowerCase() : null
}

/**
 * Is this downloaded ZIM the Wikipedia the picker manages, as opposed to a
 * Wikipedia-derived corpus that merely shares the prefix (a curated tier's
 * `wikipedia_en_medicine_maxi`, a Kiwix-search download)? It is when its stem
 * matches the current selection (same variant, possibly a newer release) or
 * one of the known Wikipedia options. Only those may update the selection;
 * everything else is bookkept like any other ZIM.
 */
export function isSelectorManagedWikipedia(
  nameOrUrl: string,
  selectionFilename: string | null | undefined,
  optionFilenames: readonly string[]
): boolean {
  const name = nameOrUrl.split('/').pop() ?? ''
  if (!isWikipediaZimFilename(name)) return false
  const stem = zimFilenameStem(name)
  return [selectionFilename, ...optionFilenames]
    .filter((f): f is string => !!f)
    .some((f) => zimFilenameStem(f.split('/').pop() ?? '') === stem)
}

/**
 * Of the existing files, return only those that are prior-version replacements
 * of `currentFilename` — same Wikipedia variant stem, different release. Used
 * by the post-download cleanup to avoid deleting unrelated Wikipedia corpora
 * the user has installed independently (issue #884). The stem includes the
 * language, so a French download never removes an English corpus or vice versa.
 */
export function findReplacedWikipediaFiles(
  currentFilename: string,
  existingNames: string[]
): string[] {
  const currentStem = zimFilenameStem(currentFilename)
  return existingNames.filter(
    (n) => isWikipediaZimFilename(n) && n !== currentFilename && zimFilenameStem(n) === currentStem
  )
}
