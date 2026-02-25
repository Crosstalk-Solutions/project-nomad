import classNames from '~/lib/classNames'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatMessage } from '../../../types/chat'

export interface ChatMessageBubbleProps {
  message: ChatMessage
}

export default function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  return (
    <div
      className={classNames(
        'max-w-[70%] rounded-lg px-4 py-3',
        message.role === 'user' ? 'bg-desert-green text-white' : 'bg-gray-100 text-gray-800'
      )}
    >
      {message.isThinking && message.thinking && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-amber-700">
            <span>Reasoning</span>
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
          </div>
          <div className="prose prose-xs max-w-none text-amber-900/80 max-h-32 overflow-y-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.thinking}</ReactMarkdown>
          </div>
        </div>
      )}
      {!message.isThinking && message.thinking && (
        <details className="mb-3 rounded border border-gray-200 bg-gray-50 text-xs">
          <summary className="cursor-pointer px-3 py-2 font-medium text-gray-500 hover:text-gray-700 select-none">
            {message.thinkingDuration !== undefined
              ? `Thought for ${message.thinkingDuration}s`
              : 'Reasoning'}
          </summary>
          <div className="px-3 pb-3 prose prose-xs max-w-none text-gray-600 max-h-48 overflow-y-auto border-t border-gray-200 pt-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.thinking}</ReactMarkdown>
          </div>
        </details>
      )}
      <div
        className={classNames(
          'break-words',
          message.role === 'assistant' ? 'prose prose-sm max-w-none' : 'whitespace-pre-wrap'
        )}
      >
        {message.role === 'assistant' ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code: ({ node, className, children, ...props }: any) => {
                const isInline = !className?.includes('language-')
                if (isInline) {
                  return (
                    <code
                      className="bg-gray-800 text-gray-100 px-2 py-0.5 rounded font-mono text-sm"
                      {...props}
                    >
                      {children}
                    </code>
                  )
                }
                return (
                  <code
                    className="block bg-gray-800 text-gray-100 p-3 rounded-lg overflow-x-auto font-mono text-sm my-2"
                    {...props}
                  >
                    {children}
                  </code>
                )
              },
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
              li: ({ children }) => <li className="mb-1">{children}</li>,
              h1: ({ children }) => <h1 className="text-xl font-bold mb-2">{children}</h1>,
              h2: ({ children }) => <h2 className="text-lg font-bold mb-2">{children}</h2>,
              h3: ({ children }) => <h3 className="text-base font-bold mb-2">{children}</h3>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-gray-400 pl-4 italic my-2">
                  {children}
                </blockquote>
              ),
              a: ({ children, href }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-desert-green underline hover:text-desert-green/80"
                >
                  {children}
                </a>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        ) : (
          message.content
        )}
        {message.isStreaming && (
          <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
        )}
      </div>
      <div
        className={classNames(
          'text-xs mt-2',
          message.role === 'user' ? 'text-white/70' : 'text-gray-500'
        )}
      >
        {message.timestamp.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  )
}
