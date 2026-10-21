import { ChatService } from '#services/chat_service'
import { DockerService } from '#services/docker_service'
import { NomadMdService } from '#services/nomad_md_service'
import { OllamaService } from '#services/ollama_service'
import { RagService } from '#services/rag_service'
import Service from '#models/service'
import KVStore from '#models/kv_store'
import { modelNameSchema } from '#validators/download'
import { chatSchema, getAvailableModelsSchema, unloadChatModelsSchema } from '#validators/ollama'
import { assertNotCloudMetadataUrl } from '#validators/common'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { RAG_CONTEXT_LIMITS, SYSTEM_PROMPTS } from '../../constants/ollama.js'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import logger from '@adonisjs/core/services/logger'

type Message = { role: 'system' | 'user' | 'assistant'; content: string }

@inject()
export default class OllamaController {
  constructor(
    private chatService: ChatService,
    private dockerService: DockerService,
    private ollamaService: OllamaService,
    private ragService: RagService,
    private nomadMdService: NomadMdService
  ) {}

  async availableModels({ request }: HttpContext) {
    const reqData = await request.validateUsing(getAvailableModelsSchema)
    return await this.ollamaService.getAvailableModels({
      sort: reqData.sort,
      recommendedOnly: reqData.recommendedOnly,
      query: reqData.query || null,
      limit: reqData.limit || 15,
      force: reqData.force,
    })
  }

  /**
   * Envia instruções keep_alive: 0 do Ollama para todos os modelos de chat
   * atualmente carregados, exceto o modelo de embeddings e, opcionalmente,
   * um modelo específico que deve ser mantido.
   * Usado pela interface de chat para garantir que apenas um modelo de chat
   * esteja ativo por vez ao trocar de modelo, sessão ou carregar a página.
   * É uma operação de melhor esforço: uma falha aqui não deve impedir
   * a execução do fluxo que a chamou.
   */
  async unloadChatModels({ request, response }: HttpContext) {
    const { targetModel } = await request.validateUsing(unloadChatModelsSchema)
    const unloaded = await this.ollamaService.unloadAllChatModelsExcept(targetModel ?? null)
    return response.status(200).json({ unloaded })
  }

