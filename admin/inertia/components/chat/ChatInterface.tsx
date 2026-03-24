import { IconSend, IconWand } from '@tabler/icons-react'
import { useState, useRef, useEffect } from 'react'
import classNames from '~/lib/classNames'
import { useTranslation } from 'react-i18next'
import { ChatMessage } from '../../../types/chat'
import ChatMessageBubble from './ChatMessageBubble'
import ChatAssistantAvatar from './ChatAssistantAvatar'
import BouncingDots from '../BouncingDots'
import StyledModal from '../StyledModal'
import api from '~/lib/api'
import { DEFAULT_QUERY_REWRITE_MODEL } from '../../../constants/ollama'
import { useNotifications } from '~/context/NotificationContext'
import { usePage } from '@inertiajs/react'

interface ChatInterfaceProps {
  messages: ChatMessage[]
  onSendMessage: (message: string) => void
  isLoading?: boolean
  chatSuggestions?: string[]
  chatSuggestionsEnabled?: boolean
  chatSuggestionsLoading?: boolean
  rewriteModelAvailable?: boolean
}

export default function ChatInterface({
  messages,
  onSendMessage,
  isLoading = false,
  chatSuggestions = [],
  chatSuggestionsEnabled = false,
  chatSuggestionsLoading = false,
  rewriteModelAvailable = false
}: ChatInterfaceProps) {
  const { t } = useTranslation()
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props
  const { addNotification } = useNotifications()
  const [input, setInput] = useState('')
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleDownloadModel = async () => {
    setIsDownloading(true)
    try {
      await api.downloadModel(DEFAULT_QUERY_REWRITE_MODEL)
      addNotification({ type: 'success', message: t('chat.modelDownloadQueued') })
    } catch (error) {
      addNotification({ type: 'error', message: t('chat.modelDownloadFailed') })
    } finally {
      setIsDownloading(false)
      setDownloadDialogOpen(false)
    }
  }

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
    <div className="flex-1 flex flex-col min-h-0 bg-surface-primary shadow-sm">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <IconWand className="h-16 w-16 text-desert-green mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-text-primary mb-2">{t('chat.startConversation')}</h3>
              <p className="text-text-muted text-sm">
                {t('chat.interactWithModels')}
              </p>
              {chatSuggestionsEnabled && chatSuggestions && chatSuggestions.length > 0 && !chatSuggestionsLoading && (
                <div className="mt-8">
                  <h4 className="text-sm font-medium text-text-secondary mb-2">{t('chat.suggestions')}</h4>
                  <div className="flex flex-col gap-2">
                    {chatSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setInput(suggestion)
                          // Focus the textarea after setting input
                          setTimeout(() => {
                            textareaRef.current?.focus()
                          }, 0)
                        }}
                        className="px-4 py-2 bg-surface-secondary hover:bg-surface-secondary rounded-lg text-sm text-text-primary transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Display bouncing dots while loading suggestions */}
              {chatSuggestionsEnabled && chatSuggestionsLoading && <BouncingDots text={t('chat.thinking')} containerClassName="mt-8" />}
              {!chatSuggestionsEnabled && (
                <div className="mt-8 text-sm text-text-muted">
                  {t('chat.enableSuggestions')}
                </div>
              )}
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
                <div className="max-w-[70%] rounded-lg px-4 py-3 bg-surface-secondary text-text-primary">
                  <BouncingDots text={t('chat.thinking')} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      <div className="border-t border-border-subtle bg-surface-primary px-6 py-4 flex-shrink-0 min-h-[90px]">
        <form onSubmit={handleSubmit} className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.typePlaceholder', { name: aiAssistantName })}
              className="w-full resize-none rounded-lg border border-border-default px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-desert-green focus:border-transparent disabled:bg-surface-secondary disabled:text-text-muted"
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
                ? 'bg-border-default text-text-muted cursor-not-allowed'
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
        {!rewriteModelAvailable && (
          <div className="text-sm text-text-muted mt-2">
            {t('chat.ragModelNotInstalled', { model: DEFAULT_QUERY_REWRITE_MODEL })
              .split('<button>')[0]}
            <button
              onClick={() => setDownloadDialogOpen(true)}
              className="text-desert-green underline hover:text-desert-green/80 cursor-pointer"
            >
              {t('chat.ragModelNotInstalled', { model: DEFAULT_QUERY_REWRITE_MODEL })
                .split('<button>')[1]?.split('</button>')[0]}
            </button>
            {t('chat.ragModelNotInstalled', { model: DEFAULT_QUERY_REWRITE_MODEL })
              .split('</button>')[1]}
          </div>
        )}
        <StyledModal
          open={downloadDialogOpen}
          title={t('chat.downloadModelTitle', { model: DEFAULT_QUERY_REWRITE_MODEL })}
          confirmText={t('chat.download')}
          confirmIcon='IconDownload'
          confirmVariant='primary'
          confirmLoading={isDownloading}
          onConfirm={handleDownloadModel}
          onCancel={() => setDownloadDialogOpen(false)}
          onClose={() => setDownloadDialogOpen(false)}
        >
          <p className="text-text-primary" dangerouslySetInnerHTML={{
            __html: t('chat.downloadModelDescription', { model: DEFAULT_QUERY_REWRITE_MODEL })
          }} />
        </StyledModal>
      </div>
    </div>
  )
}
