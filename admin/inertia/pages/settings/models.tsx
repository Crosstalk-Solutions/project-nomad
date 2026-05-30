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
import type { MacAiProvider } from '../../../types/mac_ai'

export default function ModelsPage(props: {
  models: {
    availableModels: NomadOllamaModel[]
    installedModels: NomadInstalledModel[]
    settings: {
      chatSuggestionsEnabled: boolean
      aiAssistantCustomName: string
      remoteOllamaUrl: string
      aiProvider: MacAiProvider
      macNativeWorkerUrl: string
      macNativeModelRoot: string
      ollamaFlashAttention: boolean
    }
  }
}) {
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
            try {
              localStorage.removeItem('nomad:gpu-banner-dismissed')
            } catch {}
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
          This will recreate the {aiAssistantName} container with GPU support enabled. Your
          downloaded models will be preserved. The service will be briefly unavailable during
          reinstall.
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
  const [aiAssistantCustomName, setAiAssistantCustomName] = useState(
    props.models.settings.aiAssistantCustomName
  )
  const [remoteOllamaUrl, setRemoteOllamaUrl] = useState(props.models.settings.remoteOllamaUrl)
  const [aiProvider, setAiProvider] = useState<MacAiProvider>(props.models.settings.aiProvider)
  const [macNativeWorkerUrl, setMacNativeWorkerUrl] = useState(
    props.models.settings.macNativeWorkerUrl
  )
  const [macNativeModelRoot, setMacNativeModelRoot] = useState(
    props.models.settings.macNativeModelRoot
  )
  const [remoteOllamaError, setRemoteOllamaError] = useState<string | null>(null)
  const [remoteOllamaSaving, setRemoteOllamaSaving] = useState(false)

  const { data: macAiStatus, refetch: refetchMacAiStatus } = useQuery({
    queryKey: ['mac-ai', 'status'],
    queryFn: async () => api.getMacAiStatus(),
  })

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
      const msg =
        error?.response?.data?.message || error?.message || 'Failed to configure remote Ollama.'
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

  async function handleSaveMacAiProvider(providerOverride?: MacAiProvider) {
    const nextProvider = providerOverride ?? aiProvider
    setRemoteOllamaError(null)
    setRemoteOllamaSaving(true)
    try {
      const res = await api.configureMacAi({
        provider: nextProvider,
        workerUrl: macNativeWorkerUrl || null,
        modelRoot: macNativeModelRoot || null,
      })
      if (res?.success) {
        setAiProvider(nextProvider)
        addNotification({ message: res.message, type: 'success' })
        await refetchMacAiStatus()
        router.reload()
      }
    } catch (error: any) {
      setRemoteOllamaError(
        error?.response?.data?.message || error?.message || 'Failed to configure AI provider.'
      )
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

  const forceRefreshRef = useRef(false)
  const [isForceRefreshing, setIsForceRefreshing] = useState(false)

  const {
    data: availableModelData,
    isFetching,
    refetch,
  } = useQuery({
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

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean | string }) => {
      return await api.updateSetting(key, value)
    },
    onSuccess: () => {
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
      <Head title={`${aiAssistantName} Settings | Project N.O.M.A.D.`} />
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
          {isInstalled &&
            systemInfo?.gpuHealth?.status === 'passthrough_failed' &&
            !gpuBannerDismissed && (
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
              <Input
                name="aiAssistantCustomName"
                label="Assistant Name"
                helpText="Give your AI assistant a custom name that will be used in the chat interface and other areas of the application."
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
              Connect to any OpenAI-compatible API server — Ollama, LM Studio, llama.cpp, and others
              are all supported. For remote Ollama instances, the host must be started with{' '}
              <code className="bg-surface-secondary px-1 rounded">OLLAMA_HOST=0.0.0.0</code>.
            </p>
            <div className="mb-5 grid grid-cols-1 md:grid-cols-4 gap-2">
              {(
                [
                  ['ollama', 'Ollama'],
                  ['remote', 'Remote API'],
                  ['native_mlx', 'Native MLX'],
                  ['native_coreml', 'Native Core ML'],
                ] as Array<[MacAiProvider, string]>
              ).map(([provider, label]) => (
                <StyledButton
                  key={provider}
                  variant={aiProvider === provider ? 'primary' : 'outline'}
                  onClick={() => handleSaveMacAiProvider(provider)}
                  disabled={remoteOllamaSaving}
                >
                  {label}
                </StyledButton>
              ))}
            </div>
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
            <div className="mt-6 border-t border-border-subtle pt-5">
              <h3 className="text-lg font-semibold text-text-primary">Native Mac Inference</h3>
              <p className="text-sm text-text-secondary mt-1 mb-4">
                On Apple Silicon, NOMAD can use a launchd-managed host worker for MLX and Core ML
                models. The worker runs on macOS so it can access Metal/Core ML acceleration while
                Command Center keeps using the same local OpenAI-compatible API shape.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Input
                  name="macNativeWorkerUrl"
                  label="Native Worker URL"
                  placeholder="http://host.docker.internal:8765"
                  value={macNativeWorkerUrl}
                  onChange={(e) => setMacNativeWorkerUrl(e.target.value)}
                />
                <Input
                  name="macNativeModelRoot"
                  label="Model Folder"
                  placeholder="~/Library/Application Support/Project N.O.M.A.D/mac-ai/models"
                  value={macNativeModelRoot}
                  onChange={(e) => setMacNativeModelRoot(e.target.value)}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <StyledButton
                  variant="primary"
                  onClick={() => handleSaveMacAiProvider()}
                  loading={remoteOllamaSaving}
                  disabled={remoteOllamaSaving}
                >
                  Save Native Settings
                </StyledButton>
                <StyledButton
                  variant="ghost"
                  icon="IconRefresh"
                  onClick={() => refetchMacAiStatus()}
                >
                  Check Worker
                </StyledButton>
                <span
                  className={`text-sm font-semibold ${macAiStatus?.connected ? 'text-desert-green' : 'text-desert-red'}`}
                >
                  {macAiStatus?.connected ? 'Native worker online' : 'Native worker offline'}
                </span>
              </div>
              {macAiStatus?.message && (
                <p className="mt-2 text-sm text-text-muted">{macAiStatus.message}</p>
              )}
              {macAiStatus?.models && macAiStatus.models.length > 0 && (
                <div className="mt-4 overflow-hidden rounded border border-border-subtle">
                  <table className="min-w-full divide-y divide-border-subtle">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs uppercase text-text-muted">
                          Model
                        </th>
                        <th className="px-4 py-2 text-left text-xs uppercase text-text-muted">
                          Backend
                        </th>
                        <th className="px-4 py-2 text-left text-xs uppercase text-text-muted">
                          Chat
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {macAiStatus.models.map((model) => (
                        <tr key={model.id}>
                          <td className="px-4 py-2 text-sm text-text-primary">{model.name}</td>
                          <td className="px-4 py-2 text-sm text-text-secondary">
                            {model.backend.toUpperCase()}
                          </td>
                          <td className="px-4 py-2 text-sm text-text-secondary">
                            {model.usableForChat ? 'Usable' : model.notes || 'Not a chat model'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
              className="mt-1"
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
                                <span className="text-sm text-text-secondary">
                                  {tag.input || 'N/A'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm text-text-secondary">
                                  {tag.context || 'N/A'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm text-text-secondary">
                                  {tag.size || 'N/A'}
                                </span>
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
