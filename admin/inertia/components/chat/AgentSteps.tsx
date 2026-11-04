import {
  IconAlertTriangle,
  IconBook,
  IconBooks,
  IconCheck,
  IconFileText,
  IconSearch,
} from '@tabler/icons-react'
import type { AgentStepView } from '../../../types/chat'

/**
 * What the chat agent did behind an answer: one line per tool call, live while
 * it runs, with the hits as links.
 */

const TOOL_LABEL: Record<string, { icon: typeof IconSearch; verb: string }> = {
  search_library: { icon: IconSearch, verb: 'Searching the library' },
  read_article: { icon: IconBook, verb: 'Reading' },
  list_books: { icon: IconBooks, verb: 'Listing the books' },
  search_knowledge_base: { icon: IconFileText, verb: 'Searching your documents' },
}

function argText(step: AgentStepView): string {
  const a = step.args as Record<string, any>
  if (step.tool === 'search_library' || step.tool === 'search_knowledge_base') return a.query ? `“${a.query}”` : ''
  if (step.tool === 'read_article') return String(a.path ?? '').split('/').pop()?.replace(/_/g, ' ') ?? ''
  return ''
}

export default function AgentSteps({ steps, running }: { steps: AgentStepView[]; running?: boolean }) {
  if (steps.length === 0 && !running) return null
  return (
    <div className="mb-3">
      <details open={running} className="rounded border border-border-subtle bg-surface-primary/60 text-xs">
        <summary className="cursor-pointer select-none px-3 py-2 font-medium text-text-muted hover:text-text-primary">
          {running ? 'Working…' : `${steps.length} step${steps.length === 1 ? '' : 's'}`}
        </summary>
        <ol className="space-y-2 border-t border-border-subtle px-3 py-2">
          {steps.map((step) => {
            const meta = TOOL_LABEL[step.tool] ?? { icon: IconSearch, verb: step.tool }
            const Icon = meta.icon
            return (
              <li key={step.id}>
                {step.note && <div className="mb-0.5 italic text-text-muted">{step.note}</div>}
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0">
                    {step.status === 'running' ? (
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-desert-green border-t-transparent" />
                    ) : step.status === 'error' ? (
                      <IconAlertTriangle className="h-3.5 w-3.5 text-red-600" />
                    ) : (
                      <IconCheck className="h-3.5 w-3.5 text-desert-green" />
                    )}
                  </span>
                  <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
                  <div className="min-w-0">
                    <div>
                      <span className="font-medium">{meta.verb}</span>
                      {argText(step) && <span className="text-text-secondary"> {argText(step)}</span>}
                      {step.summary && <span className="text-text-muted"> → {step.summary}</span>}
                      {step.ms !== undefined && <span className="text-text-muted"> ({(step.ms / 1000).toFixed(1)} s)</span>}
                    </div>
                    {step.links && step.links.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {step.links.slice(0, 8).map((l) => (
                          <li key={l.url} className="truncate">
                            <a
                              href={l.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-desert-green underline hover:text-desert-green/80"
                            >
                              {l.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </details>
    </div>
  )
}
