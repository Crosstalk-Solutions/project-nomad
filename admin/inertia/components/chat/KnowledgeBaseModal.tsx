import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
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

interface KnowledgeBaseModalProps {
  aiAssistantName?: string
  onClose: () => void
}

// File extensions the in-browser viewer can render. Must stay in sync with
// `RagService.VIEWABLE_TEXT_EXTENSIONS` — anything outside this set falls back
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
function renderStatePill(record: KbFileGroup): React.ReactNode {
  if (record.bucket === 'admin_docs') return null
  const effective: KbIngestStateValue = record.state ?? 'indexed'

  const base = 'inline-flex items-center text-xs font-medium rounded px-2 py-0.5 border'
  switch (effective) {
    case 'indexed':
      return (
        <span className={`${base} text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-950/40 dark:border-green-800`}>
          Indexed
        </span>
      )
    case 'pending_decision':
    case 'browse_only':
      return (
        <span className={`${base} text-text-secondary bg-surface-secondary border-border-subtle`}>
          Not Indexed
        </span>
      )
    case 'failed':
      return (
        <span className={`${base} text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800`}>
          Failed
        </span>
      )
    case 'stalled':
      return (
        <span className={`${base} text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800`}>
          Stalled
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
 * warnings — bulk Re-embed All covers that case). `hasWarnings` lets us
 * surface a Re-embed affordance specifically when a file *looks* indexed but
 * has zero chunks or a stalled-mid-ingestion warning attached.
 */
function pickRowAction(record: KbFileGroup, hasWarnings: boolean): RowAction | null {
  if (record.bucket === 'admin_docs') return null
  const effective: KbIngestStateValue = record.state ?? 'indexed'
  switch (effective) {
    case 'indexed':
      return hasWarnings
        ? { kind: 'reembed', label: 'Re-embed', force: true, variant: 'secondary', icon: 'IconRefreshAlert' }
        : null
    case 'pending_decision':
      return { kind: 'index', label: 'Index', force: false, variant: 'primary', icon: 'IconDownload' }
    case 'browse_only':
      return { kind: 'index', label: 'Index', force: true, variant: 'primary', icon: 'IconDownload' }
    case 'failed':
    case 'stalled':
      return { kind: 'index', label: 'Retry', force: true, variant: 'primary', icon: 'IconRefresh' }
  }
}

export default function KnowledgeBaseModal({ aiAssistantName = "AI Assistant", onClose }: KnowledgeBaseModalProps) {
  const { addNotification } = useNotifications()
  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
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

  // Per-file conditional warnings (RFC #883 §6). `ok: false` means the
  // computation itself failed (Qdrant/DB/FS) — distinct from `ok: true` with
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
            ? 'New content will be auto-indexed for AI.'
            : 'New content will wait for you to opt in.',
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        message: error?.message || 'Failed to update indexing policy.',
      })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadDocument(file),
  })

  const deleteMutation = useMutation({
    mutationFn: (source: string) => api.deleteRAGFile(source),
    onSuccess: () => {
      addNotification({ type: 'success', message: 'File removed from knowledge base.' })
      setConfirmDeleteSource(null)
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || 'Failed to delete file.' })
      setConfirmDeleteSource(null)
    },
  })

  const embedMutation = useMutation({
    mutationFn: ({ source, force }: { source: string; force: boolean }) =>
      api.embedSingleRAGFile(source, force),
    onSuccess: (data) => {
      addNotification({
        type: 'success',
        message: data?.message || 'File queued for embedding.',
      })
      setConfirmReembed(null)
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
      queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['kbFileWarnings'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || 'Failed to queue file.' })
      setConfirmReembed(null)
    },
  })

  const cleanupFailedMutation = useMutation({
    mutationFn: () => api.cleanupFailedEmbedJobs(),
    onSuccess: (data) => {
      addNotification({ type: 'success', message: data?.message || 'Failed jobs cleaned up.' })
      queryClient.invalidateQueries({ queryKey: ['failedEmbedJobs'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || 'Failed to clean up jobs.' })
    },
  })

  const startQdrantMutation = useMutation({
    mutationFn: () => api.affectService(SERVICE_NAMES.QDRANT, 'start'),
    onSuccess: () => {
      setIsStartingQdrant(true)
      queryClient.invalidateQueries({ queryKey: ['qdrantHealth'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || 'Failed to start Qdrant.' })
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => api.syncRAGStorage(),
    onSuccess: (data) => {
      addNotification({
        type: 'success',
        message: data?.message || 'Storage synced successfully. If new files were found, they have been queued for processing.',
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        message: error?.message || 'Failed to sync storage',
      })
    },
  })

  const reembedMutation = useMutation({
    mutationFn: () => api.reembedAllRAG(),
    onSuccess: (data) => {
      addNotification({
        type: data?.success ? 'success' : 'error',
        message: data?.message || 'Re-embed completed.',
      })
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
      queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
      setBulkMode(null)
      setResetTyped('')
    },
    onError: () => {
      addNotification({ type: 'error', message: 'Failed to re-embed knowledge base.' })
      setBulkMode(null)
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => api.resetAndRebuildRAG(),
    onSuccess: (data) => {
      addNotification({
        type: data?.success ? 'success' : 'error',
        message: data?.message || 'Reset complete.',
      })
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
      queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
      setBulkMode(null)
      setResetTyped('')
    },
    onError: () => {
      addNotification({ type: 'error', message: 'Failed to reset knowledge base.' })
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
        message: `${successCount} file${successCount > 1 ? 's' : ''} queued for processing.`,
      })
    }
    for (const name of failedNames) {
      addNotification({ type: 'error', message: `Failed to upload: ${name}` })
    }
  }

  const handleConfirmSync = () => {
    openModal(
      <StyledModal
        title='Confirm Sync?'
        onConfirm={() => {
          syncMutation.mutate()
          closeModal(
            "confirm-sync-modal"
          )
        }}
        onCancel={() => closeModal("confirm-sync-modal")}
        open={true}
        confirmText='Confirm Sync'
        cancelText='Cancel'
        confirmVariant='primary'
      >
        <p className='text-text-primary'>
          This will scan the NOMAD's storage directories for any new files and queue them for processing. This is useful if you've manually added files to the storage or want to ensure everything is up to date.
          This may cause a temporary increase in resource usage if new files are found and being processed. Are you sure you want to proceed?
        </p>
      </StyledModal>,
      "confirm-sync-modal"
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm transition-opacity">
      <div className="bg-surface-primary rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border-subtle shrink-0">
          <h2 className="text-2xl font-semibold text-text-primary">Knowledge Base</h2>
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
                <strong>Knowledge Base unavailable:</strong> The Qdrant vector database is offline.
              </span>
              <StyledButton
                variant="danger"
                size="sm"
                onClick={() => startQdrantMutation.mutate()}
                loading={startQdrantMutation.isPending || isStartingQdrant}
                disabled={startQdrantMutation.isPending || isStartingQdrant}
              >
                {isStartingQdrant ? 'Starting…' : 'Start Qdrant'}
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
              <div className="flex justify-center gap-4 my-6">
                <StyledButton
                  variant="primary"
                  size="lg"
                  icon="IconUpload"
                  onClick={handleUpload}
                  disabled={files.length === 0 || isUploading || qdrantOffline}
                  loading={isUploading}
                >
                  Upload
                </StyledButton>
              </div>
            </div>
            <div className="border-t bg-surface-primary p-6">
              <h3 className="text-lg font-semibold text-desert-green mb-4">
                Why upload documents to your Knowledge Base?
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">
                      {aiAssistantName} Knowledge Base Integration
                    </p>
                    <p className="text-sm text-desert-stone">
                      When you upload documents to your Knowledge Base, NOMAD processes and embeds
                      the content, making it directly accessible to {aiAssistantName}. This allows{' '}
                      {aiAssistantName} to reference your specific documents during conversations,
                      providing more accurate and personalized responses based on your uploaded
                      data.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">
                      Enhanced Document Processing with OCR
                    </p>
                    <p className="text-sm text-desert-stone">
                      NOMAD includes built-in Optical Character Recognition (OCR) capabilities,
                      allowing it to extract text from image-based documents such as scanned PDFs or
                      photos. This means that even if your documents are not in a standard text
                      format, NOMAD can still process and embed their content for AI access.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">
                      Information Library Integration
                    </p>
                    <p className="text-sm text-desert-stone">
                      NOMAD will automatically discover and extract any content you save to your
                      Information Library (if installed), making it instantly available to {aiAssistantName} without any extra steps.
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
                  Auto-index new content for AI?
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Indexed content typically uses 5–10× the original file size on disk.
                  Changes apply to new content added after this setting changes.
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
                      } ${updateIngestPolicyMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="my-8">
            <div className="flex items-center justify-between mb-4">
              <StyledSectionHeader title="Processing Queue" className="!mb-0" />
              <StyledButton
                variant="danger"
                size="md"
                icon="IconTrash"
                onClick={() => cleanupFailedMutation.mutate()}
                loading={cleanupFailedMutation.isPending}
                disabled={cleanupFailedMutation.isPending || qdrantOffline}
              >
                Clean Up Failed
              </StyledButton>
            </div>
            <ActiveEmbedJobs withHeader={false} />
          </div>

          <div className="my-12">
            <div className='flex items-center justify-between mb-6 gap-2 flex-wrap'>
              <StyledSectionHeader title="Stored Knowledge Base Files" className='!mb-0' />
              <div className="flex items-center gap-2 flex-wrap">
                <StyledButton
                  variant="danger"
                  size="md"
                  icon='IconAlertTriangle'
                  onClick={() => { setResetTyped(''); setBulkMode('reset') }}
                  disabled={isUploading || qdrantOffline || bulkBusy}
                  loading={resetMutation.isPending}
                  title="Drop the entire embeddings collection and re-embed everything from scratch. Permanently removes vectors for files no longer on disk. Destructive: requires typing RESET to confirm."
                >
                  Reset & Rebuild
                </StyledButton>
                <StyledButton
                  variant="secondary"
                  size="md"
                  icon='IconRefreshAlert'
                  onClick={() => setBulkMode('reembed')}
                  disabled={isUploading || qdrantOffline || bulkBusy || storedFiles.length === 0}
                  loading={reembedMutation.isPending}
                  title="Re-embed every file on disk, replacing existing vectors file-by-file. Vectors for files no longer on disk are preserved. Use this if the chunker or embedding model has changed."
                >
                  Re-embed All
                </StyledButton>
                <StyledButton
                  variant="secondary"
                  size="md"
                  icon='IconRefresh'
                  onClick={handleConfirmSync}
                  disabled={syncMutation.isPending || isUploading || qdrantOffline || bulkBusy}
                  loading={syncMutation.isPending || isUploading}
                  title="Scan storage for new files and queue any that haven't been embedded yet. Safe to run anytime; won't touch already-embedded content."
                >
                  Sync Storage
                </StyledButton>

              </div>
            </div>
            {warningsUnavailable && (
              <div className="mb-4 inline-flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                <span aria-hidden="true">⚠</span>
                <span>
                  File warnings unavailable — couldn't read storage state. Retrying…
                </span>
              </div>
            )}
            <StyledTable<KbFileGroup>
              className="font-semibold"
              rowLines={true}
              columns={[
                {
                  accessor: 'source',
                  title: renderSortHeader('File Name', 'name', sort, setSort),
                  render(record) {
                    const warnings = fileWarnings[record.source] ?? []
                    const pill = renderStatePill(record)
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
                                    Embedded 0 chunks — this file has no text content.
                                    AI Assistant cannot reference it.
                                  </span>
                                )}
                                {w.kind === 'partial_stall' && (
                                  <span>
                                    Only {w.chunksEmbedded.toLocaleString()} of est.{' '}
                                    {w.chunksExpected.toLocaleString()} chunks embedded —
                                    ingestion may have stalled.
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
                  title: renderSortHeader('Size', 'size', sort, setSort),
                  className: 'whitespace-nowrap',
                  render(record) {
                    // The collapsed admin_docs group has no single size — leave blank
                    // rather than misleadingly summing across N files.
                    if (record.bucket === 'admin_docs' || record.size === null) {
                      return <span className="text-text-muted">—</span>
                    }
                    return <span className="text-text-secondary">{formatBytes(record.size)}</span>
                  },
                },
                {
                  accessor: 'uploadedAt',
                  title: renderSortHeader('Uploaded', 'uploadedAt', sort, setSort),
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
                  accessor: 'source',
                  title: '',
                  render(record) {
                    // Admin docs are auto-discovered and managed by NOMAD itself —
                    // deleting one would just be re-embedded on the next sync, so
                    // we surface them as informational only and hide Delete.
                    if (record.bucket === 'admin_docs') {
                      return (
                        <div className="flex justify-end">
                          <span className="text-sm text-text-muted italic">
                            Managed by NOMAD
                          </span>
                        </div>
                      )
                    }

                    const isConfirming = confirmDeleteSource === record.source
                    const isDeleting = deleteMutation.isPending && confirmDeleteSource === record.source
                    if (isConfirming) {
                      return (
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-sm text-text-secondary">Remove from knowledge base?</span>
                          <StyledButton
                            variant='danger'
                            size='sm'
                            onClick={() => deleteMutation.mutate(record.source)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? 'Deleting…' : 'Confirm'}
                          </StyledButton>
                          <StyledButton
                            variant='ghost'
                            size='sm'
                            onClick={() => setConfirmDeleteSource(null)}
                            disabled={isDeleting}
                          >
                            Cancel
                          </StyledButton>
                        </div>
                      )
                    }

                    const warnings = fileWarnings[record.source] ?? []
                    const action = pickRowAction(record, warnings.length > 0)
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
                          >View</StyledButton>
                        )}
                        {canDownload && (
                          <StyledButton
                            variant="ghost"
                            size="sm"
                            icon="IconDownload"
                            onClick={() => {
                              window.location.href = `/api/rag/files/download?source=${encodeURIComponent(record.source)}`
                            }}
                          >Download</StyledButton>
                        )}
                        <StyledButton
                          variant="danger"
                          size="sm"
                          icon="IconTrash"
                          onClick={() => setConfirmDeleteSource(record.source)}
                          disabled={deleteMutation.isPending || embedMutation.isPending}
                          loading={deleteMutation.isPending && confirmDeleteSource === record.source}
                        >Delete</StyledButton>
                      </div>
                    )
                  },
                },
              ]}
              data={groupAndSortKbFiles(storedFiles, sort)}
              loading={isLoadingFiles}
            />
          </div>
        </div>
      </div>

      {bulkMode === 'reembed' && (
        <StyledModal
          title='Re-embed All Documents?'
          open={true}
          confirmText={reembedMutation.isPending ? 'Re-embedding…' : 'Re-embed All'}
          cancelText='Cancel'
          confirmVariant='primary'
          confirmLoading={reembedMutation.isPending}
          onConfirm={() => reembedMutation.mutate()}
          onCancel={() => setBulkMode(null)}
        >
          <div className='text-text-primary text-sm space-y-3 text-left'>
            <p>
              This will re-process every document currently in your knowledge base — about
              <strong> {storedFiles.length} file{storedFiles.length === 1 ? '' : 's'}</strong>.
              For each file, NOMAD will delete the existing embeddings from Qdrant and queue a fresh
              embedding job using the current chunking and embedding model.
            </p>
            <div className='rounded border border-border-subtle bg-surface-secondary p-3'>
              <p className='font-semibold mb-1'>What this is for</p>
              <p className='text-text-secondary'>
                Use this when the embedding model or chunking logic has changed, or when you suspect
                stored vectors are stale. Files on disk are <em>not</em> deleted, and any orphan
                points whose source file is no longer present will be preserved untouched (see
                <em> Reset &amp; Rebuild </em>if you want a fully clean slate).
              </p>
            </div>
            <div className='rounded border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-3 text-amber-900 dark:text-amber-200'>
              <p className='font-semibold mb-1'>Heads up</p>
              <ul className='list-disc pl-5 space-y-1'>
                <li>Embedding {storedFiles.length} file{storedFiles.length === 1 ? '' : 's'} may take a long time, especially for large PDFs or ZIM archives.</li>
                <li>On systems without GPU acceleration, expect sustained high CPU usage for the duration.</li>
                <li>Knowledge Base search results may be incomplete until every file finishes re-embedding.</li>
                <li>If embed jobs are already in progress, this action will be refused — wait for the queue to drain first.</li>
              </ul>
            </div>
          </div>
        </StyledModal>
      )}

      {bulkMode === 'reset' && (
        <StyledModal
          title='Reset & Rebuild Knowledge Base?'
          open={true}
          confirmText={resetMutation.isPending ? 'Resetting…' : 'Wipe & Rebuild'}
          cancelText='Cancel'
          confirmVariant='danger'
          confirmLoading={resetMutation.isPending}
          onConfirm={() => {
            if (resetTyped === 'RESET') resetMutation.mutate()
          }}
          onCancel={() => { setBulkMode(null); setResetTyped('') }}
        >
          <div className='text-text-primary text-sm space-y-3 text-left'>
            <p>
              This will <strong>permanently delete every point</strong> in the
              <code> nomad_knowledge_base </code>Qdrant collection and rebuild from the
              <strong> {storedFiles.length} file{storedFiles.length === 1 ? '' : 's'}</strong> currently
              on disk. The collection is dropped, recreated, and every file is re-queued for embedding.
            </p>
            <div className='rounded border border-border-subtle bg-surface-secondary p-3'>
              <p className='font-semibold mb-1'>How this differs from Re-embed All</p>
              <ul className='list-disc pl-5 space-y-1 text-text-secondary'>
                <li><strong>Re-embed All</strong> replaces vectors file-by-file. Any orphan points (vectors whose source file was deleted from disk at some point) are preserved.</li>
                <li><strong>Reset &amp; Rebuild</strong> drops the entire collection. Orphan points are <strong>gone forever</strong>. Only files currently on disk will exist in Qdrant afterwards.</li>
              </ul>
            </div>
            <div className='rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-900 dark:text-red-200'>
              <p className='font-semibold mb-1'>This action is destructive and cannot be undone</p>
              <ul className='list-disc pl-5 space-y-1'>
                <li>Knowledge Base search will be empty until embedding finishes (potentially hours on CPU-only systems).</li>
                <li>For a few seconds during the reset, the Qdrant collection does not exist — any chat-with-RAG queries in that window may return a "collection not found" error. Avoid using chat until the rebuild has begun.</li>
                <li>If embed jobs are already in progress, this action will be refused — wait for the queue to drain first.</li>
              </ul>
            </div>
            <div>
              <label className='block text-sm font-semibold mb-1'>
                Type <code>RESET</code> to confirm:
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
                <p className='text-xs text-red-600 mt-1'>Type RESET exactly (uppercase, no spaces) to enable the confirm button.</p>
              )}
            </div>
          </div>
        </StyledModal>
      )}

      {confirmReembed && (
        <StyledModal
          title='Re-embed this file?'
          open={true}
          confirmText={embedMutation.isPending ? 'Queuing…' : 'Re-embed'}
          cancelText='Cancel'
          confirmVariant='primary'
          confirmLoading={embedMutation.isPending}
          onConfirm={() =>
            embedMutation.mutate({ source: confirmReembed.source, force: true })
          }
          onCancel={() => setConfirmReembed(null)}
        >
          <div className='text-text-primary text-sm space-y-3 text-left'>
            <p>
              This will delete the existing embeddings for{' '}
              <strong>{confirmReembed.displayName}</strong> and queue
              a fresh embedding job. The file on disk is not touched.
            </p>
            <div className='rounded border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-3 text-amber-900 dark:text-amber-200'>
              <p className='font-semibold mb-1'>Heads up</p>
              <ul className='list-disc pl-5 space-y-1'>
                <li>For large ZIM archives this can take a long time, especially on CPU-only systems.</li>
                <li>Search results that referenced this file will be incomplete until the new embedding finishes.</li>
                <li>If a job for this file is already running, the re-embed will be refused — wait for it to finish first.</li>
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
    </div>
  )
}

function FileViewerModal({ source, onClose }: { source: string; onClose: () => void }) {
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
  // toast — so the "couldn't load" branch is gated on a finished-but-empty
  // fetch rather than on react-query's `isError`.
  const showError = isFetched && !data

  return (
    <StyledModal
      title={title}
      open={true}
      onClose={onClose}
      onCancel={onClose}
      cancelText="Close"
      large
    >
      <div className="text-left text-sm">
        {isLoading && (
          <div className="text-text-secondary">Loading…</div>
        )}
        {showError && (
          <div className="text-amber-700 dark:text-amber-300">
            Couldn't load file. It may have been moved or its type isn't viewable.
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
