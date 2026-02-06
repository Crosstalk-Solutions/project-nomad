import { Head, router } from '@inertiajs/react'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import StyledButton from '~/components/StyledButton'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'
import { FileEntry } from '../../../types/files'
import { useNotifications } from '~/context/NotificationContext'
import { useEffect, useState } from 'react'
import api from '~/lib/api'
import DownloadURLModal from '~/components/DownloadURLModal'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import useDownloads from '~/hooks/useDownloads'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import CuratedCollectionCard from '~/components/CuratedCollectionCard'
import { CuratedCollectionWithStatus } from '../../../types/downloads'
import ActiveDownloads from '~/components/ActiveDownloads'
import Alert from '~/components/Alert'

const CURATED_COLLECTIONS_KEY = 'curated-map-collections'

export default function MapsManager(props: {
  maps: { baseAssetsExist: boolean; regionFiles: FileEntry[] }
}) {
  const queryClient = useQueryClient()
  const { openModal, closeAllModals } = useModals()
  const { addNotification } = useNotifications()
  const [downloading, setDownloading] = useState(false)

  const { data: curatedCollections } = useQuery({
    queryKey: [CURATED_COLLECTIONS_KEY],
    queryFn: () => api.listCuratedMapCollections(),
    refetchOnWindowFocus: false,
  })

  const { invalidate: invalidateDownloads } = useDownloads({
    filetype: 'map',
    enabled: true,
  })

  async function downloadBaseAssets() {
    try {
      setDownloading(true)

      const res = await api.downloadBaseMapAssets()
      if (!res) {
        throw new Error('An unknown error occurred while downloading base assets.')
      }

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

  async function downloadCollection(record: CuratedCollectionWithStatus) {
    try {
      await api.downloadMapCollection(record.slug)
      invalidateDownloads()
      addNotification({
        type: 'success',
        message: `Download for collection "${record.name}" has been queued.`,
      })
    } catch (error) {
      console.error('Error downloading collection:', error)
    }
  }

  async function downloadCustomFile(url: string) {
    try {
      await api.downloadRemoteMapRegion(url)
      invalidateDownloads()
      addNotification({
        type: 'success',
        message: 'Download has been queued.',
      })
    } catch (error) {
      console.error('Error downloading custom file:', error)
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

  async function confirmDownload(record: CuratedCollectionWithStatus) {
    const isCollection = 'resources' in record
    openModal(
      <StyledModal
        title="Confirm Download?"
        onConfirm={() => {
          if (isCollection) {
            if (record.all_downloaded) {
              addNotification({
                message: `All resources in the collection "${record.name}" have already been downloaded.`,
                type: 'info',
              })
              return
            }
            downloadCollection(record)
          }
          closeAllModals()
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText="Download"
        cancelText="Cancel"
        confirmVariant="primary"
      >
        <p className="text-gray-700">
          Are you sure you want to download <strong>{isCollection ? record.name : record}</strong>?
          It may take some time for it to be available depending on the file size and your internet
          connection.
        </p>
      </StyledModal>,
      'confirm-download-file-modal'
    )
  }

  async function openDownloadModal() {
    openModal(
      <DownloadURLModal
        title="Download Map File"
        suggestedURL="e.g. https://github.com/Crosstalk-Solutions/project-nomad-maps/raw/refs/heads/master/pmtiles/california.pmtiles"
        onCancel={() => closeAllModals()}
        onPreflightSuccess={async (url) => {
          await downloadCustomFile(url)
          closeAllModals()
        }}
      />,
      'download-map-file-modal'
    )
  }

  const fetchLatestCollections = useMutation({
    mutationFn: () => api.fetchLatestMapCollections(),
    onSuccess: () => {
      addNotification({
        message: 'Successfully fetched the latest map collections.',
        type: 'success',
      })
      queryClient.invalidateQueries({ queryKey: [CURATED_COLLECTIONS_KEY] })
    },
  })

  // Auto-fetch latest collections if the list is empty
  useEffect(() => {
    if (
      curatedCollections &&
      curatedCollections.length === 0 &&
      !fetchLatestCollections.isPending
    ) {
      fetchLatestCollections.mutate()
    }
  }, [curatedCollections, fetchLatestCollections])

  return (
    <SettingsLayout>
      <Head title="Maps Manager" />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-4xl font-semibold mb-2">Maps Manager</h1>
              <p className="text-gray-500">Manage your stored map files and explore new regions!</p>
            </div>
            <div className="flex space-x-4">
              <StyledButton
                variant="primary"
                onClick={openDownloadModal}
                loading={downloading}
                icon="IconCloudDownload"
              >
                Download Custom Map File
              </StyledButton>
            </div>
          </div>
          {!props.maps.baseAssetsExist && (
            <Alert
              title="The base map assets have not been installed. Please download them first to enable map functionality."
              type="warning"
              variant="solid"
              className="my-4"
              buttonProps={{
                variant: 'secondary',
                children: 'Download Base Assets',
                icon: 'IconDownload',
                loading: downloading,
                onClick: () => downloadBaseAssets(),
              }}
            />
          )}
          <StyledSectionHeader title="Curated Map Collections" className="mt-8 !mb-4" />
          <StyledButton
            onClick={() => fetchLatestCollections.mutate()}
            disabled={fetchLatestCollections.isPending}
            icon="IconCloudDownload"
          >
            Fetch Latest Collections
          </StyledButton>
          <div className="!mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {curatedCollections?.map((collection) => (
              <CuratedCollectionCard
                key={collection.slug}
                collection={collection}
                onClick={(collection) => confirmDownload(collection)}
              />
            ))}
            {curatedCollections && curatedCollections.length === 0 && (
              <p className="text-gray-500">No curated collections available.</p>
            )}
          </div>
          <StyledSectionHeader title="Stored Map Files" className="mt-12 mb-4" />
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
            data={props.maps.regionFiles || []}
          />
          <ActiveDownloads filetype="map" withHeader />
        </main>
      </div>
    </SettingsLayout>
  )
}
