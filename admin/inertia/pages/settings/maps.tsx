import { Head, router } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import StyledButton from '~/components/StyledButton'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'
import { FileEntry } from '../../../types/files'
import { useNotifications } from '~/context/NotificationContext'
import { useState } from 'react'
import api from '~/lib/api'
import DownloadURLModal from '~/components/DownloadURLModal'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import useDownloads from '~/hooks/useDownloads'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import CuratedCollectionCard from '~/components/CuratedCollectionCard'
import type { CollectionWithStatus } from '../../../types/collections'
import ActiveDownloads from '~/components/ActiveDownloads'
import Alert from '~/components/Alert'

const CURATED_COLLECTIONS_KEY = 'curated-map-collections'

export default function MapsManager(props: {
  maps: { baseAssetsExist: boolean; regionFiles: FileEntry[] }
}) {
  const { t } = useTranslation()
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
        throw new Error(t('mapsManager.baseAssetsUnknownError'))
      }

      if (res.success) {
        addNotification({
          type: 'success',
          message: t('mapsManager.baseAssetsSuccess'),
        })
        router.reload()
      }
    } catch (error) {
      console.error('Error downloading base assets:', error)
      addNotification({
        type: 'error',
        message: t('mapsManager.baseAssetsError'),
      })
    } finally {
      setDownloading(false)
    }
  }

  async function downloadCollection(record: CollectionWithStatus) {
    try {
      await api.downloadMapCollection(record.slug)
      invalidateDownloads()
      addNotification({
        type: 'success',
        message: t('mapsManager.downloadQueued', { name: record.name }),
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
        message: t('mapsManager.customDownloadQueued'),
      })
    } catch (error) {
      console.error('Error downloading custom file:', error)
    }
  }

  async function confirmDeleteFile(file: FileEntry) {
    openModal(
      <StyledModal
        title={t('mapsManager.confirmDelete')}
        onConfirm={() => {
          closeAllModals()
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText={t('mapsManager.delete')}
        cancelText={t('mapsManager.cancel')}
        confirmVariant="danger"
      >
        <p className="text-text-secondary">
          {t('mapsManager.confirmDeleteMessage', { name: file.name })}
        </p>
      </StyledModal>,
      'confirm-delete-file-modal'
    )
  }

  async function confirmDownload(record: CollectionWithStatus) {
    const isCollection = 'resources' in record
    openModal(
      <StyledModal
        title={t('mapsManager.confirmDownload')}
        onConfirm={() => {
          if (isCollection) {
            if (record.all_installed) {
              addNotification({
                message: t('mapsManager.allResourcesDownloaded', { name: record.name }),
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
        confirmText={t('mapsManager.download')}
        cancelText={t('mapsManager.cancel')}
        confirmVariant="primary"
      >
        <p className="text-text-secondary" dangerouslySetInnerHTML={{ __html: t('mapsManager.confirmDownloadMessage', { name: isCollection ? record.name : record }) }} />
      </StyledModal>,
      'confirm-download-file-modal'
    )
  }

  async function openDownloadModal() {
    openModal(
      <DownloadURLModal
        title={t('mapsManager.downloadMapFileTitle')}
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

  const refreshManifests = useMutation({
    mutationFn: () => api.refreshManifests(),
    onSuccess: () => {
      addNotification({
        message: t('mapsManager.refreshSuccess'),
        type: 'success',
      })
      queryClient.invalidateQueries({ queryKey: [CURATED_COLLECTIONS_KEY] })
    },
  })

  return (
    <SettingsLayout>
      <Head title={t('mapsManager.title')} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-4xl font-semibold mb-2">{t('mapsManager.heading')}</h1>
              <p className="text-text-muted">{t('mapsManager.description')}</p>
            </div>
            <div className="flex space-x-4">

            </div>
          </div>
          {!props.maps.baseAssetsExist && (
            <Alert
              title={t('mapsManager.baseAssetsAlert')}
              type="warning"
              variant="solid"
              className="my-4"
              buttonProps={{
                variant: 'secondary',
                children: t('mapsManager.downloadBaseAssets'),
                icon: 'IconDownload',
                loading: downloading,
                onClick: () => downloadBaseAssets(),
              }}
            />
          )}
          <div className="mt-8 mb-6 flex items-center justify-between">
            <StyledSectionHeader title={t('mapsManager.curatedMapRegions')} className="!mb-0" />
            <StyledButton
              onClick={() => refreshManifests.mutate()}
              disabled={refreshManifests.isPending}
              icon="IconRefresh"
            >
              {t('mapsManager.forceRefreshCollections')}
            </StyledButton>
          </div>
          <div className="!mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {curatedCollections?.map((collection) => (
              <CuratedCollectionCard
                key={collection.slug}
                collection={collection}
                onClick={(collection) => confirmDownload(collection)}
              />
            ))}
            {curatedCollections && curatedCollections.length === 0 && (
              <p className="text-text-muted">{t('mapsManager.noCuratedCollections')}</p>
            )}
          </div>
          <div className="mt-12 mb-6 flex items-center justify-between">
            <StyledSectionHeader title={t('mapsManager.storedMapFiles')} className="!mb-0" />
            <StyledButton
              variant="primary"
              onClick={openDownloadModal}
              loading={downloading}
              icon="IconCloudDownload"
            >
              {t('mapsManager.downloadCustomMapFile')}
            </StyledButton>
          </div>
          <StyledTable<FileEntry & { actions?: any }>
            className="font-semibold mt-4"
            rowLines={true}
            loading={false}
            compact
            columns={[
              { accessor: 'name', title: t('mapsManager.columns.name') },
              {
                accessor: 'actions',
                title: t('mapsManager.columns.actions'),
                render: (record) => (
                  <div className="flex space-x-2">
                    <StyledButton
                      variant="danger"
                      icon={'IconTrash'}
                      onClick={() => {
                        confirmDeleteFile(record)
                      }}
                    >
                      {t('mapsManager.delete')}
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
