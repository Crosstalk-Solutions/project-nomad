import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import { OllamaService } from '#services/ollama_service'
import { RagService } from '#services/rag_service'
import { NomadMdService } from '#services/nomad_md_service'
import KVStore from '#models/kv_store'
import { DEFAULT_KEEP_ALIVE } from '../../constants/ollama.js'
import { runTool, TOOL_DEFINITIONS, type StepLink } from '../agent/tools.js'
import type { ChatSource } from '../../types/chat.js'

/**
 * Tool-calling agent for the chat. One run is a loop of native Ollama calls:
 * the model either answers or asks for tools; tool results go back into the
 * conversation and the loop continues, up to MAX_ROUNDS.
 *
 * Everything the user should see is pushed through `emit` as it happens, so
 * the UI can show live steps. Every Ollama call and every tool fetch takes the
 * request's AbortSignal: when the browser closes the stream (Stop button),
 * generation ends on the GPU at once instead of running to completion.
 */

export const MAX_ROUNDS = 4
// Room for a few article reads (~1.5k tokens each) plus history. Small enough
// for an integrated GPU (tested: a 27B model at IQ3_S with q8_0 KV in 15 GB).
const AGENT_NUM_CTX = 16384

export interface AgentStep {
  id: string
  round: number
  tool: string
  args: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  summary?: string
  links?: StepLink[]
  note?: string
  ms?: number
}

export type AgentEvent =
  | { type: 'round'; round: number }
  | { type: 'token'; round: number; content: string }
  | { type: 'thinking'; round: number; content: string }
  | { type: 'round_note'; round: number }
  | { type: 'step_start'; step: AgentStep }
  | { type: 'step_end'; step: AgentStep }

export interface AgentResult {
  content: string
  steps: AgentStep[]
  sources: ChatSource[]
  aborted: boolean
}

/**
 * The agent's instructions. Written in English like the other system prompts;
 * the model is told to answer in the user's language. Personal context (who
 * the user is, where they live) belongs in the user's NOMAD.md, which
 * run() puts in front of this, never in code.
 */
export function agentSystemPrompt(now = new Date()): string {
  const date = now.toISOString().slice(0, 10)
  return [
    `You are the offline assistant of a Project NOMAD device. Today is ${date}. There may be no internet.`,
    'Your tools: an offline library (Wikipedia, medical references, preparedness, repair, cooking; mostly English) and the documents the user uploaded.',
    '',
    'How to work:',
    '1. Facts and how-tos: call search_library (English search terms), then read the best 1-2 hits with read_article. Answer from what you read, not from memory.',
    '   At most 2 searches and 2 articles per question. Call independent tools in the same round (for example search_library and search_knowledge_base together). Every round costs time and power.',
    "2. Questions about the user's own files: call search_knowledge_base.",
    '3. Back every important statement with a markdown link to the article url.',
    '4. Medicine, chemicals, doses: only give numbers that appear in text you read, and link the source. If nothing says it, say so. If life is at risk, tell them to call the local emergency number first.',
    '',
    "Answer in the user's language, short and plain: the answer first, then steps as a list. No preamble, do not repeat the question.",
  ].join('\n')
}

function sourcesFrom(steps: AgentStep[]): ChatSource[] {
  const seen = new Map<string, ChatSource>()
  for (const s of steps) {
    if (s.tool !== 'read_article') continue
    for (const l of s.links ?? []) {
      if (!seen.has(l.url)) seen.set(l.url, { title: l.title, source: l.url })
    }
  }
  return [...seen.values()].slice(0, 12)
}

@inject()
export class AgentService {
  constructor(
    private ollamaService: OllamaService,
    private ragService: RagService,
    private nomadMdService: NomadMdService
  ) {}

  async run(opts: {
    model: string
    history: Array<{ role: 'user' | 'assistant'; content: string }>
    signal: AbortSignal
    emit: (e: AgentEvent) => void
  }): Promise<AgentResult> {
    const { model, signal, emit } = opts
    const keepAlive =
      ((await KVStore.getValue('ai.keepAlive')) as string | null) || DEFAULT_KEEP_ALIVE
    // One system message: some chat templates (Qwen) reject a second one. The
    // user's NOMAD.md goes first so their standing instructions win.
    const nomadMd = await this.nomadMdService.getSystemPrompt()
    const system = nomadMd ? `${nomadMd}\n\n---\n\n${agentSystemPrompt()}` : agentSystemPrompt()
    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: system },
      ...opts.history.map((m) => ({ role: m.role, content: m.content })),
    ]
    const steps: AgentStep[] = []
    let answer = ''
    // Text of the round in flight, so a Stop keeps what was already written.
    let live = ''

    try {
      for (let round = 0; round <= MAX_ROUNDS; round++) {
        const lastRound = round === MAX_ROUNDS
        if (lastRound) {
          // A user turn, not a system message: Qwen's chat template rejects a
          // system message anywhere but at the start.
          messages.push({
            role: 'user',
            content: 'No more tools. Answer now with what you found.',
          })
        }
        emit({ type: 'round', round })
        const stream = await this.ollamaService.chatStreamWithTools({
          model,
          messages,
          tools: lastRound ? [] : TOOL_DEFINITIONS,
          // Thinking slows every round down a lot on this GPU; it is only worth it
          // for the final answer, and only when the user asks for it.
          think: false,
          keepAlive,
          numCtx: AGENT_NUM_CTX,
          signal,
        })
        let content = ''
        live = ''
        const toolCalls: Array<{ function: { name: string; arguments: Record<string, any> } }> = []
        for await (const chunk of stream) {
          const piece = chunk.message?.content ?? ''
          if (piece) {
            content += piece
            live = content
            emit({ type: 'token', round, content: piece })
          }
          if (chunk.message?.thinking)
            emit({ type: 'thinking', round, content: chunk.message.thinking })
          if (chunk.message?.tool_calls?.length) toolCalls.push(...chunk.message.tool_calls)
        }

        if (toolCalls.length === 0) {
          answer = content
          break
        }

        // Text before a tool call is the model narrating its plan, not the answer.
        if (content.trim()) emit({ type: 'round_note', round })
        messages.push({ role: 'assistant', content, tool_calls: toolCalls })

        for (const call of toolCalls) {
          const step: AgentStep = {
            id: `${round}-${steps.length}`,
            round,
            tool: call.function.name,
            args: call.function.arguments ?? {},
            status: 'running',
            note: content.trim() || undefined,
          }
          steps.push(step)
          emit({ type: 'step_start', step: { ...step } })
          const t0 = Date.now()
          let forModel: string
          try {
            const out = await runTool(step.tool, step.args as Record<string, any>, {
              signal,
              ragService: this.ragService,
            })
            Object.assign(step, {
              status: 'done',
              summary: out.summary,
              links: out.links,
            })
            forModel = out.forModel
          } catch (err) {
            if (signal.aborted) throw err
            const message = err instanceof Error ? err.message : String(err)
            Object.assign(step, { status: 'error', summary: `Error: ${message}` })
            forModel = JSON.stringify({ error: message })
          }
          step.ms = Date.now() - t0
          emit({ type: 'step_end', step: { ...step } })
          messages.push({ role: 'tool', content: forModel, tool_name: step.tool })
        }
      }
    } catch (err) {
      if (signal.aborted) {
        logger.debug('[AgentService] Run aborted by the client')
        return { content: answer || live, steps, sources: sourcesFrom(steps), aborted: true }
      }
      throw err
    }
    return { content: answer, steps, sources: sourcesFrom(steps), aborted: false }
  }
}
