/**
 * The icons offered when creating a dashboard link tile: a curated 36, laid out
 * six across and six down.
 *
 * Every name here must exist in the `DynamicIcon` registry (`inertia/lib/icons.ts`).
 * `DynamicIcon` renders nothing at all for a name it does not know, so an icon
 * that is not in that registry produces a tile with a silent hole where its icon
 * should be. Shared by the picker and the server-side validator so the two can
 * never disagree about what is selectable.
 *
 * Chosen for "a thing on my network": storage, media, documents, tooling,
 * infrastructure. Not a general icon browser. The point of a fixed set is that
 * the user picks from something that fits on one screen.
 */
export const LINK_TILE_ICONS = [
  // Infrastructure
  'IconServer',
  'IconDatabase',
  'IconWorld',
  'IconWifi',
  'IconAntenna',
  'IconBroadcast',

  // Machines and containers
  'IconBrandDocker',
  'IconCpu',
  'IconHome',
  'IconBox',
  'IconFolderOpen',
  'IconMovie',

  // Reading and reference
  'IconBooks',
  'IconBook',
  'IconLibrary',
  'IconMap',
  'IconNotes',
  'IconFileDescription',

  // Tools and admin
  'IconCode',
  'IconTool',
  'IconSettings',
  'IconShieldCheck',
  'IconShieldLock',
  'IconRobot',

  // Subjects
  'IconBrain',
  'IconPlant',
  'IconChefHat',
  'IconSchool',
  'IconStethoscope',
  'IconSearch',

  // Transfer and misc
  'IconCloudDownload',
  'IconCloudUpload',
  'IconLogs',
  'IconPlayerPlay',
  'IconExternalLink',
  'IconWand',
] as const

export type LinkTileIconName = (typeof LINK_TILE_ICONS)[number]

/** The icon a tile gets when none was chosen, or when a stored name is no longer offered. */
export const DEFAULT_LINK_TILE_ICON: LinkTileIconName = 'IconExternalLink'

export function isLinkTileIcon(value: unknown): value is LinkTileIconName {
  return typeof value === 'string' && (LINK_TILE_ICONS as readonly string[]).includes(value)
}
