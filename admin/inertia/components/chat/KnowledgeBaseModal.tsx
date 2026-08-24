import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import FileUploader from '~/components/file-uploader'
import StyledButton from '~/components/StyledButton'
import type { DynamicIconName } from '~/lib/icons'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import StyledTable from '~/components/StyledTable'
import { useNotifications } from '~/context/NotificationContext'
import api from '~/lib/api'
import {
  groupAndSortKbFiles,
  type KbFileGroup,
  type KbFileSort,
  type KbFileSortKey,
} from '~/lib/kb_file_grouping'
import type { KbIngestStateValue } from '../../../types/kb_ingest_state'
import { formatBytes } from '~/lib/util'
import {
  IconArrowsSort,
  IconDownload,
  IconEye,
  IconSortAscending,
  IconSortDescending,
  IconX,
} from '@tabler/icons-react'
import { useModals } from '~/context/ModalContext'
import StyledModal from '../StyledModal'
import ActiveEmbedJobs from '~/components/ActiveEmbedJobs'
import { SERVICE_NAMES } from '../../../constants/service_names'
import CollectionsManager from './CollectionsManager'
import { KB_COLLECTIONS } from '../../../constants/kb_collections'
import CollectionCombobox from './CollectionCombobox'

interface KnowledgeBaseModalProps {
  aiAssistantName?: string
  onClose: () => void
}

// File extensions the in-browser viewer can render. Must stay in sync with
// `RagService.VIEWABLE_TEXT_EXTENSIONS` -- anything outside this set falls back
// to Download.
const VIEWABLE_EXTENSIONS = new Set(['md', 'txt', 'csv', 'json', 'yaml', 'yml', 'toml', 'xml', 'html'])

function isViewableExtension(filename: string): boolean {
  const ext = filename.split('.').at(-1)?.toLowerCase() ?? ''
  return VIEWABLE_EXTENSIONS.has(ext)
}

function renderSortHeader(
  label: string,
  key: KbFileSortKey,
  sort: KbFileSort,
  setSort: (s: KbFileSort) => void
): React.ReactNode {
  const active = sort.key === key
  const Icon = !active ? IconArrowsSort : sort.direction === 'asc' ? IconSortAscending : IconSortDescending
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-left hover:text-text-primary transition-colors"
      onClick={() => {
        if (!active) {
          setSort({ key, direction: 'asc' })
        } else {
          setSort({ key, direction: sort.direction === 'asc' ? 'desc' : 'asc' })
        }
      }}
    >
      <span>{label}</span>
      <Icon size={14} className={active ? 'text-text-primary' : 'text-text-muted'} aria-hidden="true" />
    </button>
  )
}

/**
 * Compact label for the per-row ingestion state. Files that exist in Qdrant
 * with no `kb_ingest_state` row (`state === null`) are legacy/pre-RFC-883
 * installs whose chunks are real, so we display them as "Indexed" rather than
 * surfacing the absent-row detail. Admin-docs group has no pill (the "Managed
 * by NOMAD" message in the action column carries the same signal).
 */
function renderStatePill(record: KbFileGroup, t: (key: string) => string): React.ReactNode {
  if (record.bucket === 'admin_docs') return null
  const effective: KbIngestStateValue = record.state ?? 'indexed'

  const base = 'inline-flex items-center text-xs font-medium rounded px-2 py-0.5 border'
  switch (effective) {
    case 'indexed':
      return (
        <span className={`${base} text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-950/40 dark:border-green-800`}>
          {t('chat.knowledge_base.state.indexed')}
        </span>
      )
    case 'pending_decision':
    case 'browse_only':
      return (
        <span className={`${base} text-text-secondary bg-surface-secondary border-border-subtle`}>
          {t('chat.knowledge_base.state.not_indexed')}
        </span>
      )
    case 'failed':
      return (
        <span className={`${base} text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800`}>
          {t('chat.knowledge_base.state.failed')}
        </span>
      )
    case 'stalled':
      return (
        <span className={`${base} text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800`}>
          {t('chat.knowledge_base.state.stalled')}
        </span>
      )
  }
}

type RowAction =
  | { kind: 'index'; label: string; force: boolean; variant: 'primary'; icon: DynamicIconName }
  | { kind: 'reembed'; label: string; force: true; variant: 'secondary'; icon: DynamicIconName }

/**
 * Pick the single adaptive per-row action button. Returns null when no action
 * makes sense for the current state (e.g. healthy indexed file with no
 * warnings -- bulk Re-embed All covers that case). `hasWarnings` lets us
 * surface a Re-embed affordance specifically when a file *looks* indexed but
 * has zero chunks or a stalled-mid-ingestion warning attached.
 */
