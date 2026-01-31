import { IconSend, IconWand } from '@tabler/icons-react'
import { useState, useRef, useEffect } from 'react'
import classNames from '~/lib/classNames'
import { ChatMessage } from '../../../types/chat'
import ChatMessageBubble from './ChatMessageBubble'
import ChatAssistantAvatar from './ChatAssistantAvatar'

interface ChatInterfaceProps {
  messages: ChatMessage[]
  onSendMessage: (message: string) => void
  isLoading?: boolean
}

export default function ChatInterface({
  messages,
  onSendMessage,
  isLoading = false,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim())
      setInput('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Auto-resize textarea
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <IconWand className="h-16 w-16 text-desert-green mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-gray-700 mb-2">Start a conversation</h3>
              <p className="text-gray-500 text-sm">
                Interact with your installed language models directly in the Command Center.
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={classNames(
                  'flex gap-4',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && <ChatAssistantAvatar />}
                <ChatMessageBubble message={message} />
              </div>
            ))}
            {/* Loading/thinking indicator */}
            {isLoading && (
              <div className="flex gap-4 justify-start">
                <ChatAssistantAvatar />
                <div className="max-w-[70%] rounded-lg px-4 py-3 bg-gray-100 text-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">Thinking</span>
                    <span className="flex gap-1 mt-1">
                      <span
                        className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      <div className="border-t border-gray-200 bg-white px-6 py-4 flex-shrink-0 min-h-[90px]">
        <form onSubmit={handleSubmit} className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Shift+Enter for new line)"
              className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-desert-green focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
              rows={1}
              disabled={isLoading}
              style={{ maxHeight: '200px' }}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={classNames(
              'p-3 rounded-lg transition-all duration-200 flex-shrink-0 mb-2',
              !input.trim() || isLoading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-desert-green text-white hover:bg-desert-green/90 hover:scale-105'
            )}
          >
            {isLoading ? (
              <div className="h-6 w-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <IconSend className="h-6 w-6" />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
