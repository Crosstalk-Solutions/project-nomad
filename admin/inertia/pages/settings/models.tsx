import { Head, router, usePage } from '@inertiajs/react'
import { useRef, useState } from 'react'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import { NomadOllamaModel } from '../../../types/ollama'
import StyledButton from '~/components/StyledButton'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import Alert from '~/components/Alert'
import { useNotifications } from '~/context/NotificationContext'
import api from '~/lib/api'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'
import type { NomadInstalledModel } from '../../../types/ollama'
import { SERVICE_NAMES } from '../../../constants/service_names'
import Switch from '~/components/inputs/Switch'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import { useMutation, useQuery } from '@tanstack/react-query'
import Input from '~/components/inputs/Input'
import { IconSearch, IconRefresh } from '@tabler/icons-react'
import { formatBytes } from '~/lib/util'
import useDebounce from '~/hooks/useDebounce'
import ActiveModelDownloads from '~/components/ActiveModelDownloads'
import { useSystemInfo } from '~/hooks/useSystemInfo'
import { useTranslation, Trans } from 'react-i18next'

export default function ModelsPage(props: {
  models: {
    availableModels: NomadOllamaModel[]
    installedModels: NomadInstalledModel[]
    settings: { chatSuggestionsEnabled: boolean; aiAssistantCustomName: string; remoteOllamaUrl: string; ollamaFlashAttention: boolean; autoThinking: boolean }
  }
}) {
  const { t } = useTranslation('chat')
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props
  const { isInstalled } = useServiceInstalledStatus(SERVICE_NAMES.OLLAMA)
  const { addNotification } = useNotifications()
  const { openModal, closeAllModals } = useModals()
  const { debounce } = useDebounce()
  const { data: systemInfo } = useSystemInfo({})

  const [gpuBannerDismissed, setGpuBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem('nomad:gpu-banner-dismissed') === 'true'
    } catch {
      return false
    }
  })
  const [reinstalling, setReinstalling] = useState(false)

  const handleDismissGpuBanner = () => {
    setGpuBannerDismissed(true)
    try {
      localStorage.setItem('nomad:gpu-banner-dismissed', 'true')
    } catch {}
  }

  const handleForceReinstallOllama = () => {
    openModal(
      <StyledModal
        title={t('models_page.reinstall_modal_title', { name: aiAssistantName })}
        onConfirm={async () => {
          closeAllModals()
          setReinstalling(true)
          try {
            const response = await api.forceReinstallService('nomad_ollama')
            if (!response || !response.success) {
              throw new Error(response?.message || 'Force reinstall failed')
            }
            addNotification({
              message: t('models_page.reinstall_in_progress_msg', { name: aiAssistantName }),
              type: 'success',
            })
            try { localStorage.removeItem('nomad:gpu-banner-dismissed') } catch {}
            setTimeout(() => window.location.reload(), 5000)
          } catch (error) {
            addNotification({
              message: t('models_page.reinstall_failed_msg', { error: error instanceof Error ? error.message : 'Unknown error' }),
              type: 'error',
            })
            setReinstalling(false)
          }
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText={t('models_page.reinstall_btn')}
        cancelText={t('common_actions.cancel')}
      >
        <p className="text-text-primary">
          {t('models_page.reinstall_confirm_body', { name: aiAssistantName })}
        </p>
      </StyledModal>,
      'gpu-health-force-reinstall-modal'
    )
  }
  const [chatSuggestionsEnabled, setChatSuggestionsEnabled] = useState(
    props.models.settings.chatSuggestionsEnabled
  )
  const [ollamaFlashAttention, setOllamaFlashAttention] = useState(
    props.models.settings.ollamaFlashAttention
  )
  const [autoThinking, setAutoThinking] = useState(props.models.settings.autoThinking)
  const [aiAssistantCustomName, setAiAssistantCustomName] = useState(
    props.models.settings.aiAssistantCustomName
  )
  const [remoteOllamaUrl, setRemoteOllamaUrl] = useState(props.models.settings.remoteOllamaUrl)
  const [remoteOllamaError, setRemoteOllamaError] = useState<string | null>(null)
  const [remoteOllamaSaving, setRemoteOllamaSaving] = useState(false)

  async function handleSaveRemoteOllama() {
    setRemoteOllamaError(null)
    setRemoteOllamaSaving(true)
    try {
      const res = await api.configureRemoteOllama(remoteOllamaUrl || null)
      if (res?.success) {
        addNotification({ message: res.message, type: 'success' })
        router.reload()
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || t('models_page.remote_configure_failed')
      setRemoteOllamaError(msg)
    } finally {
      setRemoteOllamaSaving(false)
    }
  }

  async function handleClearRemoteOllama() {
    setRemoteOllamaError(null)
    setRemoteOllamaSaving(true)
    try {
      const res = await api.configureRemoteOllama(null)
      if (res?.success) {
        setRemoteOllamaUrl('')
        addNotification({ message: t('models_page.remote_cleared_msg'), type: 'success' })
        router.reload()
      }
    } catch (error: any) {
      setRemoteOllamaError(error?.message || t('models_page.remote_clear_failed'))
    } finally {
      setRemoteOllamaSaving(false)
    }
  }

  const [query, setQuery] = useState('')
  const [queryUI, setQueryUI] = useState('')
  const [limit, setLimit] = useState(15)

  const debouncedSetQuery = debounce((val: string) => {
    setQuery(val)
  }, 300)

  const { data: availableModelsData, isLoading: isLoadingAvailableModels } = useQuery({
    queryKey: ['availableModels', query, limit],
    queryFn: () => api.getAvailableModels(query, limit),
    initialData: { models: props.models.availableModels, total: props.models.availableModels.length },
  })

  const { data: installedModelsData } = useQuery({
    queryKey: ['installedModels'],
    queryFn: () => api.getInstalledModels(),
    initialData: props.models.installedModels,
  })

  const installedModels = installedModelsData || []
  const availableModels = availableModelsData?.models || []
  const totalAvailable = availableModelsData?.total || 0

  const deleteModelMutation = useMutation({
    mutationFn: (modelName: string) => api.deleteModel(modelName),
    onSuccess: () => {
      addNotification({ message: t('models_page.model_deleted_msg'), type: 'success' })
      router.reload()
    },
    onError: () => {
      addNotification({ message: t('models_page.model_delete_failed'), type: 'error' })
    },
  })

  const downloadModelMutation = useMutation({
    mutationFn: (modelName: string) => api.downloadModel(modelName),
    onSuccess: () => {
      addNotification({ message: t('models_page.download_queued_msg'), type: 'success' })
      router.reload()
    },
    onError: () => {
      addNotification({ message: t('models_page.download_queue_failed'), type: 'error' })
    },
  })

  const updateSettingMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) => api.updateSetting(key, value),
    onSuccess: () => {
      addNotification({ message: t('models_page.setting_saved_msg'), type: 'success' })
    },
  })

  function handleDeleteModel(modelName: string) {
    openModal(
      <StyledModal
        title={t('models_page.delete_model_title')}
        onConfirm={() => {
          deleteModelMutation.mutate(modelName)
          closeAllModals()
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText={t('common_actions.delete')}
        cancelText={t('common_actions.cancel')}
        confirmVariant="danger"
      >
        <p className="text-text-primary">
          {t('models_page.delete_model_confirm', { name: modelName })}
        </p>
      </StyledModal>,
      'delete-model-modal'
    )
  }

  const installedColumns = [
    {
      header: t('models_page.col_model'),
      accessor: 'name' as const,
      cell: (value: string) => <span className="font-medium text-text-primary">{value}</span>,
    },
    {
      header: t('models_page.col_size'),
      accessor: 'size' as const,
      cell: (value: number) => <span className="text-text-secondary">{formatBytes(value)}</span>,
    },
    {
      header: t('models_page.col_actions'),
      accessor: 'name' as const,
      cell: (value: string) => (
        <StyledButton
          variant="danger"
          size="sm"
          icon="IconTrash"
          onClick={() => handleDeleteModel(value)}
        >
          {t('common_actions.delete')}
        </StyledButton>
      ),
    },
  ]

  const availableColumns = [
    {
      header: t('models_page.col_model'),
      accessor: 'name' as const,
      cell: (value: string) => <span className="font-medium text-text-primary">{value}</span>,
    },
    {
      header: t('models_page.col_description'),
      accessor: 'description' as const,
      cell: (value: string) => <span className="text-text-secondary text-sm">{value}</span>,
    },
    {
      header: t('models_page.col_size'),
      accessor: 'size' as const,
      cell: (value: number) => <span className="text-text-secondary">{formatBytes(value)}</span>,
    },
    {
      header: t('models_page.col_actions'),
      accessor: 'name' as const,
      cell: (value: string) => {
        const isModelInstalled = installedModels.some((m) => m.name === value)
        return (
          <StyledButton
            variant={isModelInstalled ? 'secondary' : 'primary'}
            size="sm"
            icon={isModelInstalled ? 'IconCheck' : 'IconDownload'}
            disabled={isModelInstalled || downloadModelMutation.isPending}
            onClick={() => downloadModelMutation.mutate(value)}
          >
            {isModelInstalled ? t('models_page.installed_badge') : t('models_page.download_btn')}
          </StyledButton>
        )
      },
    },
  ]

  const showGpuBanner =
    !gpuBannerDismissed &&
    systemInfo?.gpu?.hasGpu &&
    systemInfo.gpu.isNvidia &&
    systemInfo.gpu.isOllamaUsingGpu === false

  return (
    <SettingsLayout>
      <Head title={t('models_page.page_title', { name: aiAssistantName })} />

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {t('models_page.header_title', { name: aiAssistantName })}
          </h1>
          <p className="text-text-secondary mt-1">
            {t('models_page.header_desc', { name: aiAssistantName })}
          </p>
        </div>

        {!isInstalled && (
          <Alert
            type="warning"
            title={t('models_page.not_installed_title', { name: aiAssistantName })}
            message={t('models_page.not_installed_desc', { name: aiAssistantName })}
          />
        )}

        {showGpuBanner && (
          <Alert
            type="warning"
            title={t('models_page.gpu_not_accessible_title')}
            message={t('models_page.gpu_not_accessible_desc', { name: aiAssistantName })}
            actionText={reinstalling ? t('models_page.reinstalling_btn') : t('models_page.fix_gpu_btn')}
            onAction={handleForceReinstallOllama}
            dismissible
            onDismiss={handleDismissGpuBanner}
          />
        )}

        <ActiveModelDownloads />

        {/* Settings Section */}
        <div className="bg-surface-primary rounded-lg border border-border-subtle p-6 space-y-4">
          <StyledSectionHeader title={t('models_page.settings_section')} className="mb-4" />

          <div className="flex items-center justify-between py-2 border-b border-border-subtle">
            <div>
              <label className="text-sm font-medium text-text-primary">
                {t('models_page.suggestions_label')}
              </label>
              <p className="text-xs text-text-muted">
                {t('models_page.suggestions_desc')}
              </p>
            </div>
            <Switch
              checked={chatSuggestionsEnabled}
              onChange={(val) => {
                setChatSuggestionsEnabled(val)
                updateSettingMutation.mutate({ key: 'chat.suggestionsEnabled', value: val })
              }}
            />
          </div>

          <div className="flex items-center justify-between py-2 border-b border-border-subtle">
            <div>
              <label className="text-sm font-medium text-text-primary">
                {t('models_page.flash_attn_label')}
              </label>
              <p className="text-xs text-text-muted">
                {t('models_page.flash_attn_desc')}
              </p>
            </div>
            <Switch
              checked={ollamaFlashAttention}
              onChange={(val) => {
                setOllamaFlashAttention(val)
                updateSettingMutation.mutate({ key: 'ai.ollamaFlashAttention', value: val })
              }}
            />
          </div>

          <div className="flex items-center justify-between py-2 border-b border-border-subtle">
            <div>
              <label className="text-sm font-medium text-text-primary">
                {t('models_page.auto_thinking_label')}
              </label>
              <p className="text-xs text-text-muted">
                {t('models_page.auto_thinking_desc')}
              </p>
            </div>
            <Switch
              checked={autoThinking}
              onChange={(val) => {
                setAutoThinking(val)
                updateSettingMutation.mutate({ key: 'ai.autoThinking', value: val })
              }}
            />
          </div>

          <div className="pt-2">
            <label className="text-sm font-medium text-text-primary block mb-1">
              {t('models_page.custom_name_label')}
            </label>
            <div className="flex gap-2 max-w-md">
              <Input
                value={aiAssistantCustomName}
                onChange={(e) => setAiAssistantCustomName(e.target.value)}
                placeholder={t('models_page.custom_name_placeholder')}
              />
              <StyledButton
                variant="primary"
                onClick={() =>
                  updateSettingMutation.mutate({
                    key: 'ai.assistantCustomName',
                    value: aiAssistantCustomName,
                  })
                }
              >
                {t('common_actions.save')}
              </StyledButton>
            </div>
          </div>
        </div>

        {/* Remote Ollama Connection */}
        <div className="bg-surface-primary rounded-lg border border-border-subtle p-6 space-y-4">
          <StyledSectionHeader title={t('models_page.remote_section')} className="mb-4" />
          <p className="text-sm text-text-secondary">
            {t('models_page.remote_desc')}
          </p>

          {remoteOllamaError && (
            <Alert
              type="error"
              message={remoteOllamaError}
              actionText={t('common_actions.dismiss')}
              onAction={() => setRemoteOllamaError(null)}
            />
          )}

          <div className="flex gap-2 max-w-lg">
            <Input
              value={remoteOllamaUrl}
              onChange={(e) => setRemoteOllamaUrl(e.target.value)}
              placeholder="http://192.168.1.100:11434"
            />
            <StyledButton
              variant="primary"
              loading={remoteOllamaSaving}
              onClick={handleSaveRemoteOllama}
            >
              {t('common_actions.save')}
            </StyledButton>
            {props.models.settings.remoteOllamaUrl && (
              <StyledButton
                variant="outline"
                disabled={remoteOllamaSaving}
                onClick={handleClearRemoteOllama}
              >
                {t('common_actions.clear')}
              </StyledButton>
            )}
          </div>
        </div>

        {/* Installed Models Section */}
        <div className="bg-surface-primary rounded-lg border border-border-subtle p-6 space-y-4">
          <StyledSectionHeader title={t('models_page.installed_models_section')} className="mb-4" />
          {installedModels.length === 0 ? (
            <p className="text-sm text-text-muted py-4">
              {t('models_page.no_models_installed')}
            </p>
          ) : (
            <StyledTable columns={installedColumns} data={installedModels} />
          )}
        </div>

        {/* Available Models Library */}
        <div className="bg-surface-primary rounded-lg border border-border-subtle p-6 space-y-4">
          <StyledSectionHeader title={t('models_page.available_models_section')} className="mb-4" />

          <div className="flex gap-2 max-w-md">
            <Input
              value={queryUI}
              onChange={(e) => {
                setQueryUI(e.target.value)
                debouncedSetQuery(e.target.value)
              }}
              placeholder={t('models_page.search_models_placeholder')}
              icon="IconSearch"
            />
          </div>

          <StyledTable columns={availableColumns} data={availableModels} />

          {totalAvailable > limit && (
            <div className="text-center pt-2">
              <StyledButton
                variant="outline"
                onClick={() => setLimit((prev) => prev + 15)}
                loading={isLoadingAvailableModels}
              >
                {t('models_page.load_more_models')}
              </StyledButton>
            </div>
          )}
        </div>
      </div>
    </SettingsLayout>
  )
}