function pickRowAction(record: KbFileGroup, hasWarnings: boolean, t: (key: string) => string): RowAction | null {
  if (record.bucket === 'admin_docs') return null
  const effective: KbIngestStateValue = record.state ?? 'indexed'
  switch (effective) {
    case 'indexed':
      return hasWarnings
        ? { kind: 'reembed', label: t('chat.knowledge_base.actions.reembed'), force: true, variant: 'secondary', icon: 'IconRefreshAlert' }
        : null
    case 'pending_decision':
      return { kind: 'index', label: t('chat.knowledge_base.actions.index'), force: false, variant: 'primary', icon: 'IconDownload' }
    case 'browse_only':
      return { kind: 'index', label: t('chat.knowledge_base.actions.index'), force: true, variant: 'primary', icon: 'IconDownload' }
    case 'failed':
    case 'stalled':
      return { kind: 'index', label: t('chat.knowledge_base.actions.retry'), force: true, variant: 'primary', icon: 'IconRefresh' }
  }
}

export default function KnowledgeBaseModal({ aiAssistantName = "AI Assistant", onClose }: KnowledgeBaseModalProps) {
  const { t } = useTranslation()
  const { addNotification } = useNotifications()
  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadCollection, setUploadCollection] = useState<string>('')
  const [collectionFilter, setCollectionFilter] = useState<string>('All')
  const [manageCollectionsOpen, setManageCollectionsOpen] = useState(false)
  const [confirmDeleteSource, setConfirmDeleteSource] = useState<string | null>(null)
  const [confirmReembed, setConfirmReembed] = useState<{ source: string; displayName: string } | null>(null)
  const [bulkMode, setBulkMode] = useState<null | 'reembed' | 'reset'>(null)
  const [resetTyped, setResetTyped] = useState('')
  const [sort, setSort] = useState<KbFileSort>({ key: 'name', direction: 'asc' })
  const [viewerSource, setViewerSource] = useState<string | null>(null)
  const fileUploaderRef = useRef<React.ComponentRef<typeof FileUploader>>(null)
  const { openModal, closeModal } = useModals()
  const queryClient = useQueryClient()

  const [isStartingQdrant, setIsStartingQdrant] = useState(false)

  const { data: healthStatus } = useQuery({
    queryKey: ['qdrantHealth'],
    queryFn: () => api.checkRAGHealth(),
    refetchInterval: isStartingQdrant ? 3_000 : 30_000,
  })
  const qdrantOffline = healthStatus?.online === false

  useEffect(() => {
    if (!qdrantOffline) setIsStartingQdrant(false)
  }, [qdrantOffline])

  const { data: storedFiles = [], isLoading: isLoadingFiles } = useQuery({
    queryKey: ['storedFiles'],
    queryFn: () => api.getStoredRAGFiles(),
    select: (data) => data || [],
  })

  const { data: knownCollections = [] } = useQuery({
    queryKey: ['kbCollections'],
    queryFn: () => api.getKnowledgeCollections(),
    select: (data) => data?.collections ?? [],
  })

  const comboboxOptions = useMemo(() => {
    return Array.from(new Set([...KB_COLLECTIONS, ...knownCollections])).sort()
  }, [knownCollections])

  // Per-file conditional warnings (RFC #883 section 6). `ok: false` means the
  // computation itself failed (Qdrant/DB/FS) -- distinct from `ok: true` with
  // an empty map, which means everything is healthy. We surface the failure
  // explicitly so a silent backend failure doesn't masquerade as health.
  const { data: warningsResult } = useQuery({
    queryKey: ['kbFileWarnings'],
    queryFn: () => api.getKbFileWarnings(),
    refetchInterval: 30_000,
  })
  const fileWarnings = warningsResult?.warnings ?? {}
  const warningsUnavailable = warningsResult !== undefined && warningsResult.ok === false

  // Global auto-index policy. KVStore returns `null` for an unset key, which
  // we treat as 'Always' for backward compatibility with installs that predate
  // this UI. The user can opt into Manual mode from the toggle below.
  const { data: ingestPolicySetting } = useQuery({
    queryKey: ['ingestPolicy'],
    queryFn: () => api.getSetting('rag.defaultIngestPolicy'),
  })
  const ingestPolicy: 'Always' | 'Manual' =
    ingestPolicySetting?.value === 'Manual' ? 'Manual' : 'Always'

  const updateIngestPolicyMutation = useMutation({
    mutationFn: (policy: 'Always' | 'Manual') =>
      api.updateSetting('rag.defaultIngestPolicy', policy),
    onSuccess: (_data, policy) => {
      queryClient.invalidateQueries({ queryKey: ['ingestPolicy'] })
      addNotification({
        type: 'success',
        message:
          policy === 'Always'
            ? t('chat.knowledge_base.notifications.auto_index_enabled')
            : t('chat.knowledge_base.notifications.auto_index_disabled'),
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        message: error?.message || t('chat.knowledge_base.notifications.update_policy_failed'),
      })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadDocument(file, uploadCollection || undefined),
  })

  const updateCollectionMutation = useMutation({
    mutationFn: ({ source, collection }: { source: string; collection: string }) =>
      api.updateFileCollection(source, collection || null),
    onSuccess: (data) => {
      addNotification({ type: 'success', message: data?.message || t('chat.knowledge_base.notifications.collection_updated') })
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
      queryClient.invalidateQueries({ queryKey: ['kbCollections'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || t('chat.knowledge_base.notifications.update_collection_failed') })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (source: string) => api.deleteRAGFile(source),
    onSuccess: () => {
      addNotification({ type: 'success', message: t('chat.knowledge_base.notifications.file_removed') })
      setConfirmDeleteSource(null)
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || t('chat.knowledge_base.notifications.delete_failed') })
      setConfirmDeleteSource(null)
    },
  })

  const embedMutation = useMutation({
    mutationFn: ({ source, force }: { source: string; force: boolean }) =>
      api.embedSingleRAGFile(source, force),
    onSuccess: (data) => {
      addNotification({
        type: 'success',
        message: data?.message || t('chat.knowledge_base.notifications.file_queued'),
      })
      setConfirmReembed(null)
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
      queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['kbFileWarnings'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || t('chat.knowledge_base.notifications.queue_failed') })
      setConfirmReembed(null)
    },
  })

  const cleanupFailedMutation = useMutation({
    mutationFn: () => api.cleanupFailedEmbedJobs(),
    onSuccess: (data) => {
      addNotification({ type: 'success', message: data?.message || t('chat.knowledge_base.notifications.failed_jobs_cleaned') })
      queryClient.invalidateQueries({ queryKey: ['failedEmbedJobs'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || t('chat.knowledge_base.notifications.cleanup_failed') })
    },
  })

  const cancelAllMutation = useMutation({
    mutationFn: () => api.cancelAllEmbedJobs(),
    onSuccess: (data) => {
      addNotification({ type: 'success', message: data?.message || t('chat.knowledge_base.notifications.jobs_cancelled') })
      queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['failedEmbedJobs'] })
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
      queryClient.invalidateQueries({ queryKey: ['kbFileWarnings'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || t('chat.knowledge_base.notifications.cancel_jobs_failed') })
    },
  })

  const startQdrantMutation = useMutation({
    mutationFn: () => api.affectService(SERVICE_NAMES.QDRANT, 'start'),
    onSuccess: () => {
      setIsStartingQdrant(true)
      queryClient.invalidateQueries({ queryKey: ['qdrantHealth'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || t('chat.knowledge_base.notifications.start_qdrant_failed') })
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => api.syncRAGStorage(),
    onSuccess: (data) => {
      addNotification({
        type: 'success',
        message: data?.message || t('chat.knowledge_base.notifications.sync_success'),
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        message: error?.message || t('chat.knowledge_base.notifications.sync_failed'),
      })
    },
  })

  const reembedMutation = useMutation({
    mutationFn: () => api.reembedAllRAG(),
    onSuccess: (data) => {
      addNotification({
        type: data?.success ? 'success' : 'error',
        message: data?.message || t('chat.knowledge_base.notifications.reembed_complete'),
      })
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
      queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
      setBulkMode(null)
      setResetTyped('')
    },
    onError: () => {
      addNotification({ type: 'error', message: t('chat.knowledge_base.notifications.reembed_failed') })
      setBulkMode(null)
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => api.resetAndRebuildRAG(),
    onSuccess: (data) => {
      addNotification({
        type: data?.success ? 'success' : 'error',
        message: data?.message || t('chat.knowledge_base.notifications.reset_complete'),
      })
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
      queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
      setBulkMode(null)
      setResetTyped('')
    },
    onError: () => {
      addNotification({ type: 'error', message: t('chat.knowledge_base.notifications.reset_failed') })
      setBulkMode(null)
    },
  })

  const bulkBusy = reembedMutation.isPending || resetMutation.isPending

  const handleUpload = async () => {
    if (files.length === 0) return
    setIsUploading(true)
    let successCount = 0
    const failedNames: string[] = []

    for (const file of files) {
      try {
        await uploadMutation.mutateAsync(file)
        successCount++
      } catch (error: any) {
        failedNames.push(file.name)
      }
    }

    setIsUploading(false)
    setFiles([])
    fileUploaderRef.current?.clear()
    queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })

    if (successCount > 0) {
      addNotification({
        type: 'success',
        message: t('chat.knowledge_base.notifications.files_queued', { count: successCount }),
      })
    }
    for (const name of failedNames) {
      addNotification({ type: 'error', message: t('chat.knowledge_base.notifications.upload_failed', { name }) })
    }
  }

  const handleConfirmCancelAll = () => {
    openModal(
      <StyledModal
        title={t('chat.knowledge_base.cancel_all_modal.title')}
        onConfirm={() => {
          cancelAllMutation.mutate()
          closeModal('confirm-cancel-all-modal')
        }}
        onCancel={() => closeModal('confirm-cancel-all-modal')}
        open={true}
        confirmText={t('chat.knowledge_base.cancel_all_modal.confirm')}
        cancelText={t('chat.knowledge_base.cancel_all_modal.cancel')}
        confirmVariant='danger'
      >
        <p className='text-text-primary'>
          {t('chat.knowledge_base.cancel_all_modal.body')}
        </p>
      </StyledModal>,
      'confirm-cancel-all-modal'
    )
  }

  const handleConfirmSync = () => {
    openModal(
      <StyledModal
        title={t('chat.knowledge_base.sync_modal.title')}
        onConfirm={() => {
          syncMutation.mutate()
          closeModal("confirm-sync-modal")
        }}
        onCancel={() => closeModal("confirm-sync-modal")}
        open={true}
        confirmText={t('chat.knowledge_base.sync_modal.confirm')}
        cancelText={t('chat.knowledge_base.sync_modal.cancel')}
        confirmVariant='primary'
      >
        <p className='text-text-primary'>
          {t('chat.knowledge_base.sync_modal.body')}
        </p>
      </StyledModal>,
      "confirm-sync-modal"
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm transition-opacity">
      <div className="bg-surface-primary rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border-subtle shrink-0">
          <h2 className="text-2xl font-semibold text-text-primary">{t('chat.knowledge_base.title')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-secondary rounded-lg transition-colors"
          >
            <IconX className="h-6 w-6 text-text-muted" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">
          {qdrantOffline && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300 flex items-center justify-between gap-4">
              <span>
                <strong>{t('chat.knowledge_base.qdrant_offline.label')}</strong> {t('chat.knowledge_base.qdrant_offline.message')}
              </span>
              <StyledButton
                variant="danger"
                size="sm"
                onClick={() => startQdrantMutation.mutate()}
                loading={startQdrantMutation.isPending || isStartingQdrant}
                disabled={startQdrantMutation.isPending || isStartingQdrant}
              >
                {isStartingQdrant ? t('chat.knowledge_base.qdrant_offline.starting') : t('chat.knowledge_base.qdrant_offline.start_button')}
              </StyledButton>
            </div>
          )}
          <div className="bg-surface-primary rounded-lg border shadow-md overflow-hidden">
            <div className="p-6">
              <FileUploader
                ref={fileUploaderRef}
                minFiles={1}
                maxFiles={5}
                onUpload={(uploadedFiles) => {
                  setFiles(Array.from(uploadedFiles))
                }}
              />
              <div className="flex justify-center items-center gap-4 my-6">
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  {t('chat.knowledge_base.upload.collection_label')}
                  <CollectionCombobox
                    value={uploadCollection}
                    onChange={setUploadCollection}
                    options={comboboxOptions}
                    className="w-48"
                  />
                </label>
                <StyledButton
                  variant="primary"
                  size="lg"
                  icon="IconUpload"
                  onClick={handleUpload}
                  disabled={files.length === 0 || isUploading || qdrantOffline}
                  loading={isUploading}
                >
                  {t('chat.knowledge_base.upload.button')}
                </StyledButton>
              </div>
            </div>
            <div className="border-t bg-surface-primary p-6">
              <h3 className="text-lg font-semibold text-desert-green mb-4">
                {t('chat.knowledge_base.why_upload.title')}
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">
                      {t('chat.knowledge_base.why_upload.item1_title', { aiAssistantName })}
                    </p>
                    <p className="text-sm text-desert-stone">
                      {t('chat.knowledge_base.why_upload.item1_body', { aiAssistantName })}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">
                      {t('chat.knowledge_base.why_upload.item2_title')}
                    </p>
                    <p className="text-sm text-desert-stone">
                      {t('chat.knowledge_base.why_upload.item2_body')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">
                      {t('chat.knowledge_base.why_upload.item3_title')}
                    </p>
                    <p className="text-sm text-desert-stone">
                      {t('chat.knowledge_base.why_upload.item3_body', { aiAssistantName })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="my-8 p-4 rounded-lg border border-border-subtle bg-surface-secondary">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex-1 min-w-[14rem]">
                <p className="text-sm font-medium text-text-primary">
                  {t('chat.knowledge_base.auto_index.label')}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {t('chat.knowledge_base.auto_index.description')}
                </p>
              </div>
              <div
                role="radiogroup"
                aria-label="Ingest policy"
                className="inline-flex rounded-md overflow-hidden border border-border-subtle"
              >
                {(['Always', 'Manual'] as const).map((option) => {
                  const isActive = ingestPolicy === option
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() =>
                        !isActive && updateIngestPolicyMutation.mutate(option)
                      }
                      disabled={updateIngestPolicyMutation.isPending}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-desert-green text-white'
                          : 'bg-surface-primary text-text-secondary hover:bg-surface-tertiary'
                      } ${updateIngestPolicyMutation.isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {option === 'Always' ? t('chat.knowledge_base.auto_index.always') : t('chat.knowledge_base.auto_index.manual')}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="my-8">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <StyledSectionHeader title={t('chat.knowledge_base.processing_queue.title')} className="!mb-0" />
              <div className="flex items-center gap-2 flex-wrap">
                <StyledButton
                  variant="danger"
                  size="md"
                  icon="IconTrash"
                  onClick={() => cleanupFailedMutation.mutate()}
                  loading={cleanupFailedMutation.isPending}
                  disabled={cleanupFailedMutation.isPending || qdrantOffline}
                >
                  {t('chat.knowledge_base.processing_queue.clean_up_failed')}
                </StyledButton>
                <StyledButton
                  variant="danger"
                  size="md"
                  icon="IconPlayerStop"
                  onClick={handleConfirmCancelAll}
                  loading={cancelAllMutation.isPending}
                  disabled={cancelAllMutation.isPending}
                  title={t('chat.knowledge_base.processing_queue.cancel_all_title')}
                >
                  {t('chat.knowledge_base.processing_queue.cancel_all')}
                </StyledButton>
              </div>
            </div>
            <ActiveEmbedJobs withHeader={false} />
          </div>

          <div className="my-12">
            <div className='flex items-center justify-between mb-6 gap-2 flex-wrap'>
              <StyledSectionHeader title={t('chat.knowledge_base.stored_files.title')} className='!mb-0' />
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  {t('chat.knowledge_base.stored_files.search_in')}
                  <select
                    value={collectionFilter}
                    onChange={(e) => setCollectionFilter(e.target.value)}
                    className="rounded border border-border-subtle bg-surface-primary px-3 py-2 text-text-primary"
                  >
                    <option value="All">{t('chat.knowledge_base.stored_files.all_collections')}</option>
                    {knownCollections.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <StyledButton
                  variant="secondary"
                  size="md"
                  icon="IconSettings"
                  onClick={() => setManageCollectionsOpen(true)}
                >
                  {t('chat.knowledge_base.stored_files.manage_collections')}
                </StyledButton>
                <StyledButton
                  variant="danger"
                  size="md"
                  icon='IconAlertTriangle'
                  onClick={() => { setResetTyped(''); setBulkMode('reset') }}
                  disabled={isUploading || qdrantOffline || bulkBusy}
                  loading={resetMutation.isPending}
                  title={t('chat.knowledge_base.stored_files.reset_title')}
                >
                  {t('chat.knowledge_base.stored_files.reset_rebuild')}
                </StyledButton>
                <StyledButton
                  variant="secondary"
                  size="md"
                  icon='IconRefreshAlert'
                  onClick={() => setBulkMode('reembed')}
                  disabled={isUploading || qdrantOffline || bulkBusy || storedFiles.length === 0}
                  loading={reembedMutation.isPending}
                  title={t('chat.knowledge_base.stored_files.reembed_all_title')}
                >
                  {t('chat.knowledge_base.stored_files.reembed_all')}
                </StyledButton>
                <StyledButton
                  variant="secondary"
                  size="md"
                  icon='IconRefresh'
                  onClick={handleConfirmSync}
                  disabled={syncMutation.isPending || isUploading || qdrantOffline || bulkBusy}
                  loading={syncMutation.isPending || isUploading}
                  title={t('chat.knowledge_base.stored_files.sync_title')}
                >
                  {t('chat.knowledge_base.stored_files.sync_storage')}
                </StyledButton>

              </div>
            </div>
            {warningsUnavailable && (
              <div className="mb-4 inline-flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                <span aria-hidden="true">⚠</span>
                <span>
                  {t('chat.knowledge_base.warnings_unavailable')}
                </span>
              </div>
            )}
            <StyledTable<KbFileGroup>
              className="font-semibold"
              rowLines={true}
              columns={[
                {
                  accessor: 'source',
                  title: renderSortHeader(t('chat.knowledge_base.table.file_name'), 'name', sort, setSort),
                  render(record) {
                    const warnings = fileWarnings[record.source] ?? []
                    const pill = renderStatePill(record, t)
                    return (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-text-primary">
                          {record.displayName}
                        </span>
                        {(pill || warnings.length > 0) && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {pill}
                            {warnings.map((w, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1.5 self-start text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-2 py-0.5"
                              >
                                <span aria-hidden="true">⚠</span>
                                {w.kind === 'zero_chunks' && (
                                  <span>
                                    {t('chat.knowledge_base.warnings.zero_chunks')}
                                  </span>
                                )}
                                {w.kind === 'partial_stall' && (
                                  <span>
                                    {t('chat.knowledge_base.warnings.partial_stall', {
                                      chunksEmbedded: w.chunksEmbedded.toLocaleString(),
                                      chunksExpected: w.chunksExpected.toLocaleString(),
                                    })}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  },
                },
                {
                  accessor: 'size',
                  title: renderSortHeader(t('chat.knowledge_base.table.size'), 'size', sort, setSort),
                  className: 'whitespace-nowrap',
                  render(record) {
                    if (record.bucket === 'admin_docs' || record.size === null) {
                      return <span className="text-text-muted">—</span>
                    }
                    return <span className="text-text-secondary">{formatBytes(record.size)}</span>
                  },
                },
                {
                  accessor: 'uploadedAt',
                  title: renderSortHeader(t('chat.knowledge_base.table.uploaded'), 'uploadedAt', sort, setSort),
                  className: 'whitespace-nowrap',
                  render(record) {
                    if (record.bucket === 'admin_docs' || !record.uploadedAt) {
                      return <span className="text-text-muted">—</span>
                    }
                    const d = new Date(record.uploadedAt)
                    return (
                      <span className="text-text-secondary" title={d.toISOString()}>
                        {d.toLocaleDateString()}
                      </span>
                    )
                  },
                },
                {
                  accessor: 'collection',
                  title: t('chat.knowledge_base.table.collection'),
                  className: 'whitespace-nowrap',
                  render(record) {
                    if (record.bucket === 'admin_docs') {
                      return <span className="text-text-muted">—</span>
                    }
                    const isSaving =
                      updateCollectionMutation.isPending &&
                      updateCollectionMutation.variables?.source === record.source
                    return (
                      <CollectionCombobox
                        value={record.collection ?? ''}
                        onChange={(val) => updateCollectionMutation.mutate({ source: record.source, collection: val })}
                        options={comboboxOptions}
                        disabled={isSaving}
                        className="w-40"
                      />
                    )
                  },
                },
                {
                  accessor: 'source',
                  title: '',
                  render(record) {
                    if (record.bucket === 'admin_docs') {
                      return (
                        <div className="flex justify-end">
                          <span className="text-sm text-text-muted italic">
                            {t('chat.knowledge_base.table.managed_by_nomad')}
                          </span>
                        </div>
                      )
                    }

                    const isConfirming = confirmDeleteSource === record.source
                    const isDeleting = deleteMutation.isPending && confirmDeleteSource === record.source
                    if (isConfirming) {
                      return (
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-sm text-text-secondary">{t('chat.knowledge_base.table.confirm_remove')}</span>
                          <StyledButton
                            variant='danger'
                            size='sm'
                            onClick={() => deleteMutation.mutate(record.source)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? t('chat.knowledge_base.table.deleting') : t('chat.knowledge_base.table.confirm')}
                          </StyledButton>
                          <StyledButton
                            variant='ghost'
                            size='sm'
                            onClick={() => setConfirmDeleteSource(null)}
                            disabled={isDeleting}
                          >
                            {t('chat.knowledge_base.table.cancel')}
                          </StyledButton>
                        </div>
                      )
                    }

                    const warnings = fileWarnings[record.source] ?? []
                    const action = pickRowAction(record, warnings.length > 0, t)
                    const actionPendingForThisRow =
                      embedMutation.isPending && embedMutation.variables?.source === record.source

                    const canView = record.isUserUpload && isViewableExtension(record.displayName) && record.size !== null
                    const canDownload = record.isUserUpload && record.size !== null

                    return (
                      <div className="flex justify-end items-center gap-2">
                        {action && (
                          <StyledButton
                            variant={action.variant}
                            size="sm"
                            icon={action.icon}
                            onClick={() => {
                              if (action.kind === 'reembed') {
                                setConfirmReembed({ source: record.source, displayName: record.displayName })
                              } else {
                                embedMutation.mutate({ source: record.source, force: action.force })
                              }
                            }}
                            disabled={qdrantOffline || deleteMutation.isPending || embedMutation.isPending}
                            loading={actionPendingForThisRow}
                          >
                            {action.label}
                          </StyledButton>
                        )}
                        {canView && (
                          <StyledButton
                            variant="ghost"
                            size="sm"
                            icon="IconEye"
                            onClick={() => setViewerSource(record.source)}
                          >{t('chat.knowledge_base.table.view')}</StyledButton>
                        )}
                        {canDownload && (
                          <StyledButton
                            variant="ghost"
                            size="sm"
                            icon="IconDownload"
                            onClick={() => {
                              window.location.href = `/api/rag/files/download?source=${encodeURIComponent(record.source)}`
                            }}
                          >{t('chat.knowledge_base.table.download')}</StyledButton>
                        )}
                        <StyledButton
                          variant="danger"
                          size="sm"
                          icon="IconTrash"
                          onClick={() => setConfirmDeleteSource(record.source)}
                          disabled={deleteMutation.isPending || embedMutation.isPending}
                          loading={deleteMutation.isPending && confirmDeleteSource === record.source}
                        >{t('chat.knowledge_base.table.delete')}</StyledButton>
                      </div>
                    )
                  },
                },
              ]}
              data={groupAndSortKbFiles(
                collectionFilter === 'All'
                  ? storedFiles
                  : storedFiles.filter((f) => f.collection === collectionFilter),
                sort
              )}
              loading={isLoadingFiles}
            />
          </div>
        </div>
      </div>

      {bulkMode === 'reembed' && (
        <StyledModal
          title={t('chat.knowledge_base.reembed_modal.title')}
          open={true}
          confirmText={reembedMutation.isPending ? t('chat.knowledge_base.reembed_modal.confirming') : t('chat.knowledge_base.reembed_modal.confirm')}
          cancelText={t('chat.knowledge_base.reembed_modal.cancel')}
          confirmVariant='primary'
          confirmLoading={reembedMutation.isPending}
          onConfirm={() => reembedMutation.mutate()}
          onCancel={() => setBulkMode(null)}
        >
          <div className='text-text-primary text-sm space-y-3 text-left'>
            <p>
              {t('chat.knowledge_base.reembed_modal.body', { count: storedFiles.length })}
            </p>
            <div className='rounded border border-border-subtle bg-surface-secondary p-3'>
              <p className='font-semibold mb-1'>{t('chat.knowledge_base.reembed_modal.what_for_title')}</p>
              <p className='text-text-secondary'>
                {t('chat.knowledge_base.reembed_modal.what_for_body')}
              </p>
            </div>
            <div className='rounded border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-3 text-amber-900 dark:text-amber-200'>
              <p className='font-semibold mb-1'>{t('chat.knowledge_base.reembed_modal.heads_up_title')}</p>
              <ul className='list-disc pl-5 space-y-1'>
                <li>{t('chat.knowledge_base.reembed_modal.warning1', { count: storedFiles.length })}</li>
                <li>{t('chat.knowledge_base.reembed_modal.warning2')}</li>
                <li>{t('chat.knowledge_base.reembed_modal.warning3')}</li>
                <li>{t('chat.knowledge_base.reembed_modal.warning4')}</li>
              </ul>
            </div>
          </div>
        </StyledModal>
      )}

      {bulkMode === 'reset' && (
        <StyledModal
          title={t('chat.knowledge_base.reset_modal.title')}
          open={true}
          confirmText={resetMutation.isPending ? t('chat.knowledge_base.reset_modal.confirming') : t('chat.knowledge_base.reset_modal.confirm')}
          cancelText={t('chat.knowledge_base.reset_modal.cancel')}
          confirmVariant='danger'
          confirmLoading={resetMutation.isPending}
          onConfirm={() => {
            if (resetTyped === 'RESET') resetMutation.mutate()
          }}
          onCancel={() => { setBulkMode(null); setResetTyped('') }}
        >
          <div className='text-text-primary text-sm space-y-3 text-left'>
            <p>
              {t('chat.knowledge_base.reset_modal.body', { count: storedFiles.length })}
            </p>
            <div className='rounded border border-border-subtle bg-surface-secondary p-3'>
              <p className='font-semibold mb-1'>{t('chat.knowledge_base.reset_modal.diff_title')}</p>
              <ul className='list-disc pl-5 space-y-1 text-text-secondary'>
                <li>{t('chat.knowledge_base.reset_modal.diff_reembed')}</li>
                <li>{t('chat.knowledge_base.reset_modal.diff_reset')}</li>
              </ul>
            </div>
            <div className='rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-900 dark:text-red-200'>
              <p className='font-semibold mb-1'>{t('chat.knowledge_base.reset_modal.destructive_title')}</p>
              <ul className='list-disc pl-5 space-y-1'>
                <li>{t('chat.knowledge_base.reset_modal.warning1')}</li>
                <li>{t('chat.knowledge_base.reset_modal.warning2')}</li>
                <li>{t('chat.knowledge_base.reset_modal.warning3')}</li>
              </ul>
            </div>
            <div>
              <label className='block text-sm font-semibold mb-1'>
                {t('chat.knowledge_base.reset_modal.type_to_confirm')}
              </label>
              <input
                type='text'
                value={resetTyped}
                onChange={(e) => setResetTyped(e.target.value)}
                placeholder='RESET'
                autoFocus
                className='w-full rounded border border-border-subtle bg-surface-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-red-500'
              />
              {resetTyped.length > 0 && resetTyped !== 'RESET' && (
                <p className='text-xs text-red-600 mt-1'>{t('chat.knowledge_base.reset_modal.type_error')}</p>
              )}
            </div>
          </div>
        </StyledModal>
      )}

      {confirmReembed && (
        <StyledModal
          title={t('chat.knowledge_base.reembed_file_modal.title')}
          open={true}
          confirmText={embedMutation.isPending ? t('chat.knowledge_base.reembed_file_modal.confirming') : t('chat.knowledge_base.reembed_file_modal.confirm')}
          cancelText={t('chat.knowledge_base.reembed_file_modal.cancel')}
          confirmVariant='primary'
          confirmLoading={embedMutation.isPending}
          onConfirm={() =>
            embedMutation.mutate({ source: confirmReembed.source, force: true })
          }
          onCancel={() => setConfirmReembed(null)}
        >
          <div className='text-text-primary text-sm space-y-3 text-left'>
            <p>
              {t('chat.knowledge_base.reembed_file_modal.body', { fileName: confirmReembed.displayName })}
            </p>
            <div className='rounded border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-3 text-amber-900 dark:text-amber-200'>
              <p className='font-semibold mb-1'>{t('chat.knowledge_base.reembed_file_modal.heads_up_title')}</p>
              <ul className='list-disc pl-5 space-y-1'>
                <li>{t('chat.knowledge_base.reembed_file_modal.warning1')}</li>
                <li>{t('chat.knowledge_base.reembed_file_modal.warning2')}</li>
                <li>{t('chat.knowledge_base.reembed_file_modal.warning3')}</li>
              </ul>
            </div>
          </div>
        </StyledModal>
      )}

      {viewerSource && (
        <FileViewerModal
          source={viewerSource}
          onClose={() => setViewerSource(null)}
        />
      )}

      {manageCollectionsOpen && (
        <CollectionsManager onClose={() => setManageCollectionsOpen(false)} />
      )}
    </div>
  )
}

function FileViewerModal({ source, onClose }: { source: string; onClose: () => void }) {
  const { t } = useTranslation()
  const { data, isLoading, isFetched } = useQuery({
    queryKey: ['rag', 'file-content', source],
    queryFn: () => api.getFileContent(source),
    staleTime: 60_000,
  })

  // Title falls back to the trailing path segment so the modal still has a
  // useful header while the fetch is in-flight or if it failed.
  const fallbackName = source.split(/[/\\]/).at(-1) ?? source
  const title = data?.fileName ?? fallbackName
  // `catchInternal` swallows errors and resolves to undefined, surfacing a
  // toast -- so the "couldn't load" branch is gated on a finished-but-empty
  // fetch rather than on react-query's `isError`.
  const showError = isFetched && !data

  return (
    <StyledModal
      title={title}
      open={true}
      onClose={onClose}
      onCancel={onClose}
      cancelText={t('chat.knowledge_base.file_viewer.close')}
      large
    >
      <div className="text-left text-sm">
        {isLoading && (
          <div className="text-text-secondary">{t('chat.knowledge_base.file_viewer.loading')}</div>
        )}
        {showError && (
          <div className="text-amber-700 dark:text-amber-300">
            {t('chat.knowledge_base.file_viewer.error')}
          </div>
        )}
        {data && (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded border border-border-subtle bg-surface-secondary p-3 font-mono text-xs text-text-primary">
            {data.content}
          </pre>
        )}
      </div>
    </StyledModal>
  )
}
