import classNames from '~/lib/classNames'
import StyledButton from '../StyledButton'
import { router, usePage } from '@inertiajs/react'
import { ChatSession } from '../../../types/chat'
import { IconMessage } from '@tabler/icons-react'
import { useState } from 'react'
import KnowledgeBaseModal from './KnowledgeBaseModal'
import NomadMdModal from './NomadMdModal'

interface ChatSidebarProps {
  sessions: ChatSession[]
  activeSessionId: string | null
  onSessionSelect: (id: string) => void
  onNewChat: () => void
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
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => {
                  onSessionSelect(session.id)
                  onMobileClose?.()
                }}
                className={classNames(
                  'w-full text-left px-3 py-2 rounded-lg transition-colors group',
                  activeSessionId === session.id
                    ? 'bg-desert-green text-white'
                    : 'hover:bg-surface-secondary text-text-primary'
                )}
              >
                <div className="flex items-start gap-2">
                  <IconMessage
                    className={classNames(
                      'h-5 w-5 mt-0.5 shrink-0',
                      activeSessionId === session.id ? 'text-white' : 'text-text-muted'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{session.title}</div>
                    {session.lastMessage && (
                      <div
                        className={classNames(
                          'text-xs truncate mt-0.5',
                          activeSessionId === session.id ? 'text-white/80' : 'text-text-muted'
                        )}
                      >
                        {session.lastMessage}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col items-center justify-center gap-y-2">
        <img src="/project_nomad_logo.webp" alt="Project NOMAD Logo" className="h-28 w-28 mb-6" />
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