  async chat({ request, response }: HttpContext) {
    const reqData = await request.validateUsing(chatSchema)

    // Envia imediatamente os cabeçalhos SSE para manter a conexão com o cliente
    // aberta enquanto o pré-processamento (reescrita da consulta e busca RAG)
    // é executado em segundo plano.
    if (reqData.stream) {
      response.response.setHeader('Content-Type', 'text/event-stream')
      response.response.setHeader('Cache-Control', 'no-cache')
      response.response.setHeader('Connection', 'keep-alive')
      response.response.flushHeaders()
    }

    try {
      // Se não houver mensagens de sistema no chat, adiciona as instruções padrão.
      const hasSystemMessage = reqData.messages.some((msg) => msg.role === 'system')
      if (!hasSystemMessage) {
        const systemPrompt = {
          role: 'system' as const,
          content: SYSTEM_PROMPTS.default,
        }
        logger.debug('[OllamaController] Adicionando instrução de sistema')
        reqData.messages.unshift(systemPrompt)
      }

      // Adiciona o NOMAD.md gerenciado pelo usuário como uma mensagem de sistema
      // no início da conversa, para que as instruções persistentes do usuário
      // tenham prioridade. A instrução de formatação padrão e o contexto RAG
      // continuam preservados. Se o arquivo estiver ausente ou vazio, nada muda.
      const nomadPrompt = await this.nomadMdService.getSystemPrompt()
      if (nomadPrompt) {
        logger.debug('[OllamaController] Adicionando instrução de sistema do NOMAD.md')
        reqData.messages.unshift({ role: 'system' as const, content: nomadPrompt })
      }

      // Reescreve a consulta para melhorar a recuperação RAG com um contexto controlável.
      // Se não for necessário reescrever, retorna a mensagem mais recente do usuário.
      const rewrittenQuery = await this.rewriteQueryWithContext(reqData.messages, reqData.model)

      logger.debug(`[OllamaController] Consulta reescrita para RAG: "${rewrittenQuery}"`)
      if (rewrittenQuery) {
        const collectionFilter: string | null = request.input('collection', null)
        const relevantDocs = await this.ragService.searchSimilarDocuments(
          rewrittenQuery,
          5, // Os 5 trechos mais relevantes
          0.3, // Pontuação mínima de similaridade de 0,3
          collectionFilter ?? undefined
        )

        logger.debug(`[RAG] Recuperados ${relevantDocs.length} documentos relevantes para a consulta: "${rewrittenQuery}"`)

        // Se houver contexto relevante, adiciona-o como mensagem de sistema
        // respeitando os limites adaptativos.
        if (relevantDocs.length > 0) {
          // Define o limite de contexto com base no tamanho do modelo.
          const { maxResults, maxTokens } = this.getContextLimitsForModel(reqData.model)
          let trimmedDocs = relevantDocs.slice(0, maxResults)

          // Aplica o limite de tokens, se definido (estimativa de 3,5 caracteres por token).
          // Sempre inclui o primeiro resultado, o mais relevante.
          // O limite restringe apenas os resultados seguintes.
          if (maxTokens > 0) {
            const charCap = maxTokens * 3.5
            let totalChars = 0
            trimmedDocs = trimmedDocs.filter((doc, idx) => {
              totalChars += doc.text.length
              return idx === 0 || totalChars <= charCap
            })
          }

          logger.debug(
            `[RAG] Inserindo ${trimmedDocs.length}/${relevantDocs.length} resultados (modelo: ${reqData.model}, máximo de resultados: ${maxResults}, máximo de tokens: ${maxTokens || 'ilimitado'})`
          )

          // Identifica cada bloco de contexto com o título da fonte, quando disponível.
          // Isso fornece uma indicação clara da origem sem exibir a pontuação bruta
          // de relevância. As pontuações de similaridade de cosseno do modelo nomic
          // para trechos realmente relevantes ficam em torno de 0,4 a 0,6.
          // Exibir, por exemplo, "42%" pode levar o modelo a desconfiar de um contexto
          // correto. As pontuações continuam disponíveis nos registros para depuração.
          const contextText = trimmedDocs
            .map((doc, idx) => {
              const title = doc.metadata?.full_title || doc.metadata?.article_title
              const label = title ? `[Contexto ${idx + 1} — ${title}]` : `[Contexto ${idx + 1}]`
              return `${label}\n${doc.text}`
            })
            .join('\n\n')

          const systemMessage = {
            role: 'system' as const,
            content: SYSTEM_PROMPTS.rag_context(contextText),
          }

          // Insere a mensagem de sistema no início, depois das mensagens de sistema existentes.
          const firstNonSystemIndex = reqData.messages.findIndex((msg) => msg.role !== 'system')
          const insertIndex = firstNonSystemIndex === -1 ? 0 : firstNonSystemIndex
          reqData.messages.splice(insertIndex, 0, systemMessage)
        }
      }

      // Se as mensagens de sistema forem grandes (por exemplo, devido ao contexto RAG),
      // solicita uma janela de contexto suficientemente grande para acomodá-las.
      // O Ollama respeita num_ctx por requisição; o LM Studio ignora esse parâmetro
      // sem causar problemas.
      const systemChars = reqData.messages
        .filter((m) => m.role === 'system')
        .reduce((sum, m) => sum + m.content.length, 0)
      const estimatedSystemTokens = Math.ceil(systemChars / 3.5)
      let numCtx: number | undefined
      if (estimatedSystemTokens > 3000) {
        const needed = estimatedSystemTokens + 2048 // Reserva espaço para a conversa e a resposta.
        numCtx = [8192, 16384, 32768, 65536].find((n) => n >= needed) ?? 65536
        logger.debug(`[OllamaController] Instrução de sistema extensa (~${estimatedSystemTokens} tokens); solicitando num_ctx: ${numCtx}`)
      }

      // Verifica se o modelo oferece o recurso de raciocínio aprimorado.
      // O recurso só é ativado quando o modelo é compatível e o usuário deseja utilizá-lo.
      // A preferência explícita da requisição tem prioridade; caso contrário,
      // utiliza o padrão global (ai.autoThinking, desativado por padrão).
      // Para modelos gpt-oss, o parâmetro think precisa receber um valor de texto.
      const thinkingCapability = await this.ollamaService.checkModelHasThinking(reqData.model)
      let thinkingEnabled = false
      if (thinkingCapability) {
        thinkingEnabled = reqData.think ?? ((await KVStore.getValue('ai.autoThinking')) ?? false)
      }
      const think: boolean | 'medium' =
        thinkingEnabled ? (reqData.model.startsWith('gpt-oss') ? 'medium' : true) : false

      // Separa sessionId e a preferência de raciocínio resolvida dos dados enviados ao Ollama.
      // O Ollama rejeita campos desconhecidos, e think é definido novamente acima,
      // em vez de ser enviado diretamente com o valor original.
      const { sessionId, think: _thinkPref, ...ollamaRequest } = reqData

      // Salva a mensagem do usuário no banco de dados antes de transmitir a resposta,
      // caso sessionId tenha sido informado.
      let userContent: string | null = null
      if (sessionId) {
        const lastUserMsg = [...reqData.messages].reverse().find((m) => m.role === 'user')
        if (lastUserMsg) {
          userContent = lastUserMsg.content
          await this.chatService.addMessage(sessionId, 'user', userContent)
        }
      }

      if (reqData.stream) {
        logger.debug(`[OllamaController] Iniciando resposta em fluxo para o modelo: "${reqData.model}" com think: ${think}`)
        // Os cabeçalhos já foram enviados acima.
        // Interrompe a geração no servidor se o cliente desconectar.
        // Caso contrário, uma requisição abandonada continua sendo processada e,
        // com o OLLAMA_NUM_PARALLEL=1 padrão do Ollama, bloqueia todas as próximas
        // requisições de chat/RAG até que o modelo seja interrompido manualmente (#1065).
        const abortController = new AbortController()
        response.response.on('close', () => abortController.abort())
        const stream = await this.ollamaService.chatStream({
          ...ollamaRequest,
          think,
          thinkingCapable: thinkingCapability,
          numCtx,
          signal: abortController.signal,
        })
        let fullContent = ''
        try {
          for await (const chunk of stream) {
            if (chunk.message?.content) {
              fullContent += chunk.message.content
            }
            response.response.write(`data: ${JSON.stringify(chunk)}\n\n`)
          }
        } catch (err) {
          if (abortController.signal.aborted) {
            logger.debug('[OllamaController] Cliente desconectado; geração do Ollama interrompida')
            return
          }
          throw err
        }
        response.response.end()

        // Salva a mensagem do assistente e, se necessário, gera um título para a conversa.
        if (sessionId && fullContent) {
          await this.chatService.addMessage(sessionId, 'assistant', fullContent)
          const messageCount = await this.chatService.getMessageCount(sessionId)
          if (messageCount <= 2 && userContent) {
            this.chatService.generateTitle(sessionId, userContent, fullContent, reqData.model).catch((err) => {
              logger.error(`[OllamaController] Falha ao gerar título: ${err instanceof Error ? err.message : err}`)
            })
          }
        }
        return
      }

      // Caminho sem transmissão em fluxo (legado).
      const result = await this.ollamaService.chat({ ...ollamaRequest, think, thinkingCapable: thinkingCapability, numCtx })

      if (sessionId && result?.message?.content) {
        await this.chatService.addMessage(sessionId, 'assistant', result.message.content)
        const messageCount = await this.chatService.getMessageCount(sessionId)
        if (messageCount <= 2 && userContent) {
          this.chatService.generateTitle(sessionId, userContent, result.message.content, reqData.model).catch((err) => {
            logger.error(`[OllamaController] Falha ao gerar título: ${err instanceof Error ? err.message : err}`)
          })
        }
      }

      return result
    } catch (error) {
      if (reqData.stream) {
        response.response.write(`data: ${JSON.stringify({ error: true })}\n\n`)
        response.response.end()
        return
      }
      throw error
    }
  }

