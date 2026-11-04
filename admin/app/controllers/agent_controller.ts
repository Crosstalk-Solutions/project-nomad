import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { AgentService, type AgentEvent } from '#services/agent_service'
import { ChatService } from '#services/chat_service'
import { agentChatSchema } from '#validators/agent'

/**
 * POST /api/agent/chat: the tool-calling chat. Streams AgentEvents as SSE
 * (`data: {json}`) and finishes with a `done` event.
 *
 * The close listener is attached before any work, so a Stop in the browser
 * aborts whatever is running at that moment: an Ollama round or a tool fetch.
 * A stopped answer is still saved, marked as stopped, together with the steps
 * that already ran.
 */
@inject()
export default class AgentController {
  constructor(
    private agentService: AgentService,
    private chatService: ChatService
  ) {}

  async chat({ request, response }: HttpContext) {
    const abortController = new AbortController()
    response.response.on('close', () => abortController.abort())

    const reqData = await request.validateUsing(agentChatSchema)

    response.response.setHeader('Content-Type', 'text/event-stream')
    response.response.setHeader('Cache-Control', 'no-cache')
    response.response.setHeader('Connection', 'keep-alive')
    response.response.flushHeaders()

    const send = (payload: object) => {
      if (!response.response.writableEnded && !abortController.signal.aborted) {
        response.response.write(`data: ${JSON.stringify(payload)}\n\n`)
      }
    }

    const lastUser = [...reqData.messages].reverse().find((m) => m.role === 'user')
    if (reqData.sessionId && lastUser) {
      await this.chatService.addMessage(reqData.sessionId, 'user', lastUser.content)
    }

    try {
      const result = await this.agentService.run({
        model: reqData.model,
        history: reqData.messages,
        signal: abortController.signal,
        emit: (e: AgentEvent) => send(e),
      })
      send({ type: 'done', aborted: result.aborted, sources: result.sources })
      if (!response.response.writableEnded) response.response.end()

      if (reqData.sessionId && (result.content || result.steps.length)) {
        const content = result.aborted ? `${result.content}\n\n_(stopped)_`.trim() : result.content
        await this.chatService.addMessage(
          reqData.sessionId,
          'assistant',
          content,
          result.sources,
          result.steps
        )
        if (
          !result.aborted &&
          lastUser &&
          (await this.chatService.getMessageCount(reqData.sessionId)) <= 2
        ) {
          this.chatService
            .generateTitle(reqData.sessionId, lastUser.content, result.content, reqData.model)
            .catch((err) =>
              logger.error(`[AgentController] Title generation failed: ${err?.message ?? err}`)
            )
        }
      }
    } catch (err) {
      logger.error(
        `[AgentController] Agent run failed: ${err instanceof Error ? err.message : err}`
      )
      send({ type: 'error', message: err instanceof Error ? err.message : 'Agent run failed' })
      if (!response.response.writableEnded) response.response.end()
    }
  }
}
