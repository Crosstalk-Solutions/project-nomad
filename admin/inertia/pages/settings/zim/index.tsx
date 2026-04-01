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
import { useNotifications } from '~/context/NotificationContext'
import { ZimFileWithMetadata } from '../../../../types/zim'
import { SERVICE_NAMES } from '../../../../constants/service_names'

export default function ZimPage() {
  const queryClient = useQueryClient()
  const { openModal, closeAllModals } = useModals()
  const { addNotification } = useNotifications()
  const { isInstalled } = useServiceInstalledStatus(SERVICE_NAMES.KIWIX)
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
    mutationFn: async (file: ZimFileWithMetadata) => api.deleteZimFile(file.name.replace('.zim', '')),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zim-files'] })
    },
  })

  const installKiwix = useMutation({
    mutationFn: () => api.installService(SERVICE_NAMES.KIWIX),
    onSuccess: (result) => {
      if (result?.success) {
        addNotification({
          message: 'Kiwix installation started. This may take a few minutes.',
          type: 'success',
        })
        queryClient.invalidateQueries({ queryKey: ['installed-services'] })
        return
      }

      addNotification({
        message: result?.message || 'Failed to start Kiwix installation.',
        type: 'error',
      })
    },
    onError: () => {
      addNotification({
        message: 'Failed to start Kiwix installation.',
        type: 'error',
      })
    },
  })

  return (
    <SettingsLayout>
      <Head title="Content Manager | Project N.O.M.A.D." />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-4xl font-semibold mb-2">Content Manager</h1>
              <p className="text-text-muted">
                Manage your stored content files.
              </p>
            </div>
          </div>
          {!isInstalled && (
            <div className="mt-6 space-y-3">
              <Alert
                title="The Kiwix application is not installed. Please install it to view downloaded ZIM files"
                type="warning"
                variant='solid'
              />
              <StyledButton
                onClick={() => installKiwix.mutate()}
                disabled={installKiwix.isPending}
                icon={'IconDownload'}
              >
                {installKiwix.isPending ? 'Installing Kiwix...' : 'Install Kiwix'}
              </StyledButton>
            </div>
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
                  <span className="font-medium">
                    {record.title || record.name}
                  </span>
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
