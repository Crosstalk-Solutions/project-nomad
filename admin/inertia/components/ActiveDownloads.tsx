import useDownloads, { useDownloadsProps } from '~/hooks/useDownloads'
import HorizontalBarChart from './HorizontalBarChart'
import { extractFileName } from '~/lib/util'
import StyledSectionHeader from './StyledSectionHeader'
import { IconAlertTriangle, IconX } from '@tabler/icons-react'
import api from '~/lib/api'
import { useState } from 'react'

interface ActiveDownloadProps {
  filetype?: useDownloadsProps['filetype']
  withHeader?: boolean
}

const ActiveDownloads = ({ filetype, withHeader = false }: ActiveDownloadProps) => {
  const { data: downloads, invalidate } = useDownloads({ filetype })
  const [cancelling, setCancelling] = useState<Set<string>>(new Set())

  const handleRemove = async (jobId: string) => {
    setCancelling((prev) => new Set(prev).add(jobId))
    await api.removeDownloadJob(jobId)
    // Retry after a short delay in case the job was locked
    await new Promise((r) => setTimeout(r, 1000))
    await api.removeDownloadJob(jobId).catch(() => {})
    invalidate()
    setCancelling((prev) => {
      const next = new Set(prev)
      next.delete(jobId)
      return next
    })
  }

  return (
    <>
      {withHeader && <StyledSectionHeader title="Active Downloads" className="mt-12 mb-4" />}
      <div className="space-y-4">
        {downloads && downloads.length > 0 ? (
          downloads.map((download) => (
            <div
              key={download.jobId}
              className={`bg-desert-white rounded-lg p-4 border shadow-sm hover:shadow-lg transition-shadow ${
                download.status === 'failed'
                  ? 'border-red-300'
                  : 'border-desert-stone-light'
              }`}
            >
              {download.status === 'failed' ? (
                <div className="flex items-center gap-2">
                  <IconAlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {extractFileName(download.filepath) || download.url}
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">
                      Download failed{download.failedReason ? `: ${download.failedReason}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemove(download.jobId)}
                    className="flex-shrink-0 p-1 rounded hover:bg-red-100 transition-colors"
                    title="Dismiss failed download"
                  >
                    <IconX className="w-4 h-4 text-red-400 hover:text-red-600" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <HorizontalBarChart
                      items={[
                        {
                          label: extractFileName(download.filepath) || download.url,
                          value: download.progress,
                          total: '100%',
                          used: `${download.progress}%`,
                          type: download.filetype,
                        },
                      ]}
                    />
                  </div>
                  <button
                    onClick={() => handleRemove(download.jobId)}
                    disabled={cancelling.has(download.jobId)}
                    className="flex-shrink-0 p-1 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
                    title="Cancel download"
                  >
                    <IconX className="w-4 h-4 text-gray-400 hover:text-red-600" />
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="text-text-muted">No active downloads</p>
        )}
      </div>
    </>
  )
}

export default ActiveDownloads
