import { Head } from '@inertiajs/react'
import ChatComponent from '~/components/chat'

export default function Chat() {
  return (
    <div className="w-full h-full">
      <Head title="AI Assistant" />
      <ChatComponent enabled={true} />
    </div>
  )
}
