import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ChatSidebar from './ChatSidebar'
import ChatInterface from './ChatInterface'
import StyledModal from '../StyledModal'
import api from '~/lib/api'
import { formatBytes } from '~/lib/util'
import { useModals } from '~/context/ModalContext'
import { ChatMessage } from '../../../types/chat'
import classNames from '~/lib/classNames'
import { IconX } from '@tabler/icons-react'
import { DEFAULT_QUERY_REWRITE_MODEL } from '../../../constants/ollama'

interface ChatProps {
  enabled: boolean
  isInModal?: boolean
  onClose?: () => void
  suggestionsEnabled?: boolean
  streamingEnabled?: boolean
}

export default function Chat({
  enabled,
  isInModal,
  onClose,
  suggestionsEnabled = false,
  streamingEnabled = true,
}: ChatProps) {
  const queryClient = useQueryClient()
  const { openModal, closeAllModals } = useModals()
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [isStreamingResponse, setIsStreamingResponse] = useState(false)
  const streamAbortRef = useRef<AbortController | null>(null)

  // Fetch all sessions
  const { data: sessions = [] } = useQuery({
    queryKey: ['chatSessions'],
    queryFn: () => api.getChatSessions(),
    enabled,
    select: (data) =>
      data?.map((s) => ({
        id: s.id,
        title: s.title,
        model: s.model || undefined,
        timestamp: new Date(s.timestamp),
        lastMessage: s.lastMessage || undefined,
      })) || [],
  })

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  const { data: installedModels = [], isLoading: isLoadingModels } = useQuery({
    queryKey: ['installedModels'],
    queryFn: () => api.getInstalledModels(),
    enabled,
    select: (data) => data || [],
  })

  const { data: chatSuggestions, isLoading: chatSuggestionsLoading } = useQuery<string[]>({
    queryKey: ['chatSuggestions'],
    queryFn: async ({ signal }) => {
      const res = await api.getChatSuggestions(signal)
      return res ?? []
    },
    enabled: suggestionsEnabled && !activeSessionId,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  const rewriteModelAvailable = useMemo(() => {
    return installedModels.some(model => model.name === DEFAULT_QUERY_REWRITE_MODEL)
  }, [installedModels])

  const deleteAllSessionsMutation = useMutation({
    mutationFn: () => api.deleteAllChatSessions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatSessions'] })
      setActiveSessionId(null)
      setMessages([])
      closeAllModals()
    },
  })

  const chatMutation = useMutation({
    mutationFn: (request: {
      model: string
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    }) => api.sendChatMessage({ ...request, stream: false }),
    onSuccess: async (data, variables) => {
      if (!data || !activeSessionId) {
        throw new Error('No response from Ollama')
      }

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: data.message?.content || 'Sorry, I could not generate a response.',
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      // Save assistant message to backend
      await api.addChatMessage(activeSessionId, 'assistant', assistantMessage.content)

      // Update session title if it's a new chat
      const currentSession = sessions.find((s) => s.id === activeSessionId)
      if (currentSession && currentSession.title === 'New Chat') {
        const userContent = variables.messages[variables.messages.length - 1].content
        const newTitle = userContent.slice(0, 50) + (userContent.length > 50 ? '...' : '')
        await api.updateChatSession(activeSessionId, { title: newTitle })
        queryClient.invalidateQueries({ queryKey: ['chatSessions'] })
      }
    },
    onError: (error) => {
      console.error('Error sending message:', error)
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please try again.',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    },
  })

  // Set first model as selected by default
  useEffect(() => {
    if (installedModels.length > 0 && !selectedModel) {
      setSelectedModel(installedModels[0].name)
    }
  }, [installedModels, selectedModel])

  const handleNewChat = useCallback(() => {
    // Just clear the active session and messages - don't create a session yet
    setActiveSessionId(null)
    setMessages([])
  }, [])

  const handleClearHistory = useCallback(() => {
    openModal(
      <StyledModal
        title="Clear All Chat History?"
        onConfirm={() => deleteAllSessionsMutation.mutate()}
        onCancel={closeAllModals}
        open={true}
        confirmText="Clear All"
        cancelText="Cancel"
        confirmVariant="danger"
      >
        <p className="text-gray-700">
          Are you sure you want to delete all chat sessions? This action cannot be undone and all
          conversations will be permanently deleted.
        </p>
      </StyledModal>,
      'confirm-clear-history-modal'
    )
  }, [openModal, closeAllModals, deleteAllSessionsMutation])

  const handleSessionSelect = useCallback(
    async (sessionId: string) => {
      // Cancel any ongoing suggestions fetch
      queryClient.cancelQueries({ queryKey: ['chatSuggestions'] })

      setActiveSessionId(sessionId)
      // Load messages for this session
      const sessionData = await api.getChatSession(sessionId)
      if (sessionData?.messages) {
        setMessages(
          sessionData.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.timestamp),
          }))
        )
      } else {
        setMessages([])
      }

      // Set the model to match the session's model if it exists and is available
      if (sessionData?.model) {
        setSelectedModel(sessionData.model)
      }
    },
    [installedModels, queryClient]
  )

  const handleSendMessage = useCallback(
    async (content: string) => {
      let sessionId = activeSessionId

      // Create a new session if none exists
      if (!sessionId) {
        const newSession = await api.createChatSession('New Chat', selectedModel)
        if (newSession) {
          sessionId = newSession.id
          setActiveSessionId(sessionId)
          queryClient.invalidateQueries({ queryKey: ['chatSessions'] })
        } else {
          return
        }
      }

      // Add user message to UI
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, userMessage])

      // Save user message to backend
      await api.addChatMessage(sessionId, 'user', content)

      const chatMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content },
      ]

      if (streamingEnabled !== false) {
        // Streaming path
        const abortController = new AbortController()
        streamAbortRef.current = abortController

        setIsStreamingResponse(true)

        const assistantMsgId = `msg-${Date.now()}-assistant`
        let isFirstChunk = true
        let fullContent = ''
        let thinkingContent = ''
        let isThinkingPhase = true
        let thinkingStartTime: number | null = null
        let thinkingDuration: number | null = null

        try {
          await api.streamChatMessage(
            { model: selectedModel || 'llama3.2', messages: chatMessages, stream: true },
            (chunkContent, chunkThinking, done) => {
              if (chunkThinking.length > 0 && thinkingStartTime === null) {
                thinkingStartTime = Date.now()
              }
              if (isFirstChunk) {
                isFirstChunk = false
                setIsStreamingResponse(false)
                setMessages((prev) => [
                  ...prev,
                  {
                    id: assistantMsgId,
                    role: 'assistant',
                    content: chunkContent,
                    thinking: chunkThinking,
                    timestamp: new Date(),
                    isStreaming: true,
                    isThinking: chunkThinking.length > 0 && chunkContent.length === 0,
                    thinkingDuration: undefined,
                  },
                ])
              } else {
                if (isThinkingPhase && chunkContent.length > 0) {
                  isThinkingPhase = false
                  if (thinkingStartTime !== null) {
                    thinkingDuration = Math.max(1, Math.round((Date.now() - thinkingStartTime) / 1000))
                  }
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? {
                        ...m,
                        content: m.content + chunkContent,
                        thinking: (m.thinking ?? '') + chunkThinking,
                        isStreaming: !done,
                        isThinking: isThinkingPhase,
                        thinkingDuration: thinkingDuration ?? undefined,
                      }
                      : m
                  )
                )
              }
              fullContent += chunkContent
              thinkingContent += chunkThinking
            },
            abortController.signal
          )
        } catch (error: any) {
          if (error?.name !== 'AbortError') {
            setMessages((prev) => {
              const hasAssistantMsg = prev.some((m) => m.id === assistantMsgId)
              if (hasAssistantMsg) {
                return prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, isStreaming: false } : m
                )
              }
              return [
                ...prev,
                {
                  id: assistantMsgId,
                  role: 'assistant',
                  content: 'Sorry, there was an error processing your request. Please try again.',
                  timestamp: new Date(),
                },
              ]
            })
          }
        } finally {
          setIsStreamingResponse(false)
          streamAbortRef.current = null
        }

        if (fullContent && sessionId) {
          // Ensure the streaming cursor is removed
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false } : m
            )
          )

          await api.addChatMessage(sessionId, 'assistant', fullContent)

          const currentSession = sessions.find((s) => s.id === sessionId)
          if (currentSession && currentSession.title === 'New Chat') {
            const newTitle = content.slice(0, 50) + (content.length > 50 ? '...' : '')
            await api.updateChatSession(sessionId, { title: newTitle })
            queryClient.invalidateQueries({ queryKey: ['chatSessions'] })
          }
        }
      } else {
        // Non-streaming (legacy) path
        chatMutation.mutate({
          model: selectedModel || 'llama3.2',
          messages: chatMessages,
        })
      }
    },
    [activeSessionId, messages, selectedModel, chatMutation, queryClient, streamingEnabled, sessions]
  )

  return (
    <div
      className={classNames(
        'flex border border-gray-200 overflow-hidden shadow-sm w-full',
        isInModal ? 'h-full rounded-lg' : 'h-screen'
      )}
    >
      <ChatSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSessionSelect={handleSessionSelect}
        onNewChat={handleNewChat}
        onClearHistory={handleClearHistory}
        isInModal={isInModal}
      />
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-6 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between h-[75px] flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            {activeSession?.title || 'New Chat'}
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="model-select" className="text-sm text-gray-600">
                Model:
              </label>
              {isLoadingModels ? (
                <div className="text-sm text-gray-500">Loading models...</div>
              ) : installedModels.length === 0 ? (
                <div className="text-sm text-red-600">No models installed</div>
              ) : (
                <select
                  id="model-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-desert-green focus:border-transparent bg-white"
                >
                  {installedModels.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name} ({formatBytes(model.size)})
                    </option>
                  ))}
                </select>
              )}
            </div>
            {isInModal && (
              <button
                onClick={() => {
                  if (onClose) {
                    onClose()
                  }
                }}
                className="rounded-lg hover:bg-gray-100 transition-colors"
              >
                <IconX className="h-6 w-6 text-gray-500" />
              </button>
            )}
          </div>
        </div>
        <ChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isStreamingResponse || chatMutation.isPending}
          chatSuggestions={chatSuggestions}
          chatSuggestionsEnabled={suggestionsEnabled}
          chatSuggestionsLoading={chatSuggestionsLoading}
          rewriteModelAvailable={rewriteModelAvailable}
        />
      </div>
    </div>
  )
}
