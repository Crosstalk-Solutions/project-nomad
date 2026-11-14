import { useState } from 'react'
import { IconAlertTriangle, IconDownload } from '@tabler/icons-react'
import classNames from 'classnames'
import useDownloads from '~/hooks/useDownloads'
import { summarizeDownloads } from '~/lib/downloads_summary'
import ActiveDownloads from './ActiveDownloads'
import StyledModal from './StyledModal'

/**
 * App-wide floating indicator for queued and running downloads (ZIM files,
 * maps, AI models, drug data). Downloads keep running in the background when
 * you leave the page that started them; this makes them visible from any page.
 * Sits just above the AI chat button so floating actions stay in one corner,
 * and renders nothing while the queue is empty.
 */
export default function DownloadsIndicator() {
  const [open, setOpen] = useState(false)
  const { data: downloads } = useDownloads({})
  const { inProgress, failed, percent } = summarizeDownloads(downloads)

  if (inProgress === 0 && failed === 0 && !open) return null

  const label =
    inProgress > 0
      ? `${inProgress} ${inProgress === 1 ? 'download' : 'downloads'}${percent !== null ? ` · ${percent}%` : ''}`
      : `${failed} failed`

  return (
    <>
      {(inProgress > 0 || failed > 0) && (
        <button
          onClick={() => setOpen(true)}
          className={classNames(
            'fixed bottom-24 right-6 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 cursor-pointer',
            inProgress > 0
              ? 'bg-desert-green hover:bg-desert-green/90 focus:ring-desert-green'
              : 'bg-desert-red hover:bg-desert-red-dark focus:ring-desert-red'
          )}
          aria-label={`Show downloads: ${label}${inProgress > 0 && failed > 0 ? `, ${failed} failed` : ''}`}
        >
          {inProgress > 0 ? (
            <IconDownload className="h-5 w-5" />
          ) : (
            <IconAlertTriangle className="h-5 w-5" />
          )}
          <span>{label}</span>
          {inProgress > 0 && failed > 0 && (
            <span className="rounded-full bg-desert-red px-2 py-0.5 text-xs">{failed} failed</span>
          )}
        </button>
      )}
      <StyledModal
        open={open}
        title="Downloads"
        onClose={() => setOpen(false)}
        cancelText="Close"
        onCancel={() => setOpen(false)}
        large
      >
        <div className="max-h-[60vh] overflow-y-auto pr-1 text-left">
          {inProgress === 0 && failed === 0 ? (
            <p className="text-sm text-text-secondary">No downloads in progress.</p>
          ) : (
            <ActiveDownloads />
          )}
        </div>
      </StyledModal>
    </>
  )
}
