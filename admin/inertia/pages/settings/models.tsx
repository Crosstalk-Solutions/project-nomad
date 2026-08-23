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
import Select from '~/components/inputs/Select'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Input from '~/components/inputs/Input'
import { IconSearch, IconRefresh } from '@tabler/icons-react'
import { formatBytes } from '~/lib/util'
import useDebounce from '~/hooks/useDebounce'
import ActiveModelDownloads from '~/components/ActiveModelDownloads'
import { useSystemInfo } from '~/hooks/useSystemInfo'

export default function ModelsPage(props: {
  models: {
    availableModels: NomadOllamaModel[]
    installedModels: NomadInstalledModel[]
    settings: { chatSuggestionsEnabled: boolean; aiAssistantCustomName: string; remoteOllamaUrl: string; remoteOllamaApiKeySet: boolean; ollamaFlashAttention: boolean; autoThinking: boolean; tasksModel: string; ragEnabled: boolean; contextWindow: string }
    /** Effective window per installed model, as resolved by ContextWindowService. */
    resolvedContextWindows?: Record<string, number>
  }
}) {
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props
  const { isInstalled } = useServiceInstalledStatus(SERVICE_NAMES.OLLAMA)
  const { addNotification } = useNotifications()
  const { openModal, closeAllModals } = useModals()
  const { debounce } = useDebounce()
  const { data: systemInfo } = useSystemInfo({})
  const queryClient = useQueryClient()

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
        title="Reinstall AI Assistant?"
        onConfirm={async () => {
          closeAllModals()
          setReinstalling(true)
          try {
            const response = await api.forceReinstallService('nomad_ollama')
            if (!response || !response.success) {
              throw new Error(response?.message || 'Force reinstall failed')
            }
            addNotification({
              message: `${aiAssistantName} is being reinstalled with GPU support. This page will reload shortly.`,
              type: 'success',
            })
            try { localStorage.removeItem('nomad:gpu-banner-dismissed') } catch {}
            setTimeout(() => window.location.reload(), 5000)
          } catch (error) {
            addNotification({
              message: `Failed to reinstall: ${error instanceof Error ? error.message : 'Unknown error'}`,
              type: 'error',
            })
            setReinstalling(false)
          }
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText="Reinstall"
        cancelText="Cancel"
      >
        <p className="text-text-primary">
          This will recreate the {aiAssistantName} container with GPU support enabled.
          Your downloaded models will be preserved. The service will be briefly
          unavailable during reinstall.
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
  const [ragEnabled, setRagEnabled] = useState(props.models.settings.ragEnabled)
  const [tasksModel, setTasksModel] = useState(props.models.settings.tasksModel)
  const [contextWindow, setContextWindow] = useState(props.models.settings.contextWindow)
  const [aiAssistantCustomName, setAiAssistantCustomName] = useState(
    props.models.settings.aiAssistantCustomName
  )
  const [remoteOllamaUrl, setRemoteOllamaUrl] = useState(props.models.settings.remoteOllamaUrl)
  const [remoteOllamaError, setRemoteOllamaError] = useState<string | null>(null)
  const [remoteOllamaSaving, setRemoteOllamaSaving] = useState(false)
  const [remoteApiKey, setRemoteApiKey] = useState('')
  const [remoteApiKeyError, setRemoteApiKeyError] = useState<string | null>(null)
  const [remoteApiKeySaving, setRemoteApiKeySaving] = useState(false)
  const remoteApiKeySet = props.models.settings.remoteOllamaApiKeySet

  async function handleSaveRemoteOllama() {
    setRemoteOllamaError(null)
    setRemoteOllamaSaving(true)
    try {
      const res = await api.configureRemoteOllama(remoteOllamaUrl || null, remoteApiKey || null)
      if (res?.success) {
        addNotification({ message: res.message, type: 'success' })
        router.reload()
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to configure remote Ollama.'
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
        addNotification({ message: 'Remote Ollama configuration cleared.', type: 'success' })
        router.reload()
      }
    } catch (error: any) {
      setRemoteOllamaError(error?.message || 'Failed to clear remote Ollama.')
    } finally {
      setRemoteOllamaSaving(false)
    }
  }

  async function handleSaveRemoteApiKey() {
    setRemoteApiKeyError(null)
    setRemoteApiKeySaving(true)
    try {
      const res = await api.configureRemoteOllamaApiKey(remoteApiKey || null)
      if (res?.success) {
        setRemoteApiKey('')
        addNotification({ message: res.message, type: 'success' })
        router.reload()
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to save remote API key.'
      setRemoteApiKeyError(msg)
    } finally {
      setRemoteApiKeySaving(false)
    }
  }

  async function handleClearRemoteApiKey() {
    setRemoteApiKeyError(null)
    setRemoteApiKeySaving(true)
    try {
      const res = await api.configureRemoteOllamaApiKey(null)
      if (res?.success) {
        setRemoteApiKey('')
        addNotification({ message: 'Remote API key cleared.', type: 'success' })
        router.reload()
      }
    } catch (error: any) {
      setRemoteApiKeyError(error?.message || 'Failed to clear remote API key.')
    } finally {
      setRemoteApiKeySaving(false)
    }
  }

  const [query, setQuery] = useState('')
  const [queryUI, setQueryUI] = useState('')
  const [limit, setLimit] = useState(15)

  const debouncedSetQuery = debounce((val: string) => {
    setQuery(val)
  }, 300)

  const forceRefreshRef = useRef(false)
  const [isForceRefreshing, setIsForceRefreshing] = useState(false)

  const { data: availableModelData, isFetching, refetch } = useQuery({
    queryKey: ['ollama', 'availableModels', query, limit],
    queryFn: async () => {
      const force = forceRefreshRef.current
      forceRefreshRef.current = false
      const res = await api.getAvailableModels({
        query,
        recommendedOnly: false,
        limit,
        force: force || undefined,
      })
      if (!res) {
        return {
          models: [],
          hasMore: false,
        }
      }
      return res
    },
    initialData: { models: props.models.availableModels, hasMore: false },
  })

  async function handleForceRefresh() {
    forceRefreshRef.current = true
    setIsForceRefreshing(true)
    await refetch()
    setIsForceRefreshing(false)
    addNotification({ message: 'Model list refreshed from remote.', type: 'success' })
  }

  async function handleInstallModel(modelName: string) {
    try {
      const res = await api.downloadModel(modelName)
      if (res.success) {
        addNotification({
          message: `Model download initiated for ${modelName}. It may take some time to complete.`,
          type: 'success',
        })
      }
    } catch (error) {
      console.error('Error installing model:', error)
      addNotification({
        message: `There was an error installing the model: ${modelName}. Please try again.`,
        type: 'error',
      })
    }
  }

  async function handleDeleteModel(modelName: string) {
    try {
      const res = await api.deleteModel(modelName)
      if (res.success) {
        addNotification({
          message: `Model deleted: ${modelName}.`,
          type: 'success',
        })
      }
      closeAllModals()
      router.reload()
    } catch (error) {
      console.error('Error deleting model:', error)
      addNotification({
        message: `There was an error deleting the model: ${modelName}. Please try again.`,
        type: 'error',
      })
    }
  }

  async function confirmDeleteModel(model: string) {
    openModal(
      <StyledModal
        title="Delete Model?"
        onConfirm={() => {
          handleDeleteModel(model)
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="primary"
      >
        <p className="text-text-primary">
          Are you sure you want to delete this model? You will need to download it again if you want
          to use it in the future.
        </p>
      </StyledModal>,
      'confirm-delete-model-modal'
    )
  }

  // A model can be deleted after being picked here. Surface the stale name as a
  // disabled option instead of letting the select silently render empty — the
  // backend already falls back to the chat model at call time.
  // "Auto" sizes each model's window from its own trained context and what the
  // hardware can afford. An explicit choice is a cap, never a boost — asking for
  // more than a model or a GPU can support just degrades or fails to load.
  const contextWindowOptions = [
    { value: 'auto', label: 'Auto (recommended)' },
    { value: '4096', label: '4K tokens' },
    { value: '8192', label: '8K tokens' },
    { value: '16384', label: '16K tokens' },
    { value: '32768', label: '32K tokens' },
    { value: '65536', label: '64K tokens' },
    { value: '131072', label: '128K tokens' },
  ]

  const resolvedWindows = props.models.resolvedContextWindows ?? {}
  const formatWindow = (tokens: number) =>
    tokens >= 1024 ? `${Math.round(tokens / 1024)}K` : String(tokens)

  const tasksModelOptions = [
    { value: '', label: 'Use the chat model' },
    ...props.models.installedModels.map((model) => ({ value: model.name, label: model.name })),
    ...(tasksModel && !props.models.installedModels.some((m) => m.name === tasksModel)
      ? [{ value: tasksModel, label: `${tasksModel} (not installed)`, disabled: true }]
      : []),
  ]

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean | string }) => {
      return await api.updateSetting(key, value)
    },
    onSuccess: (_data, { key }) => {
      // Anything reading this key through useSystemSetting (e.g. the chat
      // window's own copy of the retrieval toggle) should pick the change up
      // without a reload.
      queryClient.invalidateQueries({ queryKey: ['system-setting', key] })
      addNotification({
        message: 'Setting updated successfully.',
        type: 'success',
      })
    },
    onError: (error) => {
      console.error('Error updating setting:', error)
      addNotification({
        message: 'There was an error updating the setting. Please try again.',
        type: 'error',
      })
    },
  })

  return (
    <SettingsLayout>
      <Head title={`${aiAssistantName} Settings | Project NOMAD`} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <h1 className="text-4xl font-semibold mb-4">{aiAssistantName}</h1>
          <p className="text-text-muted mb-4">
            Easily manage the {aiAssistantName}'s settings and installed models. We recommend
            starting with smaller models first to see how they perform on your system before moving
            on to larger ones.
          </p>
          {!isInstalled && (
            <Alert
              title={`${aiAssistantName}'s dependencies are not installed. Please install them to manage AI models.`}
              type="warning"
              variant="solid"
              className="!mt-6"
            />
          )}
          {isInstalled && systemInfo?.gpuHealth?.status === 'passthrough_failed' && !gpuBannerDismissed && (
            <Alert
              type="warning"
              variant="bordered"
              title="GPU Not Accessible"
              message={`Your system has ${systemInfo?.gpuHealth?.gpuVendor === 'amd' ? 'an AMD' : 'an NVIDIA'} GPU, but ${aiAssistantName} can't access it. AI is running on CPU only, which is significantly slower.`}
              className="!mt-6"
              dismissible={true}
              onDismiss={handleDismissGpuBanner}
              buttonProps={{
                children: `Fix: Reinstall ${aiAssistantName}`,
                icon: 'IconRefresh',
                variant: 'action',
                size: 'sm',
                onClick: handleForceReinstallOllama,
                loading: reinstalling,
                disabled: reinstalling,
              }}
            />
          )}

          <StyledSectionHeader title="Settings" className="mt-8 mb-4" />
          <div className="bg-surface-primary rounded-lg border-2 border-border-subtle p-6">
            <div className="space-y-4">
              <Switch
                checked={chatSuggestionsEnabled}
                onChange={(newVal) => {
                  setChatSuggestionsEnabled(newVal)
                  updateSettingMutation.mutate({ key: 'chat.suggestionsEnabled', value: newVal })
                }}
                label="Chat Suggestions"
                description="Display AI-generated conversation starters in the chat interface"
              />
              <Switch
                checked={ollamaFlashAttention}
                onChange={(newVal) => {
                  setOllamaFlashAttention(newVal)
                  updateSettingMutation.mutate({ key: 'ai.ollamaFlashAttention', value: newVal })
                }}
                label="Flash Attention"
                description="Enables OLLAMA_FLASH_ATTENTION=1 for improved memory efficiency. Disable if you experience instability. Takes effect after reinstalling the AI Assistant."
              />
              <Switch
                checked={autoThinking}
                onChange={(newVal) => {
                  setAutoThinking(newVal)
                  updateSettingMutation.mutate({ key: 'ai.autoThinking', value: newVal })
                }}
                label="Use thinking automatically when a model supports it"
                description="Sets the default for models that can think. You can still turn thinking on or off for an individual model in the chat window."
              />
              <Switch
                checked={ragEnabled}
                onChange={(newVal) => {
                  setRagEnabled(newVal)
                  updateSettingMutation.mutate({ key: 'rag.enabled', value: newVal })
                }}
                label="Knowledge Base Retrieval"
                description="Search your knowledge base for relevant documents before answering. Turn this off to save memory and speed up replies when your knowledge base is small or empty. This is the same switch as the one in the chat window."
              />
              <Input
                name="aiAssistantCustomName"
                label="Assistant Name"
                helpText='Give your AI assistant a custom name that will be used in the chat interface and other areas of the application.'
                placeholder="AI Assistant"
                value={aiAssistantCustomName}
                onChange={(e) => setAiAssistantCustomName(e.target.value)}
                onBlur={() =>
                  updateSettingMutation.mutate({
                    key: 'ai.assistantCustomName',
                    value: aiAssistantCustomName,
                  })
                }
              />
              <Select
                name="tasksModel"
                label="Tasks Model"
                helpText="Small, fast model used for background work like chat titles and suggestions. Leave this set to the chat model to use whichever model the chat is using. Avoid reasoning models here — they are slow at short, aesthetic tasks."
                value={tasksModel}
                options={tasksModelOptions}
                onChange={(newVal) => {
                  setTasksModel(newVal)
                  updateSettingMutation.mutate({ key: 'ai.tasksModel', value: newVal })
                }}
              />
              <Select
                name="contextWindow"
                label="Context Window"
                helpText="How much conversation and knowledge-base context each reply can consider. Auto sizes this per model from its trained limit and your available memory. Choosing a value sets an upper limit — it can lower the window to save memory, but never raises it beyond what a model supports."
                value={contextWindow}
                options={contextWindowOptions}
                onChange={(newVal) => {
                  setContextWindow(newVal)
                  updateSettingMutation.mutate({ key: 'ai.contextWindow', value: newVal })
                }}
              />
              {Object.keys(resolvedWindows).length > 0 && (
                <p className="text-xs text-text-muted">
                  Currently in effect:{' '}
                  {Object.entries(resolvedWindows)
                    .map(([name, tokens]) => `${name} → ${formatWindow(tokens)}`)
                    .join(', ')}
                  . Changes take effect for new conversations.
                </p>
              )}
            </div>
          </div>

          <StyledSectionHeader title="Installed Models" className="mt-12 mb-4" />
          <div className="bg-surface-primary rounded-lg border-2 border-border-subtle p-6">
            {props.models.installedModels.length === 0 ? (
              <p className="text-text-muted">
                No models installed. Browse the model catalog below to get started.
              </p>
            ) : (
              <table className="min-w-full divide-y divide-border-subtle">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Model
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Parameters
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Disk Size
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {props.models.installedModels.map((model) => (
                    <tr key={model.name} className="hover:bg-surface-secondary">
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-text-primary">{model.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary">
                          {model.details?.parameter_size || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary">
                          {formatBytes(model.size)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StyledButton
                          variant="danger"
                          size="sm"
                          onClick={() => confirmDeleteModel(model.name)}
                          icon="IconTrash"
                        >
                          Delete
                        </StyledButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <StyledSectionHeader title="Remote Connection" className="mt-8 mb-4" />
          <div className="bg-surface-primary rounded-lg border-2 border-border-subtle p-6">
            <p className="text-sm text-text-secondary mb-4">
              Connect to any OpenAI-compatible API server — Ollama, LM Studio, llama.cpp, cloud gateways like{' '}
              <a href="https://www.orcarouter.ai" target="_blank" rel="noreferrer" className="underline text-text-primary">OrcaRouter</a>, and others are all supported.
              For remote Ollama instances, the host must be started with <code className="bg-surface-secondary px-1 rounded">OLLAMA_HOST=0.0.0.0</code>.
              Cloud gateways require an API key.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  name="remoteOllamaUrl"
                  label="Remote Ollama/OpenAI API URL"
                  placeholder="http://192.168.1.100:11434  (or :1234 for OpenAI API Compatible Apps)"
                  value={remoteOllamaUrl}
                  onChange={(e) => {
                    setRemoteOllamaUrl(e.target.value)
                    setRemoteOllamaError(null)
                  }}
                />
                <div className="mt-4">
                  <Input
                    name="remoteOllamaApiKey"
                    label="API Key (optional)"
                    helpText={remoteApiKeySet ? 'An API key is saved for this endpoint.' : 'Only required for cloud gateways that authenticate requests (e.g. OrcaRouter).'}
                    type="password"
                    placeholder={remoteApiKeySet ? '••••••••••••••••  (saved)' : 'sk-orca-…'}
                    value={remoteApiKey}
                    onChange={(e) => {
                      setRemoteApiKey(e.target.value)
                      setRemoteApiKeyError(null)
                    }}
                  />
                  {remoteApiKeyError && (
                    <p className="text-sm text-red-600 mt-1">{remoteApiKeyError}</p>
                  )}
                </div>
                {remoteOllamaError && (
                  <p className="text-sm text-red-600 mt-1">{remoteOllamaError}</p>
                )}
              </div>
              <StyledButton
                variant="primary"
                onClick={handleSaveRemoteOllama}
                loading={remoteOllamaSaving}
                disabled={remoteOllamaSaving || !remoteOllamaUrl}
                className="mb-0.5"
              >
                Save &amp; Test
              </StyledButton>
              {props.models.settings.remoteOllamaUrl && (
                <StyledButton
                  variant="danger"
                  onClick={handleClearRemoteOllama}
                  loading={remoteOllamaSaving}
                  disabled={remoteOllamaSaving}
                  className="mb-0.5"
                >
                  Clear
                </StyledButton>
              )}
            </div>
            {remoteApiKeySet && (
              <div className="mt-4 flex items-end gap-3">
                <div className="flex-1">
                  <p className="text-sm text-text-secondary">
                    Test the saved API key against chat completions.
                  </p>
                </div>
                <StyledButton
                  variant="secondary"
                  onClick={handleSaveRemoteApiKey}
                  loading={remoteApiKeySaving}
                  disabled={remoteApiKeySaving}
                  className="mb-0.5"
                >
                  Save Key
                </StyledButton>
                <StyledButton
                  variant="danger"
                  onClick={handleClearRemoteApiKey}
                  loading={remoteApiKeySaving}
                  disabled={remoteApiKeySaving}
                  className="mb-0.5"
                >
                  Clear Key
                </StyledButton>
              </div>
            )}
          </div>

          <ActiveModelDownloads withHeader />

          <StyledSectionHeader title="Models" className="mt-12 mb-4" />
          <Alert
            type="info"
            variant="bordered"
            title="Model downloading is only supported when using a Ollama backend."
            message="If you are connected to an OpenAI API host (e.g. LM Studio), please download models directly in that application."
            className="mb-4"
          />
          <div className="flex justify-start items-center gap-3 mt-4">
            <Input
              name="search"
              label=""
              placeholder="Search language models.."
              value={queryUI}
              onChange={(e) => {
                setQueryUI(e.target.value)
                debouncedSetQuery(e.target.value)
              }}
              className="w-1/3"
              leftIcon={<IconSearch className="w-5 h-5 text-text-muted" />}
            />
            <StyledButton
              variant="secondary"
              onClick={handleForceRefresh}
              icon="IconRefresh"
              loading={isForceRefreshing}
              className='mt-1'
            >
              Refresh Models
            </StyledButton>
          </div>
          <StyledTable<NomadOllamaModel>
            className="font-semibold mt-4"
            rowLines={true}
            columns={[
              {
                accessor: 'name',
                title: 'Name',
                render(record) {
                  return (
                    <div className="flex flex-col">
                      <p className="text-lg font-semibold">{record.name}</p>
                      <p className="text-sm text-text-muted">{record.description}</p>
                    </div>
                  )
                },
              },
              {
                accessor: 'estimated_pulls',
                title: 'Estimated Pulls',
              },
              {
                accessor: 'model_last_updated',
                title: 'Last Updated',
              },
            ]}
            data={availableModelData?.models || []}
            loading={isFetching}
            expandable={{
              expandedRowRender: (record) => (
                <div className="pl-14">
                  <div className="bg-surface-primary overflow-hidden">
                    <table className="min-w-full divide-y divide-border-subtle">
                      <thead className="bg-surface-primary">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                            Tag
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                            Input Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                            Context Size
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                            Model Size
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-surface-primary divide-y divide-border-subtle">
                        {record.tags.map((tag, tagIndex) => {
                          const isInstalled = props.models.installedModels.some(
                            (mod) => mod.name === tag.name
                          )
                          return (
                            <tr key={tagIndex} className="hover:bg-surface-secondary">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm font-medium text-text-primary">
                                  {tag.name}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm text-text-secondary">{tag.input || 'N/A'}</span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm text-text-secondary">
                                  {tag.context || 'N/A'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm text-text-secondary">{tag.size || 'N/A'}</span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <StyledButton
                                  variant={isInstalled ? 'danger' : 'primary'}
                                  onClick={() => {
                                    if (!isInstalled) {
                                      handleInstallModel(tag.name)
                                    } else {
                                      confirmDeleteModel(tag.name)
                                    }
                                  }}
                                  icon={isInstalled ? 'IconTrash' : 'IconDownload'}
                                >
                                  {isInstalled ? 'Delete' : 'Install'}
                                </StyledButton>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ),
            }}
          />
          <div className="flex justify-center mt-6">
            {availableModelData?.hasMore && (
              <StyledButton
                variant="primary"
                onClick={() => {
                  setLimit((prev) => prev + 15)
                }}
              >
                Load More
              </StyledButton>
            )}
          </div>
        </main>
      </div>
    </SettingsLayout>
  )
}
