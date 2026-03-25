import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import FileUploader from '~/components/file-uploader'
import StyledButton from '~/components/StyledButton'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import StyledTable from '~/components/StyledTable'
import { useNotifications } from '~/context/NotificationContext'
import api from '~/lib/api'
import { IconX } from '@tabler/icons-react'
import { useModals } from '~/context/ModalContext'
import StyledModal from '../StyledModal'
import ActiveEmbedJobs from '~/components/ActiveEmbedJobs'

interface KnowledgeBaseModalProps {
  aiAssistantName?: string
  onClose: () => void
}

function sourceToDisplayName(source: string): string {
  const parts = source.split(/[/\\]/)
  return parts[parts.length - 1]
}

export default function KnowledgeBaseModal({ aiAssistantName = "AI Assistant", onClose }: KnowledgeBaseModalProps) {
  const { t } = useTranslation()
  const { addNotification } = useNotifications()
  const [files, setFiles] = useState<File[]>([])
  const [confirmDeleteSource, setConfirmDeleteSource] = useState<string | null>(null)
  const fileUploaderRef = useRef<React.ComponentRef<typeof FileUploader>>(null)
  const { openModal, closeModal } = useModals()
  const queryClient = useQueryClient()

  const { data: storedFiles = [], isLoading: isLoadingFiles } = useQuery({
    queryKey: ['storedFiles'],
    queryFn: () => api.getStoredRAGFiles(),
    select: (data) => data || [],
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadDocument(file),
    onSuccess: (data) => {
      addNotification({
        type: 'success',
        message: data?.message || t('chat.uploadSuccess'),
      })
      setFiles([])
      if (fileUploaderRef.current) {
        fileUploaderRef.current.clear()
      }
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        message: error?.message || t('chat.uploadFailed'),
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (source: string) => api.deleteRAGFile(source),
    onSuccess: () => {
      addNotification({ type: 'success', message: t('chat.fileRemoved') })
      setConfirmDeleteSource(null)
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || t('chat.fileDeleteFailed') })
      setConfirmDeleteSource(null)
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => api.syncRAGStorage(),
    onSuccess: (data) => {
      addNotification({
        type: 'success',
        message: data?.message || t('chat.syncSuccess'),
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        message: error?.message || t('chat.syncFailed'),
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
        title={t('chat.confirmSync')}
        onConfirm={() => {
          syncMutation.mutate()
          closeModal(
            "confirm-sync-modal"
          )
        }}
        onCancel={() => closeModal("confirm-sync-modal")}
        open={true}
        confirmText={t('chat.confirmSyncButton')}
        confirmVariant='primary'
      >
        <p className='text-text-primary'>
          {t('chat.syncDescription')}
        </p>
      </StyledModal>,
      "confirm-sync-modal"
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm transition-opacity">
      <div className="bg-surface-primary rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border-subtle shrink-0">
          <h2 className="text-2xl font-semibold text-text-primary">{t('chat.knowledgeBaseTitle')}</h2>
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
                  {t('common.upload')}
                </StyledButton>
              </div>
            </div>
            <div className="border-t bg-surface-primary p-6">
              <h3 className="text-lg font-semibold text-desert-green mb-4">
                {t('chat.whyUpload')}
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">
                      {t('chat.kbIntegrationTitle', { name: aiAssistantName })}
                    </p>
                    <p className="text-sm text-desert-stone">
                      {t('chat.kbIntegrationDescription', { name: aiAssistantName })}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">
                      {t('chat.ocrTitle')}
                    </p>
                    <p className="text-sm text-desert-stone">
                      {t('chat.ocrDescription')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">
                      {t('chat.libraryTitle')}
                    </p>
                    <p className="text-sm text-desert-stone">
                      {t('chat.libraryDescription', { name: aiAssistantName })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="my-8">
            <ActiveEmbedJobs withHeader={true} />
          </div>

          <div className="my-12">
            <div className='flex items-center justify-between mb-6'>
              <StyledSectionHeader title={t('chat.storedFiles')} className='!mb-0' />
              <StyledButton
                variant="secondary"
                size="md"
                icon='IconRefresh'
                onClick={handleConfirmSync}
                disabled={syncMutation.isPending || uploadMutation.isPending}
                loading={syncMutation.isPending || uploadMutation.isPending}
              >
                {t('chat.syncStorage')}
              </StyledButton>
            </div>
            <StyledTable<{ source: string }>
              className="font-semibold"
              rowLines={true}
              columns={[
                {
                  accessor: 'source',
                  title: t('chat.fileName'),
                  render(record) {
                    return <span className="text-text-primary">{sourceToDisplayName(record.source)}</span>
                  },
                },
                {
                  accessor: 'source',
                  title: '',
                  render(record) {
                    const isConfirming = confirmDeleteSource === record.source
                    const isDeleting = deleteMutation.isPending && confirmDeleteSource === record.source
                    if (isConfirming) {
                      return (
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-sm text-text-secondary">{t('chat.removeFromKb')}</span>
                          <StyledButton
                            variant='danger'
                            size='sm'
                            onClick={() => deleteMutation.mutate(record.source)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? t('chat.deleting') : t('common.confirm')}
                          </StyledButton>
                          <StyledButton
                            variant='ghost'
                            size='sm'
                            onClick={() => setConfirmDeleteSource(null)}
                            disabled={isDeleting}
                          >
                            {t('common.cancel')}
                          </StyledButton>
                        </div>
                      )
                    }
                    return (
                      <div className="flex justify-end">
                        <StyledButton
                          variant="danger"
                          size="sm"
                          icon="IconTrash"
                          onClick={() => setConfirmDeleteSource(record.source)}
                          disabled={deleteMutation.isPending}
                          loading={deleteMutation.isPending && confirmDeleteSource === record.source}
                        >{t('common.delete')}</StyledButton>
                      </div>
                    )
                  },
                },
              ]}
              data={storedFiles.map((source) => ({ source }))}
              loading={isLoadingFiles}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
