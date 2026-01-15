import useDownloads, { useDownloadsProps } from '~/hooks/useDownloads'
import HorizontalBarChart from './HorizontalBarChart'
import { extractFileName } from '~/lib/util'
import StyledSectionHeader from './StyledSectionHeader'

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
            <div className="bg-desert-white rounded-lg p-4 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
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
          ))
        ) : (
          <p className="text-gray-500">No active downloads</p>
        )}
      </div>
    </>
  )
}

export default ActiveDownloads
