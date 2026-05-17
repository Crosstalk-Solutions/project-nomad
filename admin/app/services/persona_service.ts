import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import ChatPersonaOverride from '#models/chat_persona_override'
import {
  DEFAULT_PERSONA,
  PERSONAS,
  isPersonaKey,
  type Persona,
  type PersonaKey,
} from '../../constants/ollama.js'

export interface PersonaWithFlags extends Persona {
  hasOverride: boolean
}

/**
 * Merges built-in persona definitions with any user-supplied overrides
 * stored in chat_persona_overrides. Only override fields that are non-null
 * are applied; the rest fall through to the built-in defaults.
 *
 * Lookup hits the DB once per chat-completion request — fast enough for chat
 * workloads on indexed `persona_key`. Add in-process caching if a profiler
 * shows it matters.
 */
@inject()
export class PersonaService {
  async listAllMergedWithFlags(): Promise<PersonaWithFlags[]> {
    const overrides = await ChatPersonaOverride.all()
    const overrideByKey = new Map(overrides.map((o) => [o.persona_key, o]))
    return Object.values(PERSONAS).map((base) => {
      const override = overrideByKey.get(base.key)
      return { ...this.merge(base, override), hasOverride: override !== undefined }
    })
  }

  async listAllMerged(): Promise<Persona[]> {
    return (await this.listAllMergedWithFlags()).map(({ hasOverride: _h, ...p }) => p)
  }

  async getMergedWithOverride(
    key: PersonaKey
  ): Promise<{ persona: Persona; override: ChatPersonaOverride | null }> {
    const base = PERSONAS[key]
    const override = await ChatPersonaOverride.findBy('persona_key', key)
    return { persona: this.merge(base, override ?? undefined), override }
  }

  async getMerged(key: PersonaKey | string): Promise<Persona> {
    const safeKey: PersonaKey = isPersonaKey(key) ? key : DEFAULT_PERSONA
    const { persona } = await this.getMergedWithOverride(safeKey)
    return persona
  }

  /** Hot-path used by ollama_controller on every chat completion. */
  async getSystemPrompt(key: PersonaKey | string): Promise<string> {
    return (await this.getMerged(key)).systemPrompt
  }

  /**
   * Returns the system prompt plus any few-shot examples for this persona.
   * Used by ollama_controller to inject example user/assistant pairs on
   * the first turn of a conversation.
   */
  async getSystemPromptAndExamples(
    key: PersonaKey | string
  ): Promise<{ systemPrompt: string; examples: ReadonlyArray<{ user: string; assistant: string }> }> {
    const merged = await this.getMerged(key)
    return { systemPrompt: merged.systemPrompt, examples: merged.examples ?? [] }
  }

  /**
   * Upsert override fields. `undefined` leaves a field unchanged; `null`
   * clears the override and lets the built-in default surface again.
   * Returns the merged persona without a second round-trip.
   */
  async upsertOverride(
    key: PersonaKey,
    fields: { label?: string | null; description?: string | null; systemPrompt?: string | null }
  ): Promise<Persona> {
    const update: Partial<Pick<ChatPersonaOverride, 'label' | 'description' | 'system_prompt'>> = {}
    if (fields.label !== undefined) update.label = fields.label
    if (fields.description !== undefined) update.description = fields.description
    if (fields.systemPrompt !== undefined) update.system_prompt = fields.systemPrompt

    const record = await ChatPersonaOverride.updateOrCreate({ persona_key: key }, update)
    logger.debug(`[PersonaService] Saved override for ${key}`)
    return this.merge(PERSONAS[key], record)
  }

  async resetOverride(key: PersonaKey): Promise<Persona> {
    const existing = await ChatPersonaOverride.findBy('persona_key', key)
    if (existing) {
      await existing.delete()
      logger.debug(`[PersonaService] Reset override for ${key}`)
    }
    return PERSONAS[key]
  }

  private merge(base: Persona, override?: ChatPersonaOverride | null): Persona {
    if (!override) return base
    return {
      key: base.key,
      label: override.label ?? base.label,
      description: override.description ?? base.description,
      systemPrompt: override.system_prompt ?? base.systemPrompt,
      // Examples are built-in only (no override schema for them yet) — pass
      // the base persona's array through so few-shot still works after edits.
      examples: base.examples,
    }
  }
}
