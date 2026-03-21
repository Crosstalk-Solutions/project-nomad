import useOllamaModelDownloads from '~/hooks/useOllamaModelDownloads'
import HorizontalBarChart from './HorizontalBarChart'
import StyledSectionHeader from './StyledSectionHeader'
import { IconAlertTriangle } from '@tabler/icons-react'

interface ActiveModelDownloadsProps {
    withHeader?: boolean
}

const ActiveModelDownloads = ({ withHeader = false }: ActiveModelDownloadsProps) => {
    const { downloads } = useOllamaModelDownloads()

    return (
        <>
            {withHeader && <StyledSectionHeader title="Active Model Downloads" className="mt-12 mb-4" />}
            <div className="space-y-4">
                {downloads && downloads.length > 0 ? (
                    downloads.map((download) => (
                        <div
                            key={download.model}
                            className={`bg-desert-white rounded-lg p-4 border shadow-sm hover:shadow-lg transition-shadow ${
                                download.error ? 'border-red-400' : 'border-desert-stone-light'
                            }`}
                        >
                            {download.error ? (
                                <div className="flex items-start gap-3">
                                    <IconAlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
                                    <div>
                                        <p className="font-medium text-text-primary">{download.model}</p>
                                        <p className="text-sm text-red-600 mt-1">{download.error}</p>
                                    </div>
                                </div>
                            ) : (
                                <HorizontalBarChart
                                    items={[
                                        {
                                            label: download.model,
                                            value: download.percent,
                                            total: '100%',
                                            used: `${download.percent.toFixed(1)}%`,
                                            type: 'ollama-model',
                                        },
                                    ]}
                                />
                            )}
                        </div>
                    ))
                ) : (
                    <p className="text-text-muted">No active model downloads</p>
                )}
            </div>
        </>
    )
}

export default ActiveModelDownloads
