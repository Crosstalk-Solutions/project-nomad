import classNames from '~/lib/classNames'
import StyledButton from '../StyledButton'
import { router } from '@inertiajs/react'
import { ChatSession } from '../../../types/chat'
import { IconMessage } from '@tabler/icons-react'

interface ChatSidebarProps {
  sessions: ChatSession[]
  activeSessionId: string | null
  onSessionSelect: (id: string) => void
  onNewChat: () => void
  onClearHistory: () => void
  isInModal?: boolean
}

export default function ChatSidebar({
  sessions,
  activeSessionId,
  onSessionSelect,
  onNewChat,
  onClearHistory,
  isInModal = false,
}: ChatSidebarProps) {
  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 h-[75px] flex items-center justify-center">
        <StyledButton onClick={onNewChat} icon="IconPlus" variant="primary" fullWidth>
          New Chat
        </StyledButton>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">No previous chats</div>
        ) : (
          <div className="p-2 space-y-1">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onSessionSelect(session.id)}
                className={classNames(
                  'w-full text-left px-3 py-2 rounded-lg transition-colors group',
                  activeSessionId === session.id
                    ? 'bg-desert-green text-white'
                    : 'hover:bg-gray-200 text-gray-700'
                )}
              >
                <div className="flex items-start gap-2">
                  <IconMessage
                    className={classNames(
                      'h-5 w-5 mt-0.5 flex-shrink-0',
                      activeSessionId === session.id ? 'text-white' : 'text-gray-400'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{session.title}</div>
                    {session.lastMessage && (
                      <div
                        className={classNames(
                          'text-xs truncate mt-0.5',
                          activeSessionId === session.id ? 'text-white/80' : 'text-gray-500'
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
        <img src="/project_nomad_logo.png" alt="Project Nomad Logo" className="h-28 w-28 mb-6" />
        <StyledButton
          onClick={() => {
            if (isInModal) {
              window.open('/chat', '_blank')
            } else {
              router.visit('/home')
            }
          }}
          icon={isInModal ? 'IconExternalLink' : 'IconHome'}
          variant="outline"
          size="sm"
          fullWidth
        >
          {isInModal ? 'Open in New Tab' : 'Back to Home'}
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
          Models
        </StyledButton>
        <StyledButton
          onClick={() => {
            router.visit('/knowledge-base')
          }}
          icon="IconBrain"
          variant="primary"
          size="sm"
          fullWidth
        >
          Knowledge Base
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
    </div>
  )
}
