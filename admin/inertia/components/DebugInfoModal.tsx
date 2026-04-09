import { useEffect, useState } from 'react'
import { IconBug, IconCopy, IconCheck } from '@tabler/icons-react'
import StyledModal from './StyledModal'
import api from '~/lib/api'

interface DebugInfoModalProps {
  open: boolean
  onClose: () => void
}

export default function DebugInfoModal({ open, onClose }: DebugInfoModalProps) {
  const [debugText, setDebugText] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    setCopied(false)

    api.getDebugInfo().then((text) => {
      if (text) {
        const browserLine = `Browser: ${navigator.userAgent}`
        setDebugText(text + '\n' + browserLine)
      } else {
        setDebugText('Failed to load debug info. Please try again.')
      }
      setLoading(false)
    }).catch(() => {
      setDebugText('Failed to load debug info. Please try again.')
      setLoading(false)
    })
  }, [open])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(debugText)
    } catch {
      // Fallback for older browsers
      const textarea = document.querySelector<HTMLTextAreaElement>('#debug-info-text')
      if (textarea) {
        textarea.select()
        document.execCommand('copy')
      }
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <StyledModal
      open={open}
      onClose={onClose}
      title="Debug Info"
      icon={<IconBug className="size-8 text-desert-green" />}
      cancelText="Close"
      onCancel={onClose}
    >
      <p className="text-sm text-gray-500 mb-3 text-left">
        This is non-sensitive system info you can share when reporting issues.
        No passwords, IPs, or API keys are included.
      </p>

      <textarea
        id="debug-info-text"
        readOnly
        value={loading ? 'Loading...' : debugText}
        rows={18}
        className="w-full font-mono text-xs text-black bg-gray-50 border border-gray-200 rounded-md p-3 resize-none focus:outline-none text-left"
      />

      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={handleCopy}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-desert-green px-3 py-1.5 text-sm font-semibold text-white hover:bg-desert-green-dark transition-colors disabled:opacity-50"
        >
          {copied ? (
            <>
              <IconCheck className="size-4" />
              Copied!
            </>
          ) : (
            <>
              <IconCopy className="size-4" />
              Copy to Clipboard
            </>
          )}
        </button>

        <a
          href="https://github.com/flynnty/project-nomad/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-desert-green hover:underline"
        >
          Open a GitHub Issue
        </a>
      </div>
    </StyledModal>
  )
}
