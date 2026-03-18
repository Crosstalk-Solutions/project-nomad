import useDownloads, { useDownloadsProps } from '~/hooks/useDownloads'
import HorizontalBarChart from './HorizontalBarChart'
import { extractFileName } from '~/lib/util'
import StyledSectionHeader from './StyledSectionHeader'
import { IconAlertTriangle } from '@tabler/icons-react'

interface ActiveDownloadProps {
  filetype?: useDownloadsProps['filetype']
  withHeader?: boolean
}

const ActiveDownloads = ({ filetype, withHeader = false }: ActiveDownloadProps) => {
  const { data: downloads } = useDownloads({ filetype })

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
                </div>
              ) : (
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
