import classNames from '~/lib/classNames'
import StyledButton from '../StyledButton'
import { router, usePage } from '@inertiajs/react'
import { ChatSession } from '../../../types/chat'
import { IconMessage } from '@tabler/icons-react'
import { useState } from 'react'
import KnowledgeBaseModal from './KnowledgeBaseModal'
import NomadMdModal from './NomadMdModal'
import DeleteChatFlame from './DeleteChatFlame'
import { CHAT_ROW_TRAILING_CONTROLS } from './delete_chat'

interface ChatSidebarProps {
  sessions: ChatSession[]
  activeSessionId: string | null
  onSessionSelect: (id: string) => void
  onNewChat: () => void
  onDeleteChat: (chat: { id: string; title: string }) => void
  deleteBusy?: boolean
  onClearHistory: () => void
  isInModal?: boolean
  isMobileOpen?: boolean
  onMobileClose?: () => void
}

export default function ChatSidebar({
  sessions,
  activeSessionId,
  onSessionSelect,
  onNewChat,
  onDeleteChat,
  deleteBusy = false,
  onClearHistory,
  isInModal = false,
  isMobileOpen = false,
  onMobileClose,
}: ChatSidebarProps) {
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props
  const [isKnowledgeBaseModalOpen, setIsKnowledgeBaseModalOpen] = useState(
    () => new URLSearchParams(window.location.search).get('knowledge_base') === 'true'
  )
  const [isNomadMdModalOpen, setIsNomadMdModalOpen] = useState(false)

  function handleCloseKnowledgeBase() {
    setIsKnowledgeBaseModalOpen(false)
    const params = new URLSearchParams(window.location.search)
    if (params.has('knowledge_base')) {
      params.delete('knowledge_base')
      const newUrl = [window.location.pathname, params.toString()].filter(Boolean).join('?')
      window.history.replaceState(window.history.state, '', newUrl)
    }
  }

  return (
    <aside
      id="chat-sidebar"
      className={classNames(
        'w-64 bg-surface-secondary border-r border-border-subtle flex-col h-full shrink-0',
        'fixed inset-y-0 left-0 z-50 md:static md:z-auto md:flex',
        isMobileOpen ? 'flex' : 'hidden'
      )}
      aria-label="Chat conversations"
    >
      <div className="p-4 border-b border-border-subtle h-[75px] flex items-center justify-center">
        <StyledButton
          onClick={() => {
            onNewChat()
            onMobileClose?.()
          }}
          icon="IconPlus"
          variant="primary"
          fullWidth
        >
          New Chat
        </StyledButton>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-text-muted text-sm">No previous chats</div>
        ) : (
          <div className="p-2 space-y-1">
            {sessions.map((session) => {
              const isActive = activeSessionId === session.id
              return (
                <div
                  key={session.id}
                  className={classNames(
                    'flex items-start rounded-lg transition-colors',
                    isActive
                      ? 'bg-desert-green text-white'
                      : 'hover:bg-surface-secondary text-text-primary'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSessionSelect(session.id)
                      onMobileClose?.()
                    }}
                    className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-desert-green"
                  >
                    <IconMessage
                      className={classNames(
                        'mt-0.5 h-5 w-5 shrink-0',
                        isActive ? 'text-white' : 'text-text-muted'
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{session.title}</span>
                      {session.lastMessage && (
                        <span
                          className={classNames(
                            'mt-0.5 block truncate text-xs',
                            isActive ? 'text-white/80' : 'text-text-muted'
                          )}
                        >
                          {session.lastMessage}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-start pr-1 pt-1">
                    {CHAT_ROW_TRAILING_CONTROLS.map((control) =>
                      control === 'delete-chat' ? (
                        <DeleteChatFlame
                          key={control}
                          active={isActive}
                          disabled={deleteBusy}
                          onDelete={() => onDeleteChat({ id: session.id, title: session.title })}
                        />
                      ) : null
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col items-center justify-center gap-y-2">
        <img src="/nomad-primary.svg" alt="Project NOMAD Logo" className="h-28 w-28 mb-6 object-contain" />
        <StyledButton
          onClick={() => {
            // /chat is served by the admin app itself, so navigate in place rather than
            // spawning a window. Popping out broke anyone running NOMAD as an installed
            // web app or in kiosk mode, who then had a stray window to get back out of.
            router.visit(isInModal ? '/chat' : '/home')
          }}
          icon={isInModal ? 'IconArrowRight' : 'IconHome'}
          variant="outline"
          size="sm"
          fullWidth
        >
          {isInModal ? 'Open Full Chat' : 'Back to Home'}
        </StyledButton>
        <StyledButton
          onClick={() => {
            router.visit('/settings/models')
          }}
          icon="IconDatabase"
          variant="primary"
          size="sm"
          fullWidth
        >
          Models & Settings
        </StyledButton>
        <StyledButton
          onClick={() => {
            setIsKnowledgeBaseModalOpen(true)
          }}
          icon="IconBrain"
          variant="primary"
          size="sm"
          fullWidth
        >
          Knowledge Base
        </StyledButton>
        <StyledButton
          onClick={() => {
            setIsNomadMdModalOpen(true)
          }}
          icon="IconFileDescription"
          variant="primary"
          size="sm"
          fullWidth
        >
          NOMAD.md
        </StyledButton>
        {sessions.length > 0 && (
          <StyledButton
            onClick={onClearHistory}
            icon="IconTrash"
            variant="danger"
            size="sm"
            fullWidth
          >
            Clear History
          </StyledButton>
        )}
      </div>
      {isKnowledgeBaseModalOpen && (
        <KnowledgeBaseModal aiAssistantName={aiAssistantName} onClose={handleCloseKnowledgeBase} />
      )}
      {isNomadMdModalOpen && (
        <NomadMdModal
          aiAssistantName={aiAssistantName}
          onClose={() => setIsNomadMdModalOpen(false)}
        />
      )}
    </aside>
  )
}
