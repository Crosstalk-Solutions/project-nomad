import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { PersonaService } from '#services/persona_service'
import KVStore from '#models/kv_store'
import { updatePersonaOverrideSchema } from '#validators/persona'
import { DEFAULT_PERSONA, PERSONAS, isPersonaKey, type Persona, type PersonaKey } from '../../constants/ollama.js'

async function readPersonasEnabled(): Promise<boolean> {
  return (await KVStore.getValue('chat.personasEnabled')) ?? true
}

function toPublicPersona(p: Persona) {
  return { key: p.key, label: p.label, description: p.description, systemPrompt: p.systemPrompt }
}

/** Validates the :key route param. Sends 404 and returns null on miss. */
function resolveKey({ params, response }: HttpContext): PersonaKey | null {
  if (!isPersonaKey(params.key)) {
    response.status(404).json({ error: `Unknown persona key: ${params.key}` })
    return null
  }
  return params.key
}

@inject()
export default class PersonasController {
  constructor(private personaService: PersonaService) {}

  async inertia({ inertia }: HttpContext) {
    const enabled = await readPersonasEnabled()
    return inertia.render('personas', { settings: { chatPersonasEnabled: enabled } })
  }

  async index({ response }: HttpContext) {
    const enabled = await readPersonasEnabled()
    const personas = await this.personaService.listAllMergedWithFlags()
    return response.status(200).json({
      enabled,
      personas: personas.map(({ systemPrompt: _p, ...summary }) => summary),
      default: DEFAULT_PERSONA,
    })
  }

  async show(ctx: HttpContext) {
    const key = resolveKey(ctx)
    if (!key) return
    const { persona, override } = await this.personaService.getMergedWithOverride(key)
    const base = PERSONAS[key]
    return ctx.response.status(200).json({
      ...toPublicPersona(persona),
      defaults: {
        label: base.label,
        description: base.description,
        systemPrompt: base.systemPrompt,
      },
      hasOverride: override !== null,
    })
  }

  async update(ctx: HttpContext) {
    const key = resolveKey(ctx)
    if (!key) return
    try {
      const data = await ctx.request.validateUsing(updatePersonaOverrideSchema)
      const merged = await this.personaService.upsertOverride(key, data)
      return ctx.response.status(200).json(toPublicPersona(merged))
    } catch (error) {
      logger.error({ err: error }, '[PersonasController] Failed to update override')
      return ctx.response.status(500).json({ error: 'Failed to update persona override' })
    }
  }

  async reset(ctx: HttpContext) {
    const key = resolveKey(ctx)
    if (!key) return
    const merged = await this.personaService.resetOverride(key)
    return ctx.response.status(200).json(toPublicPersona(merged))
  }
}
