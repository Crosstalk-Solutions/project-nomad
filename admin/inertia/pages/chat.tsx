import { Head, usePage } from '@inertiajs/react'
import ChatComponent from '~/components/chat'
import useChatViewport from '~/components/chat/use_chat_viewport'

export default function Chat(props: { settings: { chatSuggestionsEnabled: boolean } }) {
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props
  const viewportRef = useChatViewport(true)
  return (
    <div ref={viewportRef} className="w-full h-[var(--chat-viewport-height,100dvh)]">
      <Head title={aiAssistantName} />
      <ChatComponent enabled={true} suggestionsEnabled={props.settings.chatSuggestionsEnabled} />
    </div>
  )
}
