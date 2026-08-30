import {
  IconAlertTriangle,
  IconAmbulance,
  IconAntenna,
  IconBandage,
  IconBarrel,
  IconBattery,
  IconBed,
  IconBolt,
  IconBuildingHospital,
  IconCampfire,
  IconCar,
  IconDoor,
  IconDroplet,
  IconFirstAidKit,
  IconFish,
  IconFlag,
  IconGasStation,
  IconHome,
  IconMapPinFilled,
  IconMeat,
  IconMountain,
  IconPackage,
  IconPill,
  IconRadio,
  IconRoute,
  IconSeeding,
  IconSkull,
  IconSolarPanel,
  IconStethoscope,
  IconTent,
  IconTool,
  IconToolsKitchen2,
  IconTractor,
  IconTrees,
  IconTruck,
  IconWheat,
  IconWifi,
} from '@tabler/icons-react'
import type { IconProps } from '@tabler/icons-react'
import type { ComponentType } from 'react'

/**
 * The marker icon set: a curated 36, laid out as six rows of six.
 *
 * Deliberately named imports rather than `import * as TablerIcons`. The
 * namespace form pulls the entire icon library into the maps bundle -- when this
 * picker offered all of Tabler *and* all of Font Awesome it took the maps chunk
 * from 864 kB to 5,774 kB, and gave the user 160 pages to scroll through,
 * including brand logos and text-alignment glyphs. Neither is what someone
 * marking a water source needs.
 *
 * Adding an icon means adding it here, which is the point: the list stays
 * meaningful for marking a place on a map you are relying on offline.
 */
export type MarkerIconEntry = {
  /** Stored on the marker row, e.g. `tabler:IconDroplet`. */
  name: string
  /** Shown as the button tooltip. */
  label: string
  Icon: ComponentType<IconProps>
}

const entry = (
  Icon: ComponentType<IconProps>,
  tablerName: string,
  label: string
): MarkerIconEntry => ({ name: `tabler:${tablerName}`, label, Icon })

export const MARKER_ICONS: MarkerIconEntry[] = [
  // Water and food
  entry(IconDroplet, 'IconDroplet', 'Water'),
  entry(IconBarrel, 'IconBarrel', 'Water storage'),
  entry(IconToolsKitchen2, 'IconToolsKitchen2', 'Food'),
  entry(IconWheat, 'IconWheat', 'Grain or crops'),
  entry(IconMeat, 'IconMeat', 'Meat or game'),
  entry(IconFish, 'IconFish', 'Fishing'),

  // Shelter and living
  entry(IconHome, 'IconHome', 'Building'),
  entry(IconTent, 'IconTent', 'Camp'),
  entry(IconBed, 'IconBed', 'Shelter'),
  entry(IconDoor, 'IconDoor', 'Entrance'),
  entry(IconCampfire, 'IconCampfire', 'Fire'),
  entry(IconSeeding, 'IconSeeding', 'Garden'),

  // Medical
  entry(IconFirstAidKit, 'IconFirstAidKit', 'First aid'),
  entry(IconBuildingHospital, 'IconBuildingHospital', 'Hospital'),
  entry(IconStethoscope, 'IconStethoscope', 'Clinic'),
  entry(IconPill, 'IconPill', 'Medication'),
  entry(IconBandage, 'IconBandage', 'Supplies'),
  entry(IconAmbulance, 'IconAmbulance', 'Ambulance'),

  // Power and communications
  entry(IconBolt, 'IconBolt', 'Power'),
  entry(IconSolarPanel, 'IconSolarPanel', 'Solar'),
  entry(IconBattery, 'IconBattery', 'Battery'),
  entry(IconAntenna, 'IconAntenna', 'Antenna'),
  entry(IconRadio, 'IconRadio', 'Radio'),
  entry(IconWifi, 'IconWifi', 'Network'),

  // Transport and supply
  entry(IconGasStation, 'IconGasStation', 'Fuel'),
  entry(IconCar, 'IconCar', 'Vehicle'),
  entry(IconTruck, 'IconTruck', 'Truck'),
  entry(IconTractor, 'IconTractor', 'Machinery'),
  entry(IconPackage, 'IconPackage', 'Cache or supplies'),
  entry(IconTool, 'IconTool', 'Tools'),

  // Terrain, routes and hazards
  entry(IconMountain, 'IconMountain', 'High ground'),
  entry(IconTrees, 'IconTrees', 'Woodland'),
  entry(IconRoute, 'IconRoute', 'Route'),
  entry(IconFlag, 'IconFlag', 'Rally point'),
  entry(IconAlertTriangle, 'IconAlertTriangle', 'Hazard'),
  entry(IconSkull, 'IconSkull', 'Danger'),
]

/** The pin used when a marker has no icon, or names one no longer in the set. */
export const DEFAULT_MARKER_ICON = IconMapPinFilled

const BY_NAME = new Map(MARKER_ICONS.map((i) => [i.name, i.Icon]))

/**
 * Resolve a stored icon name to a component, falling back to the default pin.
 *
 * The fallback matters beyond bad data: a marker saved with an icon that is
 * later removed from the set must still render, rather than blanking the pin.
 */
export function resolveMarkerIcon(
  icon?: string | null,
  fallback: ComponentType<IconProps> = DEFAULT_MARKER_ICON
): ComponentType<IconProps> {
  if (!icon) return fallback
  return BY_NAME.get(icon) ?? fallback
}
