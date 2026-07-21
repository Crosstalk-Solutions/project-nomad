import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { ConditionService } from '#services/condition_service'
import { conditionDrugsValidator } from '#validators/conditions'
import { affirmativeRemediesEnabled } from '../utils/affirmative_remedies.js'

/**
 * "When to use what" — condition-first HTTP boundary (Phase 1).
 *
 * Two Inertia pages (index / show) + a small JSON API (drugs). Mirrors the
 * DrugReferenceController chain:
 *   - index/show render Inertia
 *   - the JSON action returns a plain object
 *   - slug guard on show (404 when not in the curated spine)
 *   - never leak exceptions to the UI
 */
export default class ConditionsController {
  private get service() {
    return new ConditionService()
  }

  /**
   * GET /conditions — legacy browse route.
   * Situation browsing now lives directly on the unified Drug Reference page, so
   * the standalone browse route permanently redirects there. Any old bookmark or
   * in-app link lands on the same content. The condition detail route
   * (/conditions/:slug) is unchanged — situation chips still deep-link to it via
   * /drug-reference?situation=<slug>.
   */
  async index({ response }: HttpContext) {
    return response.redirect('/drug-reference')
  }

  /**
   * GET /conditions/:slug — condition detail page.
   * 404s when the slug is not a curated condition.
   */
  async show({ inertia, params, response }: HttpContext) {
    const slug = String(params.slug ?? '').trim()
    if (!slug) {
      return response.notFound({ error: 'invalid condition' })
    }

    try {
      const condition = this.service.findCondition(slug)
      if (!condition) {
        return response.notFound({ error: 'Condition not found' })
      }

      const [result, drugRowCount, remediesOn] = await Promise.all([
        this.service.drugsForSlug(slug),
        this.service.drugRowCount(),
        affirmativeRemediesEnabled(),
      ])

      return inertia.render('conditions/show', {
        condition: result?.condition ?? null,
        drugs: result?.drugs ?? [],
        // Affirmative remedies gated off by default (#1040); the OTC/condition
        // match above is regulated label text and stays live.
        remedies: remediesOn ? (result?.remedies ?? []) : [],
        drugRowCount,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`[ConditionsController] show(${slug}) failed: ${msg}`)
      return response.internalServerError({ error: 'Could not load condition' })
    }
  }

  /**
   * GET /api/conditions/drugs?slug=… | ?q=…
   * Returns { condition, drugs } for a curated condition or a free-text
   * situation. Requires exactly one of slug/q.
   */
  async drugsApi({ request, response }: HttpContext) {
    try {
      const params = await request.validateUsing(conditionDrugsValidator)

      if (params.slug && params.q) {
        return response.badRequest({ error: 'Provide either slug or q, not both' })
      }

      const filterOpts = {
        route: params.route,
        sort: params.sort,
      }

      // Strip affirmative remedies from the situation-search response when the
      // gate is closed (#1040); the OTC drug matches are regulated label text and
      // are returned either way.
      const remediesOn = await affirmativeRemediesEnabled()

      if (params.slug) {
        const result = await this.service.drugsForSlug(params.slug, params.limit, filterOpts)
        if (!result) {
          return response.notFound({ error: 'Condition not found' })
        }
        return remediesOn ? result : { ...result, remedies: [] }
      }

      if (params.q) {
        const result = await this.service.drugsForFreeText(params.q, params.limit, filterOpts)
        return remediesOn ? result : { ...result, remedies: [] }
      }

      return response.badRequest({ error: 'Provide a slug or q query parameter' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn(`[ConditionsController] drugsApi failed: ${msg}`)
      return response.badRequest({ error: msg })
    }
  }
}
