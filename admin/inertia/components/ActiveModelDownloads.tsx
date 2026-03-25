import useOllamaModelDownloads from '~/hooks/useOllamaModelDownloads'
import HorizontalBarChart from './HorizontalBarChart'
import StyledSectionHeader from './StyledSectionHeader'
import { useTranslation } from 'react-i18next'

interface ActiveModelDownloadsProps {
    withHeader?: boolean
}

const ActiveModelDownloads = ({ withHeader = false }: ActiveModelDownloadsProps) => {
    const { t } = useTranslation()
    const { downloads } = useOllamaModelDownloads()

    return (
        <>
            {withHeader && <StyledSectionHeader title={t('common.activeModelDownloads')} className="mt-12 mb-4" />}
            <div className="space-y-4">
                {downloads && downloads.length > 0 ? (
                    downloads.map((download) => (
                        <div
                            key={download.model}
                            className="bg-desert-white rounded-lg p-4 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow"
                        >
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
                        </div>
                    ))
                ) : (
                    <p className="text-text-muted">{t('common.noActiveModelDownloads')}</p>
                )}
            </div>
        </>
    )
}

export default ActiveModelDownloads