  async remoteStatus() {
    const remoteUrl = await KVStore.getValue('ai.remoteOllamaUrl')
    if (!remoteUrl) {
      return { configured: false, connected: false }
    }
    try {
      const testResponse = await fetch(`${remoteUrl.replace(/\/$/, '')}/v1/models`, {
        signal: AbortSignal.timeout(3000),
      })
      return { configured: true, connected: testResponse.ok }
    } catch {
      return { configured: true, connected: false }
    }
  }

  async configureRemote({ request, response }: HttpContext) {
    const remoteUrl: string | null = request.input('remoteUrl', null)

    const ollamaService = await Service.query().where('service_name', SERVICE_NAMES.OLLAMA).first()
    if (!ollamaService) {
      return response.status(404).send({ success: false, message: 'Registro do serviço Ollama não encontrado.' })
    }

    // Limpar configuração: uma URL nula ou vazia remove a configuração remota.
    // Se ainda existir um contêiner local nomad_ollama (instalado anteriormente),
    // reinicia-o e mantém o serviço marcado como instalado.
    // Caso contrário, o serviço volta ao estado não instalado.
    if (!remoteUrl || remoteUrl.trim() === '') {
      await KVStore.clearValue('ai.remoteOllamaUrl')
      const hasLocalContainer = await this._startLocalOllamaContainerIfExists()
      ollamaService.installed = hasLocalContainer
      ollamaService.installation_status = 'idle'
      await ollamaService.save()
      return {
        success: true,
        message: hasLocalContainer
          ? 'Configuração remota do Ollama removida. Contêiner local do Ollama restaurado.'
          : 'Configuração remota do Ollama removida.',
      }
    }

    try {
      assertNotCloudMetadataUrl(remoteUrl)
    } catch (err) {
      return response.status(400).send({
        success: false,
        message: err instanceof Error ? err.message : 'URL inválida.',
      })
    }

    // Testa a conexão pelo endpoint compatível com a API da OpenAI /v1/models.
    // Esse endpoint funciona com Ollama, LM Studio, llama.cpp, entre outros.
    try {
      const testResponse = await fetch(`${remoteUrl.replace(/\/$/, '')}/v1/models`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!testResponse.ok) {
        return response.status(400).send({
          success: false,
          message: `Não foi possível conectar a ${remoteUrl} (HTTP ${testResponse.status}). Verifique se o servidor está em execução e acessível. Para o Ollama, inicie-o com OLLAMA_HOST=0.0.0.0.`,
        })
      }
    } catch (error) {
      return response.status(400).send({
        success: false,
        message: `Não foi possível conectar a ${remoteUrl}. Verifique se o servidor está em execução e acessível. Para o Ollama, inicie-o com OLLAMA_HOST=0.0.0.0.`,
      })
    }

    // Salva a URL remota e marca o serviço como instalado.
    await KVStore.setValue('ai.remoteOllamaUrl', remoteUrl.trim())
    ollamaService.installed = true
    ollamaService.installation_status = 'idle'
    await ollamaService.save()

    // Interrompe o contêiner local nomad_ollama, caso esteja em execução,
    // para evitar concorrência com o servidor remoto pelo uso da GPU ou da porta 11434.
    // O contêiner e o volume que contém os modelos são preservados.
    await this._stopLocalOllamaContainer()

    // Instala o Qdrant se ele ainda não estiver instalado (operação em segundo plano).
    const qdrantService = await Service.query().where('service_name', SERVICE_NAMES.QDRANT).first()
    if (qdrantService && !qdrantService.installed) {
      this.dockerService.createContainerPreflight(SERVICE_NAMES.QDRANT).catch((error) => {
        logger.error('[OllamaController] Falha ao iniciar a verificação prévia do Qdrant:', error)
      })
    }

    // Replica as ações executadas após a instalação: desativa sugestões e inicia
    // a descoberta dos documentos do NOMAD.
    await KVStore.setValue('chat.suggestionsEnabled', false)
    this.ragService.discoverNomadDocs().catch((error) => {
      logger.error('[OllamaController] Falha ao descobrir documentos do NOMAD:', error)
    })

    return { success: true, message: 'Ollama remoto configurado.' }
  }

