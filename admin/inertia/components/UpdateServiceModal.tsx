import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ServiceSlim } from "../../types/services"
import StyledModal from "./StyledModal"
import { IconArrowUp } from "@tabler/icons-react"
import api from "~/lib/api"


interface UpdateServiceModalProps {
    record: ServiceSlim
    currentTag: string
    latestVersion: string
    onCancel: () => void
    onUpdate: (version: string) => void
    showError: (msg: string) => void
}

export default function UpdateServiceModal({
    record,
    currentTag,
    latestVersion,
    onCancel,
    onUpdate,
    showError,
}: UpdateServiceModalProps) {
    const { t } = useTranslation()
    const [selectedVersion, setSelectedVersion] = useState(latestVersion)
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [versions, setVersions] = useState<Array<{ tag: string; isLatest: boolean; releaseUrl?: string }>>([])
    const [loadingVersions, setLoadingVersions] = useState(false)

    async function loadVersions() {
        if (versions.length > 0) return
        setLoadingVersions(true)
        try {
            const result = await api.getAvailableVersions(record.service_name)
            if (result?.versions) {
                setVersions(result.versions)
            }
        } catch (error) {
            showError(t('updateService.failedToLoadVersions'))
        } finally {
            setLoadingVersions(false)
        }
    }

    function handleToggleAdvanced() {
        const next = !showAdvanced
        setShowAdvanced(next)
        if (next) loadVersions()
    }

    return (
        <StyledModal
            title={t('updateService.title')}
            onConfirm={() => onUpdate(selectedVersion)}
            onCancel={onCancel}
            open={true}
            confirmText={t('updateService.update')}
            confirmVariant="primary"
            icon={<IconArrowUp className="h-12 w-12 text-desert-green" />}
        >
            <div className="space-y-4">
                <p className="text-text-primary" dangerouslySetInnerHTML={{
                    __html: t('updateService.updateConfirmation', {
                        name: record.friendly_name || record.service_name,
                        from: currentTag,
                        to: selectedVersion,
                        interpolation: { escapeValue: false }
                    })
                }} />
                <p className="text-sm text-text-muted">
                    {t('updateService.dataPreserved')}
                    {versions.find((v) => v.tag === selectedVersion)?.releaseUrl && (
                        <>
                            {' '}
                            <a
                                href={versions.find((v) => v.tag === selectedVersion)!.releaseUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-desert-green hover:underline"
                            >
                                {t('updateService.viewReleaseNotes')}
                            </a>
                        </>
                    )}
                </p>

                <div>
                    <button
                        type="button"
                        onClick={handleToggleAdvanced}
                        className="text-sm text-desert-green hover:underline font-medium"
                    >
                        {showAdvanced ? t('updateService.hideVersions') : t('updateService.showVersions')}
                    </button>

                    {showAdvanced && (
                        <>
                            <div className="mt-3 max-h-48 overflow-y-auto border rounded-lg divide-y">
                                {loadingVersions ? (
                                    <div className="p-4 text-center text-text-muted text-sm">{t('updateService.loadingVersions')}</div>
                                ) : versions.length === 0 ? (
                                    <div className="p-4 text-center text-text-muted text-sm">{t('updateService.noVersionsAvailable')}</div>
                                ) : (
                                    versions.map((v) => (
                                        <label
                                            key={v.tag}
                                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-secondary cursor-pointer"
                                        >
                                            <input
                                                type="radio"
                                                name="version"
                                                value={v.tag}
                                                checked={selectedVersion === v.tag}
                                                onChange={() => setSelectedVersion(v.tag)}
                                                className="text-desert-green focus:ring-desert-green"
                                            />
                                            <span className="text-sm font-medium text-text-primary">{v.tag}</span>
                                            {v.isLatest && (
                                                <span className="text-xs bg-desert-green/10 text-desert-green px-2 py-0.5 rounded-full">
                                                    {t('updateService.latest')}
                                                </span>
                                            )}
                                            {v.releaseUrl && (
                                                <a
                                                    href={v.releaseUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-auto text-xs text-desert-green hover:underline"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {t('updateService.releaseNotes')}
                                                </a>
                                            )}
                                        </label>
                                    ))
                                )}
                            </div>
                            <p className="mt-2 text-sm text-text-muted">
                                {t('updateService.majorVersionWarning')}
                            </p>
                        </>
                    )}
                </div>
            </div>
        </StyledModal>
    )
}
