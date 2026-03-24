import useEmbedJobs from '~/hooks/useEmbedJobs'
import HorizontalBarChart from './HorizontalBarChart'
import StyledSectionHeader from './StyledSectionHeader'
import { useTranslation } from 'react-i18next'

interface ActiveEmbedJobsProps {
  withHeader?: boolean
}

const ActiveEmbedJobs = ({ withHeader = false }: ActiveEmbedJobsProps) => {
  const { t } = useTranslation()
  const { data: jobs } = useEmbedJobs()

  return (
    <>
      {withHeader && (
        <StyledSectionHeader title={t('common.processingQueue')} className="mt-12 mb-4" />
      )}
      <div className="space-y-4">
        {jobs && jobs.length > 0 ? (
          jobs.map((job) => (
            <div
              key={job.jobId}
              className="bg-desert-white rounded-lg p-4 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow"
            >
              <HorizontalBarChart
                items={[
                  {
                    label: job.fileName,
                    value: job.progress,
                    total: '100%',
                    used: `${job.progress}%`,
                    type: job.status,
                  },
                ]}
              />
            </div>
          ))
        ) : (
          <p className="text-text-muted">{t('common.noFilesProcessing')}</p>
        )}
      </div>
    </>
  )
}

export default ActiveEmbedJobs
