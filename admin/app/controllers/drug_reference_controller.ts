import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { DrugReferenceService } from '#services/drug_reference_service'
import { ConditionService } from '#services/condition_service'
import { searchDrugValidator, interactionsValidator } from '#validators/drug_reference'
import { parseCompareIds } from '../../util/compare_ids.js'
import { situationsForIndications } from '../../util/conditions.js'
import { affirmativeRemediesEnabled } from '../utils/affirmative_remedies.js'

/**
 * Referência de Medicamentos v1 — camada HTTP.
 *
 * Duas páginas Inertia (index / show) + uma pequena API JSON (search / status /
 * download). Segue a mesma sequência do WorkshopController / InventoryController:
 *   - index/show renderizam páginas Inertia
 *   - ações JSON retornam objetos simples
 *   - Validação de identificador inteiro em show
 *   - Nunca expõe exceções à interface
 */
export default class DrugReferenceController {
  private get service() {
    return new DrugReferenceService()
  }

  /**
   * GET /drug-reference — página de busca unificada.
   * Envia a quantidade atual de registros e o status da importação para que
   * a mensagem inicial "baixe primeiro" possa ser exibida no servidor.
   * Também envia a lista organizada de condições para que os indicadores
   * de situações, sempre visíveis, e a relação situação → medicamentos
   * possam ser exibidos no servidor.
   */
  async index({ inertia }: HttpContext) {
    try {
      const conditionService = new ConditionService()
      const [status, count, remediesOn] = await Promise.all([
        this.service.getIngestStatus(),
        this.service.rowCount(),
        affirmativeRemediesEnabled(),
      ])

      return inertia.render('drug-reference/index', {
        ingestStatus: status,
        rowCount: count,
        conditions: conditionService.listConditions(),
        // O conteúdo de remédios naturais fica desativado por padrão (#1040):
        // não o inclui na resposta quando estiver desativado e informa à página
        // que ela também deve ocultar o filtro "Natural".
        // A busca de medicamentos e a correspondência com condições não são afetadas.
        remedies: remediesOn ? conditionService.listRemedies() : [],
        remediesEnabled: remediesOn,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`[DrugReferenceController] Falha no index: ${msg}`)
      return inertia.render('drug-reference/index', {
        ingestStatus: null,
        rowCount: 0,
        conditions: [],
        remedies: [],
        remediesEnabled: false,
      })
    }
  }

  /**
   * GET /drug-reference/:id — página de detalhes.
   */
  async show({ inertia, params, response }: HttpContext) {
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return response.notFound({ error: 'identificador inválido' })
    }

    try {
      const label = await this.service.find(id)
      if (!label) {
        return response.notFound({ error: 'Rótulo do medicamento não encontrado' })
      }

      // Relação inversa — o outro lado da relação entre as condições e os
      // medicamentos: quais situações organizadas o texto de indicações deste
      // rótulo contempla? A correspondência é feita no servidor para manter
      // searchTerms restrito ao servidor.
      const situations = situationsForIndications(
        label.indications,
        new ConditionService().allConditions()
      )

      return inertia.render('drug-reference/show', { label, situations })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`[DrugReferenceController] Falha no show(${id}): ${msg}`)
      return response.internalServerError({ error: 'Não foi possível carregar o rótulo do medicamento' })
    }
  }

  /**
   * GET /api/drug-reference/search
   * Retorna uma lista resumida de resultados agrupados (pares de marcas e genéricos).
   */
  async search({ request, response }: HttpContext) {
    try {
      const params = await request.validateUsing(searchDrugValidator)
      const results = await this.service.search(params.q, {
        productType: params.product_type,
        route: params.route,
        sort: params.sort,
        limit: params.limit,
        offset: params.offset,
        scope: params.scope,
      })
      return { results }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn(`[DrugReferenceController] Falha na busca: ${msg}`)
      return response.badRequest({ error: msg })
    }
  }

  /**
   * GET /api/drug-reference/status
   * Retorna o objeto com o status atual da importação.
   */
  async status({ response }: HttpContext) {
    try {
      const status = await this.service.getIngestStatus()
      return status
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`[DrugReferenceController] Falha ao consultar o status: ${msg}`)
      return response.internalServerError({ error: 'Não foi possível consultar o status da importação' })
    }
  }

  /**
   * GET /drug-reference/interactions — página de comparação lado a lado dos rótulos.
   * Envia rowCount e ingestStatus para que a mensagem inicial possa ser exibida,
   * seguindo o mesmo padrão de index(). Os dados das entradas são carregados
   * no cliente por meio de /api/drug-reference/interactions?ids=…,
   * permitindo compartilhar a página pela URL.
   */
  async interactions({ inertia }: HttpContext) {
    try {
      const [status, count] = await Promise.all([
        this.service.getIngestStatus(),
        this.service.rowCount(),
      ])

      return inertia.render('drug-reference/interactions', {
        ingestStatus: status,
        rowCount: count,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`[DrugReferenceController] Falha na página de comparações: ${msg}`)
      return inertia.render('drug-reference/interactions', {
        ingestStatus: null,
        rowCount: 0,
      })
    }
  }

  /**
   * GET /api/drug-reference/interactions?ids=1,2,3
   * Valida → interpreta → busca e retorna { entries: DrugInteractionEntry[] }.
   * Nunca expõe exceções; valida se os identificadores são inteiros por meio
   * de parseCompareIds.
   */
  async interactionsApi({ request, response }: HttpContext) {
    try {
      const params = await request.validateUsing(interactionsValidator)
      const ids = parseCompareIds(params.ids ?? '')
      const entries = await this.service.getInteractionsFor(ids)
      return { entries }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn(`[DrugReferenceController] Falha na API de comparações: ${msg}`)
      return response.badRequest({ error: msg })
    }
  }

  /**
   * POST /api/drug-reference/download
   * Inicia a etapa de download (idempotente — evita duplicações usando um jobId determinístico).
   * Após a conclusão, o download inicia automaticamente a etapa de importação.
   */
  async download({ response }: HttpContext) {
    try {
      const result = await this.service.triggerDownload()
      return { success: true, created: result.created, message: result.message }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`[DrugReferenceController] Falha ao iniciar o download: ${msg}`)
      return response.internalServerError({ error: 'Não foi possível iniciar o download' })
    }
  }

  /**
   * POST /api/drug-reference/ingest
   * Executa manualmente (ou novamente) a etapa de importação usando os arquivos
   * já baixados e armazenados em disco, sem realizar um novo download.
   * Retorna 404 quando não há arquivos no disco, permitindo que a interface
   * mantenha a validação correta mesmo se o botão for acionado externamente.
   */
  async ingest({ response }: HttpContext) {
    try {
      const result = await this.service.triggerIngestFromDisk()
      if (result.nothingDownloaded) {
        return response.notFound({ error: result.message })
      }
      return { success: true, created: result.created, message: result.message }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`[DrugReferenceController] Falha ao iniciar a importação: ${msg}`)
      return response.internalServerError({ error: 'Não foi possível iniciar a importação' })
    }
  }

  /**
   * POST /api/drug-reference/reset-ingest
   * Limpa à força uma tarefa de importação travada (por exemplo, uma tarefa
   * deixada como 'active' após a interrupção de um processo durante uma atualização)
   * e a reinicia usando os arquivos já existentes no disco.
   * É uma alternativa para resolver o estado travado "Indexando…".
   */
  async resetIngest({ response }: HttpContext) {
    try {
      const result = await this.service.resetAndReingest()
      if (result.nothingDownloaded) {
        return response.notFound({ error: result.message })
      }
      return { success: true, created: result.created, message: result.message }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`[DrugReferenceController] Falha ao reiniciar a importação: ${msg}`)
      return response.internalServerError({ error: 'Não foi possível reiniciar a importação' })
    }
  }

  /**
   * POST /api/drug-reference/uninstall
   * Desinstala o conjunto de dados de medicamentos da FDA para uso offline:
   * interrompe tarefas em andamento, exclui os arquivos armazenados em disco,
   * limpa a tabela drug_labels com TRUNCATE, remove os marcadores KV e exclui
   * o registro de estado da instalação (o que oculta automaticamente os blocos
   * correspondentes na página inicial).
   * É a ação "remover" da categoria de conteúdo selecionado.
   * Informa falhas parciais em vez de ocultá-las.
   */
  async uninstall({ response }: HttpContext) {
    try {
      const result = await this.service.uninstall()
      if (!result.success) {
        return response.internalServerError({
          success: false,
          rowsDropped: result.rowsDropped,
          error: result.message,
        })
      }
      return { success: true, rowsDropped: result.rowsDropped, message: result.message }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`[DrugReferenceController] Falha ao desinstalar: ${msg}`)
      return response.internalServerError({ error: 'Não foi possível desinstalar a referência de medicamentos' })
    }
  }

  /**
   * GET /api/drug-reference/ingest-log
   * Lê o trecho final do registro persistente da aplicação para localizar linhas
   * relacionadas à importação, ao download e ao worker. Em produção, o logger
   * grava dados JSON em /app/storage/logs/admin.log (os contêineres administrativo
   * e de processamento compartilham esse volume). Assim, os registros do
   * [IngestDrugDataJob] também aparecem nesse arquivo, mesmo quando a saída
   * padrão do worker não chega ao visualizador de logs.
   * Disponibiliza essas informações por HTTP para identificar a etapa exata
   * em que ocorreu uma interrupção (abertura do ZIP, primeiro registro ou lote),
   * sem precisar acessar o contêiner. Lê apenas o trecho final do arquivo.
   */
  async ingestLog({ request, response }: HttpContext) {
    const LOG_PATH = '/app/storage/logs/admin.log'
    const TAIL_BYTES = 128 * 1024
    const limit = Math.min(Number(request.input('lines', 400)) || 400, 2000)
    try {
      const { stat, open } = await import('node:fs/promises')
      const st = await stat(LOG_PATH)
      const start = Math.max(0, st.size - TAIL_BYTES)
      const fh = await open(LOG_PATH, 'r')
      try {
        const buf = Buffer.alloc(st.size - start)
        await fh.read(buf, 0, buf.length, start)
        const all = buf.toString('utf8').split('\n')
        // Mantém apenas as linhas relevantes à importação, ao download e ao worker.
        // Para linhas JSON do Pino, a busca por trecho também funciona no campo "msg".
        const re =
          /IngestDrugDataJob|DownloadDrugDataJob|DrugReference|drug-ingest|drug-download|unhandledRejection|uncaughtException|queue:work|stalled/i
        const matched = all.filter((l) => re.test(l)).slice(-limit)
        return { ok: true, path: LOG_PATH, size: st.size, count: matched.length, lines: matched }
      } finally {
        await fh.close()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return response.notFound({ ok: false, path: LOG_PATH, error: msg })
    }
  }
}
