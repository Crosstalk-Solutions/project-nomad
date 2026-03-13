import { useState } from 'react'
import { usePage } from '@inertiajs/react'
import { UsePageProps } from '../../types/system'
import { IconBug } from '@tabler/icons-react'
import DebugInfoModal from './DebugInfoModal'

export default function Footer() {
  const { appVersion } = usePage().props as unknown as UsePageProps
  const [debugModalOpen, setDebugModalOpen] = useState(false)

  return (
    <footer>
      <div className="flex justify-center items-center gap-3 border-t border-gray-900/10 py-4">
        <p className="text-sm/6 text-gray-600">
          Project N.O.M.A.D. Command Center v{appVersion}
        </p>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => setDebugModalOpen(true)}
          className="text-sm/6 text-gray-500 hover:text-desert-green flex items-center gap-1 cursor-pointer"
        >
          <IconBug className="size-3.5" />
          Debug Info
        </button>
      </div>
      <DebugInfoModal open={debugModalOpen} onClose={() => setDebugModalOpen(false)} />
    </footer>
  )
}
