import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import FileUploader from '~/components/file-uploader'
import StyledButton from '~/components/StyledButton'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import StyledTable from '~/components/StyledTable'
import { useNotifications } from '~/context/NotificationContext'
import api from '~/lib/api'
import { IconDownload, IconEye, IconX } from '@tabler/icons-react'
import { useModals } from '~/context/ModalContext'
import StyledModal from '../StyledModal'
import ActiveEmbedJobs from '~/components/ActiveEmbedJobs'
import { StoredFile } from '../../../../types/rag'

interface KnowledgeBaseModalProps {
  aiAssistantName?: string
  onClose: () => void
}

const TEXT_VIEWABLE_EXTENSIONS = ['md', 'txt', 'csv', 'json', 'yaml', 'yml', 'toml', 'xml', 'html']

function getExtension(fileName: string): string {
  return fileName.split('.').at(-1)?.toLowerCase() ?? ''
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function KnowledgeBaseModal({ aiAssistantName = "AI Assistant", onClose }: KnowledgeBaseModalProps) {
  const { addNotification } = useNotifications()
  const [files, setFiles] = useState<File[]>([])
  const [confirmDeleteSource, setConfirmDeleteSource] = useState<string | null>(null)
  const fileUploaderRef = useRef<React.ComponentRef<typeof FileUploader>>(null)
  const { openModal, closeModal } = useModals()
  const queryClient = useQueryClient()

  const [viewingSource, setViewingSource] = useState<string | null>(null)

  const { data: storedFiles = [], isLoading: isLoadingFiles } = useQuery({
    queryKey: ['storedFiles'],
    queryFn: () => api.getStoredRAGFiles(),
    select: (data) => data || [],
  })

  const { data: viewedFile, isLoading: isLoadingContent } = useQuery({
    queryKey: ['ragFileContent', viewingSource],
    queryFn: () => api.getRAGFileContent(viewingSource!),
    enabled: !!viewingSource,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadDocument(file),
    onSuccess: (data) => {
      addNotification({
        type: 'success',
        message: data?.message || 'Document uploaded and queued for processing',
      })
      setFiles([])
      if (fileUploaderRef.current) {
        fileUploaderRef.current.clear()
      }
      queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        message: error?.message || 'Failed to upload document',
      })
    },
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

  const handleUpload = () => {
    if (files.length > 0) {
      uploadMutation.mutate(files[0])
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
          <div className="bg-surface-primary rounded-lg border shadow-md overflow-hidden">
            <div className="p-6">
              <FileUploader
                ref={fileUploaderRef}
                minFiles={1}
                maxFiles={1}
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
                  disabled={files.length === 0 || uploadMutation.isPending}
                  loading={uploadMutation.isPending}
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
          <div className="my-8">
            <div className="flex items-center justify-between mb-4">
              <StyledSectionHeader title="Processing Queue" className="!mb-0" />
              <StyledButton
                variant="danger"
                size="md"
                icon="IconTrash"
                onClick={() => cleanupFailedMutation.mutate()}
                loading={cleanupFailedMutation.isPending}
                disabled={cleanupFailedMutation.isPending}
              >
                Clean Up Failed
              </StyledButton>
            </div>
            <ActiveEmbedJobs withHeader={false} />
          </div>

          <div className="my-12">
            <div className='flex items-center justify-between mb-6'>
              <StyledSectionHeader title="Stored Knowledge Base Files" className='!mb-0' />
              <StyledButton
                variant="secondary"
                size="md"
                icon='IconRefresh'
                onClick={handleConfirmSync}
                disabled={syncMutation.isPending || uploadMutation.isPending}
                loading={syncMutation.isPending || uploadMutation.isPending}
              >
                Sync Storage
              </StyledButton>
            </div>
            {viewingSource && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-surface-primary rounded-lg shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col">
                  <div className="flex items-center justify-between p-4 border-b border-border-subtle shrink-0">
                    <h3 className="text-lg font-semibold text-text-primary truncate pr-4">
                      {viewedFile?.fileName ?? viewingSource.split(/[/\\]/).at(-1)}
                    </h3>
                    <button
                      onClick={() => setViewingSource(null)}
                      className="p-2 hover:bg-surface-secondary rounded-lg transition-colors shrink-0"
                    >
                      <IconX className="h-5 w-5 text-text-muted" />
                    </button>
                  </div>
                  <div className="overflow-y-auto flex-1 p-4">
                    {isLoadingContent ? (
                      <p className="text-text-muted text-sm">Loading…</p>
                    ) : viewedFile ? (
                      <pre className="text-sm text-text-primary whitespace-pre-wrap break-words font-mono bg-surface-secondary p-4 rounded-lg">
                        {viewedFile.content}
                      </pre>
                    ) : (
                      <p className="text-text-muted text-sm">Could not load file content.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <StyledTable<StoredFile>
              className="font-semibold"
              rowLines={true}
              columns={[
                {
                  accessor: 'fileName',
                  title: 'File Name',
                  render(record) {
                    return <span className="text-text-primary">{record.fileName}</span>
                  },
                },
                {
                  accessor: 'uploadedAt',
                  title: 'Uploaded',
                  render(record) {
                    return <span className="text-text-secondary text-sm">{formatDate(record.uploadedAt)}</span>
                  },
                },
                {
                  accessor: 'size',
                  title: 'Size',
                  render(record) {
                    return <span className="text-text-secondary text-sm">{formatBytes(record.size)}</span>
                  },
                },
                {
                  accessor: 'source',
                  title: '',
                  render(record) {
                    const isConfirming = confirmDeleteSource === record.source
                    const isDeleting = deleteMutation.isPending && confirmDeleteSource === record.source
                    const ext = getExtension(record.fileName)
                    const canView = record.isUserUpload && TEXT_VIEWABLE_EXTENSIONS.includes(ext)
                    const canDownload = record.isUserUpload

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
                    return (
                      <div className="flex justify-end gap-2">
                        {canView && (
                          <StyledButton
                            variant="secondary"
                            size="sm"
                            onClick={() => setViewingSource(record.source)}
                          >
                            <IconEye className="h-4 w-4" />
                          </StyledButton>
                        )}
                        {canDownload && (
                          <a href={api.getRAGFileDownloadUrl(record.source)} download={record.fileName}>
                            <StyledButton variant="secondary" size="sm">
                              <IconDownload className="h-4 w-4" />
                            </StyledButton>
                          </a>
                        )}
                        <StyledButton
                          variant="danger"
                          size="sm"
                          icon="IconTrash"
                          onClick={() => setConfirmDeleteSource(record.source)}
                          disabled={deleteMutation.isPending}
                          loading={deleteMutation.isPending && confirmDeleteSource === record.source}
                        >Delete</StyledButton>
                      </div>
                    )
                  },
                },
              ]}
              data={storedFiles}
              loading={isLoadingFiles}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
