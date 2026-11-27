import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import Chat from './index'
import useChatViewport from './use_chat_viewport'
import { useSystemSetting } from '~/hooks/useSystemSetting'
import { parseBoolean } from '../../../app/utils/misc'

interface ChatModalProps {
  open: boolean
  onClose: () => void
}

export default function ChatModal({ open, onClose }: ChatModalProps) {
  const viewportRef = useChatViewport(open)
  const settings = useSystemSetting({
    key: "chat.suggestionsEnabled"
  })

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
      />

      <div
        ref={viewportRef}
        className="fixed inset-x-0 top-[var(--chat-viewport-top,0px)] flex h-[var(--chat-viewport-height,100dvh)] items-center justify-center p-1 sm:p-4"
      >
        <DialogPanel
          transition
          className="relative bg-surface-primary rounded-xl shadow-2xl w-full max-w-7xl h-full sm:h-[85%] flex overflow-hidden transition-all data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
        >
          <Chat enabled={open} isInModal onClose={onClose} suggestionsEnabled={parseBoolean(settings.data?.value)} />
        </DialogPanel>
      </div>
    </Dialog>
  )
}
