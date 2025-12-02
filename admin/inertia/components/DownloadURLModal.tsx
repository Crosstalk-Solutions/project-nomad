import { useState } from 'react'
import StyledModal, { StyledModalProps } from './StyledModal'
import Input from './inputs/Input'
import api from '~/lib/api'

export type DownloadURLModalProps = Omit<
  StyledModalProps,
  'onConfirm' | 'open' | 'confirmText' | 'cancelText' | 'confirmVariant' | 'children'
> & {
  suggestedURL?: string
  onPreflightSuccess?: (url: string) => void
}

const DownloadURLModal: React.FC<DownloadURLModalProps> = ({
  suggestedURL,
  onPreflightSuccess,
  ...modalProps
}) => {
  const [url, setUrl] = useState<string>(suggestedURL || '')
  const [messages, setMessages] = useState<string[]>([])
  const [passedPreflight, setPassedPreflight] = useState<boolean>(false)

  async function runPreflightCheck(downloadUrl: string) {
    try {
      setMessages([`Running preflight check for URL: ${downloadUrl}`])
      const res = await api.downloadRemoteMapRegionPreflight(downloadUrl)
      if ('message' in res) {
        throw new Error(res.message)
      }

      setMessages((prev) => [
        ...prev,
        `Preflight check passed. Filename: ${res.filename}, Size: ${(res.size / (1024 * 1024)).toFixed(2)} MB`,
      ])
      setPassedPreflight(true)
    } catch (error) {
      console.error('Preflight check failed:', error)
      setMessages((prev) => [...prev, `Preflight check failed: ${error.message}`])
      setPassedPreflight(false)
    }
  }

  return (
    <StyledModal
      {...modalProps}
      onConfirm={() => runPreflightCheck(url)}
      open={true}
      confirmText="Download"
      confirmIcon="ArrowDownTrayIcon"
      cancelText="Cancel"
      confirmVariant="primary"
      large
    >
      <div className="flex flex-col pb-4">
        <p className="text-gray-700 mb-8">
          Enter the URL of the map region file you wish to download. The URL must be publicly
          reachable and end with .pmtiles. A preflight check will be run to verify the file's
          availability, type, and approximate size.
        </p>
        <Input
          name="download-url"
          label=""
          placeholder={suggestedURL || 'Enter download URL...'}
          className="mb-4"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="min-h-24 max-h-96 overflow-y-auto bg-gray-50 p-4 rounded border border-gray-300 text-left">
          {messages.map((message, idx) => (
            <p
              key={idx}
              className="text-sm text-gray-900 font-mono leading-relaxed break-words mb-3"
            >
              {message}
            </p>
          ))}
        </div>
      </div>
    </StyledModal>
  )
}

export default DownloadURLModal
