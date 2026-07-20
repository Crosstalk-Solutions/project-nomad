import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ChatSidebar from './ChatSidebar'
import ChatInterface from './ChatInterface'
import KbPolicyPromptBanner from './KbPolicyPromptBanner'
import StyledModal from '../StyledModal'
import api from '~/lib/api'
import { formatBytes } from '~/lib/util'
import { useModals } from '~/context/ModalContext'
import { ChatMessage } from '../../../types/chat'
import classNames from '~/lib/classNames'
import { IconMenu2, IconX } from '@tabler/icons-react'
import { DEFAULT_QUERY_REWRITE_MODEL } from '../../../constants/ollama'
import { useSystemSetting } from '~/hooks/useSystemSetting'
import Switch from '~/components/inputs/Switch'
import InfoTooltip from '~/components/InfoTooltip'

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
  const [collectionFilter, setCollectionFilter] = useState<string>('')
  const [pendingModelSwitch, setPendingModelSwitch] = useState<string | null>(null)
  const pageLoadNormalizedRef = useRef(false)
  const [isStreamingResponse, setIsStreamingResponse] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const streamAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!isMobileSidebarOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileSidebarOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isMobileSidebarOpen])

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

  const { data: lastModelSetting } = useSystemSetting({ key: 'chat.lastModel', enabled })
  const { data: remoteOllamaUrlSetting } = useSystemSetting({ key: 'ai.remoteOllamaUrl', enabled })
  const { data: autoThinkingSetting } = useSystemSetting({ key: 'ai.autoThinking', enabled })
  // Global default for models the user hasn't explicitly toggled. Coerce defensively — KV
  // booleans have historically round-tripped as strings.
  const autoThinkingDefault =
    autoThinkingSetting?.value === true || autoThinkingSetting?.value === 'true'

  const { data: remoteStatus } = useQuery({
    queryKey: ['remoteOllamaStatus'],
    queryFn: () => api.getRemoteOllamaStatus(),
    enabled: enabled && !!remoteOllamaUrlSetting?.value,
    refetchInterval: 15000,
  })

  const { data: installedModels = [], isLoading: isLoadingModels } = useQuery({
    queryKey: ['installedModels'],
    queryFn: () => api.getInstalledModels(),
    enabled,
    select: (data) => data || [],
  })

  const { data: knownCollections = [] } = useQuery({
    queryKey: ['kbCollections'],
    queryFn: () => api.getKnowledgeCollections(),
    select: (data) => data?.collections ?? [],
  })

  // Per-model thinking overrides, remembered client-side (localStorage, keyed by model name).
  // An entry here means the user explicitly toggled thinking for that model; absent means fall
  // back to the global default (ai.autoThinking). Seeded from localStorage when models load.
  const [thinkingOverrides, setThinkingOverrides] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const next: Record<string, boolean> = {}
    for (const m of installedModels) {
      try {
        const stored = localStorage.getItem(`nomad:thinking:${m.name}`)
        if (stored !== null) next[m.name] = stored === 'true'
      } catch {}
    }
    setThinkingOverrides(next)
  }, [installedModels])

  const selectedModelSupportsThinking =
    installedModels.find((m) => m.name === selectedModel)?.thinking === true

  // Effective thinking preference for a model: explicit override wins, else the global default.
  const effectiveThinking = useCallback(
    (model: string): boolean =>
      model in thinkingOverrides ? thinkingOverrides[model] : autoThinkingDefault,
    [thinkingOverrides, autoThinkingDefault]
  )

  const setModelThinking = useCallback((model: string, value: boolean) => {
    setThinkingOverrides((prev) => ({ ...prev, [model]: value }))
    try {
      localStorage.setItem(`nomad:thinking:${model}`, String(value))
    } catch {}
  }, [])

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
    return installedModels.some((model) => model.name === DEFAULT_QUERY_REWRITE_MODEL)
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
      sessionId?: number
      think?: boolean
      collection?: string
    }) => api.sendChatMessage({ ...request, stream: false }),
    onSuccess: async (data) => {
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

      // Refresh sessions to pick up backend-persisted messages and title
      queryClient.invalidateQueries({ queryKey: ['chatSessions'] })
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['chatSessions'] }), 3000)
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

  // Set default model: prefer last used model, fall back to first installed if last model not available
  useEffect(() => {
    if (installedModels.length > 0 && !selectedModel) {
      const lastModel = lastModelSetting?.value as string | undefined
      if (lastModel && installedModels.some((m) => m.name === lastModel)) {
        setSelectedModel(lastModel)
      } else {
        setSelectedModel(installedModels[0].name)
      }
    }
  }, [installedModels, selectedModel, lastModelSetting])

  // Persist model selection
  useEffect(() => {
    if (selectedModel) {
      api.updateSetting('chat.lastModel', selectedModel)
    }
  }, [selectedModel])

  // Page-load normalization: enforce the "one chat model at a time" invariant
  // when the chat page first mounts. Anything stacked from a prior session
  // gets `keep_alive: 0` so it can be evicted; the embedding model is exempt
  // server-side. We wait for `selectedModel` to be populated by the
  // first-installed / lastModel effect so the request has a target to preserve.
  useEffect(() => {
    if (!enabled) return
    if (!selectedModel) return
    if (pageLoadNormalizedRef.current) return
    pageLoadNormalizedRef.current = true
    api.unloadChatModels(selectedModel).catch((err) => {
      console.warn('Failed to normalize loaded models on chat-page mount:', err)
    })
  }, [enabled, selectedModel])

  const handleUserSelectedModel = useCallback(
    (newModel: string) => {
      if (newModel === selectedModel) return
      // No active chat session yet → no conversation to lose, no popup needed.
      // Just update the dropdown silently; the next "New Chat" will use it.
      if (!activeSessionId) {
        setSelectedModel(newModel)
        return
      }
      // Active session: defer the actual model swap until the user confirms.
      // Setting `pendingModelSwitch` drives the dropdown's effective value
      // *and* opens the confirm modal — clearing it on cancel reverts the
      // visible selection without us having to touch `selectedModel`.
      setPendingModelSwitch(newModel)
    },
    [selectedModel, activeSessionId]
  )

  const handleConfirmModelSwitch = useCallback(async () => {
    const newModel = pendingModelSwitch
    if (!newModel) return
    // Best-effort unload of the previously-active chat model. Fire-and-forget:
    // Ollama queues the eviction until the runner is idle, so an in-flight
    // request on the old model finishes cleanly. We don't await this before
    // clearing the session — UI responsiveness wins over housekeeping.
    api.unloadChatModels(newModel).catch((err) => {
      console.warn('Failed to unload previous chat model:', err)
    })
    setSelectedModel(newModel)
    setPendingModelSwitch(null)
    // Clear the active session and messages — the next user message will
    // lazily create a new session via the existing handleSendMessage path,
    // which already calls api.createChatSession with `selectedModel`.
    setActiveSessionId(null)
    setMessages([])
  }, [pendingModelSwitch])

  const handleCancelModelSwitch = useCallback(() => {
    setPendingModelSwitch(null)
  }, [])

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
        <p className="text-text-primary">
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

      // Enforce the one-chat-model-at-a-time invariant: ask the backend to
      // unload anything that isn't the target session's model. Fire-and-forget;
      // this is housekeeping. Note we pass the *session's* model here rather
      // than reading `selectedModel`, because setSelectedModel above is async
      // and the effect-driven page-load normalize wouldn't catch a sidebar
      // click after the first render.
      const targetModel = sessionData?.model ?? selectedModel ?? null
      api.unloadChatModels(targetModel).catch((err) => {
        console.warn('Failed to unload non-target chat models on session switch:', err)
      })
    },
    [installedModels, queryClient, selectedModel]
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
            {
              model: selectedModel || 'llama3.2',
              messages: chatMessages,
              stream: true,
              sessionId: sessionId ? Number(sessionId) : undefined, think: effectiveThinking(selectedModel),
              collection: collectionFilter || undefined,
            },
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
                    thinkingDuration = Math.max(
                      1,
                      Math.round((Date.now() - thinkingStartTime) / 1000)
                    )
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
                return prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m))
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
            prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m))
          )

          // Refresh sessions to pick up backend-persisted messages and title
          queryClient.invalidateQueries({ queryKey: ['chatSessions'] })
          setTimeout(() => queryClient.invalidateQueries({ queryKey: ['chatSessions'] }), 3000)
        }
      } else {
        // Non-streaming (legacy) path
        chatMutation.mutate({
          model: selectedModel || 'llama3.2',
          messages: chatMessages,
          sessionId: sessionId ? Number(sessionId) : undefined,
          think: effectiveThinking(selectedModel),
          collection: collectionFilter || undefined,
        })
      }
    },
    [activeSessionId, messages, selectedModel, collectionFilter, chatMutation, queryClient, streamingEnabled, effectiveThinking]
  )

  return (
    <>
      {pendingModelSwitch && (
        <StyledModal
          title={`Switch to ${pendingModelSwitch}?`}
          onConfirm={handleConfirmModelSwitch}
          onCancel={handleCancelModelSwitch}
          open={true}
          confirmText="Switch & New Chat"
          cancelText="Cancel"
          confirmVariant="primary"
        >
          <p className="text-text-primary">
            Switching to <strong>{pendingModelSwitch}</strong> will start a new chat. Your current
            conversation stays available in the sidebar.
          </p>
        </StyledModal>
      )}
      <div
        className={classNames(
          'flex border border-border-subtle overflow-hidden shadow-sm w-full',
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
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
        />
        {isMobileSidebarOpen && (
          <button
            type="button"
            aria-label="Close conversation sidebar"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <KbPolicyPromptBanner />
          <div className="px-3 sm:px-6 py-3 border-b border-border-subtle bg-surface-secondary flex flex-wrap items-center justify-between gap-2 min-h-[75px] flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                className="rounded-lg p-1.5 hover:bg-surface-primary focus:outline-none focus:ring-2 focus:ring-desert-green md:hidden"
                aria-label="Open conversation sidebar"
                aria-controls="chat-sidebar"
                aria-expanded={isMobileSidebarOpen}
                onClick={() => setIsMobileSidebarOpen(true)}
              >
                <IconMenu2 className="h-6 w-6 text-text-muted" aria-hidden="true" />
              </button>
              <h2 className="text-lg font-semibold text-text-primary truncate">
                {activeSession?.title || 'New Chat'}
              </h2>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              {remoteOllamaUrlSetting?.value && (
                <span
                  className={classNames(
                    'text-xs rounded px-2 py-1 font-medium',
                    remoteStatus?.connected === false
                      ? 'text-red-700 bg-red-50 border border-red-200'
                      : 'text-green-700 bg-green-50 border border-green-200'
                  )}
                >
                  {remoteStatus?.connected === false ? 'Remote Disconnected' : 'Remote Connected'}
                </span>
              )}
              <div className="flex items-center gap-2">
              <label htmlFor="collection-select" className="text-sm text-text-secondary">
                Search in:
              </label>
              <select
                id="collection-select"
                value={collectionFilter}
                onChange={(e) => setCollectionFilter(e.target.value)}
                className="px-3 py-1.5 border border-border-default rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-desert-green focus:border-transparent bg-surface-primary"
              >
                <option value="">All</option>
                {knownCollections.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 min-w-0">
                <label htmlFor="model-select" className="text-sm text-text-secondary">
                  Model:
                </label>
                {isLoadingModels ? (
                  <div className="text-sm text-text-muted">Loading models...</div>
                ) : installedModels.length === 0 ? (
                  <div className="text-sm text-red-600">No models installed</div>
                ) : (
                  <select
                    id="model-select"
                    value={pendingModelSwitch ?? selectedModel}
                    onChange={(e) => handleUserSelectedModel(e.target.value)}
                    className="min-w-0 max-w-44 sm:max-w-none px-2 sm:px-3 py-1.5 border border-border-default rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-desert-green focus:border-transparent bg-surface-primary"
                  >
                    {installedModels.map((model) => (
                      <option key={model.name} value={model.name}>
                        {model.name}
                        {model.size > 0 ? ` (${formatBytes(model.size)})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {selectedModelSupportsThinking && (
              <div className="flex items-center">
                <span className="text-sm text-text-secondary select-none">Thinking:</span>
                <InfoTooltip
                  position="bottom"
                  align="right"
                  text="When on, this model works through its reasoning before answering. Slower, but often better on tricky questions. Your choice is remembered for this model; the default for other models is set in AI Assistant settings."
                />
                <Switch
                  id="chat-thinking-toggle"
                  checked={effectiveThinking(selectedModel)}
                  onChange={(v) => setModelThinking(selectedModel, v)}
                />
              </div>
            )}
            {isInModal && (
                <button
                  type="button"
                  aria-label="Close chat"
                  onClick={() => {
                    if (onClose) {
                      onClose()
                    }
                  }}
                  className="rounded-lg hover:bg-surface-secondary transition-colors"
                >
                  <IconX className="h-6 w-6 text-text-muted" aria-hidden="true" />
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
    </>
  )
}
