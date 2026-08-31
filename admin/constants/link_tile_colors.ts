/**
 * The colors a user can give a dashboard link tile.
 *
 * Drawn from the brand palette rather than arbitrary hex, so a tile always sits
 * on-theme next to the managed app cards. The default white-on-green contrast
 * read as jarring on the dashboard, which is why this exists.
 *
 * Tiles stay visually distinct from managed apps regardless of color: the
 * dashed border and the external-link marker are what carry that, not the hue.
 * The tint is deliberately light so the distinction survives every option.
 *
 * Class names are written out in full and never interpolated. Tailwind scans
 * source text for literal class strings, so a computed name like
 * `bg-desert-${id}/10` would be silently dropped from the build.
 */
export const LINK_TILE_COLORS = [
  {
    id: 'green',
    label: 'Green',
    border: 'border-desert-green/70',
    bg: 'bg-desert-green/10',
    marker: 'text-desert-green',
  },
  {
    id: 'olive',
    label: 'Olive',
    border: 'border-desert-olive/70',
    bg: 'bg-desert-olive/10',
    marker: 'text-desert-olive',
  },
  {
    id: 'orange',
    label: 'Orange',
    border: 'border-desert-orange/70',
    bg: 'bg-desert-orange/10',
    marker: 'text-desert-orange',
  },
  {
    id: 'red',
    label: 'Red',
    border: 'border-desert-red/70',
    bg: 'bg-desert-red/10',
    marker: 'text-desert-red',
  },
  {
    id: 'sand',
    label: 'Sand',
    border: 'border-desert-sand/70',
    bg: 'bg-desert-sand/20',
    marker: 'text-desert-stone-dark',
  },
  {
    id: 'stone',
    label: 'Stone',
    border: 'border-desert-stone/70',
    bg: 'bg-desert-stone/10',
    marker: 'text-desert-stone-dark',
  },
] as const

export type LinkTileColorId = (typeof LINK_TILE_COLORS)[number]['id']

export const DEFAULT_LINK_TILE_COLOR: LinkTileColorId = 'green'

export const LINK_TILE_COLOR_IDS: readonly string[] = LINK_TILE_COLORS.map((c) => c.id)

/** Resolve a stored id, falling back to the default for anything unknown. */
export function linkTileColor(id?: string | null) {
  return LINK_TILE_COLORS.find((c) => c.id === id) ?? LINK_TILE_COLORS[0]
}
