import { Head } from '@inertiajs/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import api from '~/lib/api'
import StyledButton from '~/components/StyledButton'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import Alert from '~/components/Alert'
import { ZimFileWithMetadata } from '../../../../types/zim'
import { SERVICE_NAMES } from '../../../../constants/service_names'
import { ChangeEvent } from 'react'
import { useNotifications } from '~/context/NotificationContext'
import { getServiceLink } from '~/lib/navigation'

export default function ZimPage() {
  const queryClient = useQueryClient()
  const { openModal, closeAllModals } = useModals()
  const { isInstalled, serviceLocation } = useServiceInstalledStatus(SERVICE_NAMES.KIWIX)
  const { data, isLoading } = useQuery<ZimFileWithMetadata[]>({
    queryKey: ['zim-files'],
    queryFn: getFiles,
  })

  async function getFiles() {
    const res = await api.listZimFiles()
    return res.data.files
  }

  async function confirmDeleteFile(file: ZimFileWithMetadata) {
    openModal(
      <StyledModal
        title="Confirm Delete?"
        onConfirm={() => {
          deleteFileMutation.mutateAsync(file)
          closeAllModals()
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
      >
        <p className="text-text-secondary">
          Are you sure you want to delete {file.name}? This action cannot be undone.
        </p>
      </StyledModal>,
      'confirm-delete-file-modal'
    )
  }

  const deleteFileMutation = useMutation({
    mutationFn: async (file: ZimFileWithMetadata) =>
      api.deleteZimFile(file.name.replace('.zim', '')),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zim-files'] })
    },
  })

  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('zimFile', file)
      api.uploadZimFile(formData)
    },
    onSuccess: () => {
      // 1s to process the file
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['zim-files'] })
      }, 1000)
    },
  })

  const { addNotification } = useNotifications()

  const fileInputOnChange = (ev: ChangeEvent<HTMLInputElement>) => {
    if (ev.target.files?.length) {
      const file = ev.target.files[0]
      if (!file.name.endsWith('.zim')) {
        addNotification({ message: 'Only .zim files are allowed', type: 'error' })
        return
      }
      uploadFileMutation
        .mutateAsync(file)
        .then(() => {
          addNotification({ message: 'File uploaded successfully', type: 'success' })
        })
        .finally(() => {
          const input = document.querySelector<HTMLInputElement>('#file-upload-input')
          if (input) input.value = ''
        })
    }
  }

  return (
    <SettingsLayout>
      <Head title="Content Manager | Project N.O.M.A.D." />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-4xl font-semibold mb-2">Content Manager</h1>
              <p className="text-text-muted">Manage your stored content files.</p>
            </div>
            <StyledButton variant="primary" icon={'IconUpload'} className="relative">
              Upload
              <input
                type="file"
                className="absolute opacity-0 cursor-pointer w-full h-[150%] -top-1/2"
                onChange={fileInputOnChange}
                id="file-upload-input"
              />
            </StyledButton>
          </div>
          {!isInstalled && (
            <Alert
              title="The Kiwix application is not installed. Please install it to view downloaded ZIM files"
              type="warning"
              variant="solid"
              className="!mt-6"
            />
          )}
          <StyledTable<ZimFileWithMetadata & { actions?: any }>
            className="font-semibold mt-4"
            rowLines={true}
            loading={isLoading}
            compact
            columns={[
              {
                accessor: 'title',
                title: 'Title',
                render: (record) => (
                  <span className="font-medium">{record.title || record.name}</span>
                ),
              },
              {
                accessor: 'summary',
                title: 'Summary',
                render: (record) => (
                  <span className="text-text-secondary text-sm line-clamp-2">
                    {record.summary || '—'}
                  </span>
                ),
              },
              {
                accessor: 'actions',
                title: 'Actions',
                render: (record) => (
                  <div className="flex space-x-2">
                    {serviceLocation && (
                      <StyledButton
                        icon={'IconExternalLink'}
                        onClick={() => {
                          window.open(
                            getServiceLink(serviceLocation || 'unknown') +
                              '/viewer#' +
                              record.name.replace('.zim', ''),
                            '_blank'
                          )
                        }}
                      >
                        Open
                      </StyledButton>
                    )}
                    <a href={`/api/zim/${record.name.replace('.zim', '')}/download`} download>
                      <StyledButton variant="primary" icon={'IconDownload'}>
                        Download
                      </StyledButton>
                    </a>
                    <StyledButton
                      variant="danger"
                      icon={'IconTrash'}
                      onClick={() => {
                        confirmDeleteFile(record)
                      }}
                    >
                      Delete
                    </StyledButton>
                  </div>
                ),
              },
            ]}
            data={data || []}
          />
        </main>
      </div>
    </SettingsLayout>
  )
}
