import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import Chat from './index'

interface ChatModalProps {
  open: boolean
  onClose: () => void
}

export default function ChatModal({ open, onClose }: ChatModalProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
      />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="relative bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[85vh] flex overflow-hidden transition-all data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
        >
          <Chat enabled={open} isInModal onClose={onClose} />
        </DialogPanel>
      </div>
    </Dialog>
  )
}
