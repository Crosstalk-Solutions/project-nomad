import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { ConditionService } from '#services/condition_service'
import { conditionDrugsValidator } from '#validators/conditions'
import { affirmativeRemediesEnabled } from '../utils/affirmative_remedies.js'

/**
 * "Quando usar o quê" — camada HTTP baseada primeiro na condição (Fase 1).
 *
 * Duas páginas Inertia (index / show) e uma pequena API JSON (drugs).
 * Segue a mesma estrutura do DrugReferenceController:
 *   - index/show renderizam páginas Inertia
 *   - a ação JSON retorna um objeto simples
 *   - validação do slug em show (404 quando não está na lista de condições
 *     selecionadas)
 *   - nunca expõe exceções diretamente à interface do usuário
 */
export default class ConditionsController {
  private get service() {
    return new ConditionService()
  }

  /**
   * GET /conditions — rota antiga de navegação.
   * A navegação por situações agora está diretamente na página unificada
   * de referências de medicamentos. Por isso, esta rota de navegação
   * redireciona permanentemente para lá.
   * Favoritos antigos e links internos passam a abrir o mesmo conteúdo.
   * A rota de detalhes da condição (/conditions/:slug) permanece inalterada.
   * Os chips de situações continuam direcionando para ela por meio de
   * /drug-reference?situation=<slug>.
   */
  async index({ response }: HttpContext) {
    return response.redirect('/drug-reference')
  }

  /**
   * GET /conditions/:slug — página de detalhes da condição.
   * Retorna 404 quando o slug não corresponde a uma condição selecionada.
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
        // Os remédios afirmativos ficam desativados por padrão (#1040).
        // A correspondência entre medicamentos sem receita (OTC) e condições,
        // baseada no texto regulamentado dos rótulos, continua disponível.
        remedies: remediesOn ? (result?.remedies ?? []) : [],
        drugRowCount,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`[ConditionsController] show(${slug}) falhou: ${msg}`)
      return response.internalServerError({ error: 'Could not load condition' })
    }
  }

  /**
   * GET /api/conditions/drugs?slug=… | ?q=…
   * Retorna { condition, drugs } para uma condição selecionada ou uma
   * situação descrita em texto livre.
   * Exige exatamente um dos parâmetros: slug ou q.
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

      // Remove os remédios afirmativos da resposta da busca por situações
      // quando o recurso está desativado (#1040).
      // As correspondências com medicamentos OTC são baseadas no texto
      // regulamentado dos rótulos e são retornadas em ambos os casos.
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
      logger.warn(`[ConditionsController] drugsApi falhou: ${msg}`)
      return response.badRequest({ error: msg })
    }
  }
}
```
