import { Head, Link } from '@inertiajs/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import { ZimFilesEntry } from '../../../../types/zim'
import api from '~/lib/api'
import StyledButton from '~/components/StyledButton'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'

export default function ZimPage() {
  const queryClient = useQueryClient()
  const { openModal, closeAllModals } = useModals()
  const { data, isLoading } = useQuery<ZimFilesEntry[]>({
    queryKey: ['zim-files'],
    queryFn: getFiles,
  })

  async function getFiles() {
    const res = await api.listZimFiles()
    return res.data.files
  }

  async function confirmDeleteFile(file: ZimFilesEntry) {
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
        <p className="text-gray-700">
          Are you sure you want to delete {file.name}? This action cannot be undone.
        </p>
      </StyledModal>,
      'confirm-delete-file-modal'
    )
  }

  const deleteFileMutation = useMutation({
    mutationFn: async (file: ZimFilesEntry) => api.deleteZimFile(file.name.replace('.zim', '')),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zim-files'] })
    },
  })

  return (
    <SettingsLayout>
      <Head title="ZIM Manager | Project N.O.M.A.D." />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex flex-col">
              <h1 className="text-4xl font-semibold mb-4">ZIM Manager</h1>
              <p className="text-gray-500 mb-4">
                Manage your stored ZIM files and download new ones!
              </p>
            </div>
            <Link href="/settings/zim/remote-explorer">
              <StyledButton icon={'MagnifyingGlassIcon'}>Remote Explorer</StyledButton>
            </Link>
          </div>
          <StyledTable<ZimFilesEntry & { actions?: any }>
            className="font-semibold"
            rowLines={true}
            loading={isLoading}
            compact
            columns={[
              { accessor: 'name', title: 'Name' },
              {
                accessor: 'actions',
                title: 'Actions',
                render: (record) => (
                  <div className="flex space-x-2">
                    <StyledButton
                      variant="danger"
                      icon={'TrashIcon'}
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
