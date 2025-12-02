import { Head, router } from '@inertiajs/react'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import StyledButton from '~/components/StyledButton'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'
import { FileEntry } from '../../../types/files'
import MissingBaseAssetsAlert from '~/components/layout/MissingBaseAssetsAlert'
import { useNotifications } from '~/context/NotificationContext'
import { useState } from 'react'
import api from '~/lib/api'
import DownloadURLModal from '~/components/DownloadURLModal'

export default function MapsManager(props: {
  maps: { baseAssetsExist: boolean; regionFiles: FileEntry[] }
}) {
  const { openModal, closeAllModals } = useModals()
  const { addNotification } = useNotifications()
  const [downloading, setDownloading] = useState(false)

  async function downloadBaseAssets() {
    try {
      setDownloading(true)

      const res = await api.downloadBaseMapAssets()
      if (res.success) {
        addNotification({
          type: 'success',
          message: 'Base map assets downloaded successfully.',
        })
        router.reload()
      }
    } catch (error) {
      console.error('Error downloading base assets:', error)
      addNotification({
        type: 'error',
        message: 'An error occurred while downloading the base map assets. Please try again.',
      })
    } finally {
      setDownloading(false)
    }
  }

  async function confirmDeleteFile(file: FileEntry) {
    openModal(
      <StyledModal
        title="Confirm Delete?"
        onConfirm={() => {
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

  async function openDownloadModal() {
    openModal(
      <DownloadURLModal
        title="Download Map File"
        suggestedURL="https://github.com/Crosstalk-Solutions/project-nomad-maps/raw/refs/heads/master/"
        onCancel={() => closeAllModals()}
      />,
      'download-map-file-modal'
    )
  }

  return (
    <SettingsLayout>
      <Head title="Maps Manager" />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-4xl font-semibold mb-2">Maps Manager</h1>
              <p className="text-gray-500">Manage your stored map data files.</p>
            </div>
            <StyledButton
              variant="primary"
              onClick={openDownloadModal}
              loading={downloading}
              icon="CloudArrowDownIcon"
            >
              Download New Map File
            </StyledButton>
          </div>
          {!props.maps.baseAssetsExist && (
            <MissingBaseAssetsAlert loading={downloading} onClickDownload={downloadBaseAssets} />
          )}
          <StyledTable<FileEntry & { actions?: any }>
            className="font-semibold mt-4"
            rowLines={true}
            loading={false}
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
            data={props.maps.regionFiles || []}
          />
        </main>
      </div>
    </SettingsLayout>
  )
}
