import vine from '@vinejs/vine'

/** Contracts for the local maps API. Domain checks also validate source ownership and coverage. */
const regionId = () =>
  vine
    .string()
    .trim()
    .maxLength(120)
    .regex(/^[a-z0-9][a-z0-9_-]*$/)
const component = () => vine.enum(['routing'] as const)

export const mapRegionRequestValidator = vine.compile(
  vine.object({
    regionId: regionId(),
    components: vine.array(component()).minLength(1).maxLength(1),
  })
)
export const mapRegionCheckUpdatesValidator = vine.compile(
  vine.object({ regionId: regionId().optional() })
)
export const mapRegionCancelValidator = vine.compile(
  vine.object({
    regionId: regionId(),
    components: vine.array(component()).minLength(1).maxLength(1).optional(),
  })
)
export const mapRegionEstimateParamsValidator = vine.compile(
  vine.object({ params: vine.object({ regionId: regionId() }) })
)
export const mapRegionEstimateQueryValidator = vine.compile(
  vine.object({
    components: vine
      .string()
      .regex(/^routing$/)
      .optional(),
    operation: vine.enum(['install', 'update'] as const).optional(),
  })
)
export const mapRoutingSettingsValidator = vine.compile(
  vine.object({
    mode: vine.enum(['automatic', 'fixed'] as const),
    regionId: vine
      .string()
      .maxLength(140)
      .regex(/^(packs|regions):[a-z0-9][a-z0-9_-]{0,119}$/)
      .optional(),
  })
)
export const mapRegionComponentParamsValidator = vine.compile(
  vine.object({
    params: vine.object({ regionId: regionId(), component: component() }),
  })
)
export const mapOfflineRouteValidator = vine.compile(
  vine.object({
    automatic: vine.boolean().optional(),
    regionId: vine.string().maxLength(140).optional(),
    packageId: regionId().optional(),
    packageVersion: vine.string().maxLength(100).optional(),
    profile: vine.enum(['auto', 'pedestrian'] as const),
    locations: vine
      .array(
        vine.object({
          lat: vine.number().min(-90).max(90),
          lon: vine.number().min(-180).max(180),
        })
      )
      .minLength(2)
      .maxLength(7),
  })
)
