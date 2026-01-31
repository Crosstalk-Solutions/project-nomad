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
              code: ({ node, className, children, ...props }) => (
                <code
                  className="block bg-gray-800 text-gray-100 p-3 rounded-lg overflow-x-auto font-mono text-sm"
                  {...props}
                >
                  {children}
                </code>
              ),
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