  private async _stopLocalOllamaContainer(): Promise<void> {
    try {
      const containers = await this.dockerService.docker.listContainers({ all: true })
      const ollamaContainer = containers.find((c) =>
        c.Names.includes(`/${SERVICE_NAMES.OLLAMA}`)
      )
      if (!ollamaContainer || ollamaContainer.State !== 'running') {
        return
      }
      await this.dockerService.docker.getContainer(ollamaContainer.Id).stop()
      this.dockerService.invalidateServicesStatusCache()
      logger.info('[OllamaController] Contêiner local nomad_ollama interrompido (Ollama remoto configurado)')
    } catch (error: any) {
      logger.error(
        { err: error },
        '[OllamaController] Falha ao interromper o contêiner local nomad_ollama; o Ollama remoto continua ativo'
      )
    }
  }

  private async _startLocalOllamaContainerIfExists(): Promise<boolean> {
    try {
      const containers = await this.dockerService.docker.listContainers({ all: true })
      const ollamaContainer = containers.find((c) =>
        c.Names.includes(`/${SERVICE_NAMES.OLLAMA}`)
      )
      if (!ollamaContainer) {
        return false
      }
      if (ollamaContainer.State !== 'running') {
        await this.dockerService.docker.getContainer(ollamaContainer.Id).start()
        this.dockerService.invalidateServicesStatusCache()
        logger.info('[OllamaController] Contêiner local nomad_ollama iniciado (configuração remota do Ollama removida)')
      }
      return true
    } catch (error: any) {
      logger.error(
        { err: error },
        '[OllamaController] Falha ao iniciar o contêiner local nomad_ollama após remover a configuração remota'
      )
      return false
    }
  }

  async deleteModel({ request }: HttpContext) {
    const reqData = await request.validateUsing(modelNameSchema)
    await this.ollamaService.deleteModel(reqData.model)
    return {
      success: true,
      message: `Modelo excluído: ${reqData.model}`,
    }
  }

