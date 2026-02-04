import { useState } from 'react'
import Footer from '~/components/Footer'
import ChatButton from '~/components/chat/ChatButton'
import ChatModal from '~/components/chat/ChatModal'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import { SERVICE_NAMES } from '../../constants/service_names'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false)
  const aiAssistantInstalled = useServiceInstalledStatus(SERVICE_NAMES.OLLAMA)

  return (
    <div className="min-h-screen flex flex-col">
      <div
        className="p-2 flex gap-2 flex-col items-center justify-center cursor-pointer"
        onClick={() => (window.location.href = '/home')}
      >
        <img src="/project_nomad_logo.png" alt="Project Nomad Logo" className="h-40 w-40" />
        <h1 className="text-5xl font-bold text-desert-green">Command Center</h1>
      </div>
      <hr className="text-desert-green font-semibold h-[1.5px] bg-desert-green border-none" />
      <div className="flex-1 w-full bg-desert">{children}</div>
      <Footer />

      {aiAssistantInstalled && (
        <>
          <ChatButton onClick={() => setIsChatOpen(true)} />
          <ChatModal open={isChatOpen} onClose={() => setIsChatOpen(false)} />
        </>
      )}
    </div>
  )
}
