import { useMutation, useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import FileUploader from '~/components/file-uploader'
import StyledButton from '~/components/StyledButton'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import StyledTable from '~/components/StyledTable'
import { useNotifications } from '~/context/NotificationContext'
import api from '~/lib/api'
import { IconX } from '@tabler/icons-react'
import { useModals } from '~/context/ModalContext'
import StyledModal from '../StyledModal'

interface KnowledgeBaseModalProps {
  onClose: () => void
}

export default function KnowledgeBaseModal({ onClose }: KnowledgeBaseModalProps) {
  const { addNotification } = useNotifications()
  const [files, setFiles] = useState<File[]>([])
  const fileUploaderRef = useRef<React.ComponentRef<typeof FileUploader>>(null)
  const { openModal, closeModal } = useModals()

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
        message: data?.message || 'Document uploaded and queued for processing',
      })
      setFiles([])
      if (fileUploaderRef.current) {
        fileUploaderRef.current.clear()
      }
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        message: error?.message || 'Failed to upload document',
      })
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
        <p className='text-gray-700'>
          This will scan the NOMAD's storage directories for any new files and queue them for processing. This is useful if you've manually added files to the storage or want to ensure everything is up to date.
          This may cause a temporary increase in resource usage if new files are found and being processed. Are you sure you want to proceed?
        </p>
      </StyledModal>,
      "confirm-sync-modal"
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm transition-opacity">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 shrink-0">
          <h2 className="text-2xl font-semibold text-gray-800">Knowledge Base</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <IconX className="h-6 w-6 text-gray-500" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">
          <div className="bg-white rounded-lg border shadow-md overflow-hidden">
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
            <div className="border-t bg-white p-6">
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
                      AI Assistant Knowledge Base Integration
                    </p>
                    <p className="text-sm text-desert-stone">
                      When you upload documents to your Knowledge Base, NOMAD processes and embeds
                      the content, making it directly accessible to the AI Assistant. This allows
                      the AI Assistant to reference your specific documents during conversations,
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
                      Information Library (if installed), making it instantly available to the AI
                      Assistant without any extra steps.
                    </p>
                  </div>
                </div>
              </div>
            </div>
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
            <StyledTable<{ source: string }>
              className="font-semibold"
              rowLines={true}
              columns={[
                {
                  accessor: 'source',
                  title: 'File Name',
                  render(record) {
                    return <span className="text-gray-700">{record.source}</span>
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