  async dispatchModelDownload({ request }: HttpContext) {
    const reqData = await request.validateUsing(modelNameSchema)
    await this.ollamaService.dispatchModelDownload(reqData.model)
    return {
      success: true,
      message: `Tarefa de download iniciada para o modelo: ${reqData.model}`,
    }
  }

  async installedModels({}: HttpContext) {
    const models = await this.ollamaService.getModels()
    // Adiciona a cada modelo a informação sobre sua capacidade de raciocínio,
    // permitindo que o seletor de modelos do chat saiba quais devem exibir
    // a opção de ativar ou desativar esse recurso.
    // checkModelHasThinking armazena em cache os resultados de /api/show,
    // tornando as chamadas repetidas mais rápidas. A operação é feita
    // individualmente para cada modelo e não impede o retorno dos demais.
    const thinking = await Promise.all(
      models.map((m) => this.ollamaService.checkModelHasThinking(m.name))
    )
    return models.map((m, i) => ({ ...m, thinking: thinking[i] }))
  }

  /**
   * Determina os limites do contexto RAG com base no tamanho do modelo,
   * extraído do nome do modelo.
   * Identifica indicadores de tamanho como "1b", "3b", "8b" e "70b"
   * nos nomes ou nas etiquetas dos modelos.
   */
  private getContextLimitsForModel(modelName: string): { maxResults: number; maxTokens: number } {
    // Extrai a quantidade de parâmetros do nome do modelo
    // (por exemplo, "llama3.2:3b", "qwen2.5:1.5b", "gemma:7b").
    const sizeMatch = modelName.match(/(\d+\.?\d*)[bB]/)
    const paramBillions = sizeMatch ? parseFloat(sizeMatch[1]) : 8 // Usa 8B como padrão se o tamanho for desconhecido.

    for (const tier of RAG_CONTEXT_LIMITS) {
      if (paramBillions <= tier.maxParams) {
        return { maxResults: tier.maxResults, maxTokens: tier.maxTokens }
      }
    }

    // Alternativa: sem limites.
    return { maxResults: 5, maxTokens: 0 }
  }

  private async rewriteQueryWithContext(
    messages: Message[],
    model: string
  ): Promise<string | null> {
    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user')

    try {
      // Ignora todo o processo RAG se não houver documentos para pesquisar.
      const hasDocuments = await this.ragService.hasDocuments()
      if (!hasDocuments) {
        return null
      }

      // Obtém o histórico recente da conversa (as últimas 6 mensagens, equivalentes a 3 turnos).
      const recentMessages = messages.slice(-6)

      // Não reescreve a consulta no primeiro turno: com apenas uma mensagem do usuário,
      // não existe contexto anterior para incorporar, e a reescrita apenas repetiria
      // a mensagem, gerando uma chamada adicional ao modelo de linguagem.
      // A partir da primeira mensagem de acompanhamento, a reescrita permite incluir
      // entidades e assuntos dos turnos anteriores na consulta RAG.
      // Exemplo: "as barras" pode ser reescrito como "barras de chocolate Hershey's
      // e intoxicação de cães". Sem isso, os embeddings podem não encontrar resultados,
      // e o assistente pode perder o contexto da conversa.
      const userMessages = recentMessages.filter(msg => msg.role === 'user')
      if (userMessages.length < 2) {
        return lastUserMessage?.content || null
      }

      const conversationContext = recentMessages
        .map(msg => {
          const role = msg.role === 'user' ? 'Usuário' : 'Assistente'
          // Limita as mensagens do assistente aos primeiros 200 caracteres
          // para manter o contexto em um tamanho controlável.
          const content = msg.role === 'assistant'
            ? msg.content.slice(0, 200) + (msg.content.length > 200 ? '...' : '')
            : msg.content
          return `${role}: "${content}"`
        })
        .join('\n')

      const response = await this.ollamaService.chat({
        model,
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPTS.query_rewrite,
          },
          {
            role: 'user',
            content: `Conversa:\n${conversationContext}\n\nConsulta reescrita:`,
          },
        ],
      })

      const rewrittenQuery = response.message.content.trim()
      logger.info(`[RAG] Consulta reescrita: "${rewrittenQuery}"`)
      return rewrittenQuery
    } catch (error) {
      logger.error(
        `[RAG] Falha ao reescrever a consulta: ${error instanceof Error ? error.message : error}`
      )
      // Se a reescrita falhar, utiliza a última mensagem do usuário como alternativa.
      return lastUserMessage?.content || null
    }
  }
}
