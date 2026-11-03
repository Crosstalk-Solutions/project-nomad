import { Head, router } from '@inertiajs/react'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import StyledButton from '~/components/StyledButton'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'
import { FileEntry } from '../../../types/files'
import { useNotifications } from '~/context/NotificationContext'
import { useEffect, useRef, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import api from '~/lib/api'
import DownloadURLModal from '~/components/DownloadURLModal'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import useDownloads from '~/hooks/useDownloads'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import CuratedCollectionCard from '~/components/CuratedCollectionCard'
import CountryPickerModal from '~/components/CountryPickerModal'
import type { CollectionWithStatus } from '../../../types/collections'
import ActiveDownloads from '~/components/ActiveDownloads'
import Alert from '~/components/Alert'
import { formatBytes } from '~/lib/util'
import { hasDownloadedGlobalMap } from '~/lib/global_map_banner'

const CURATED_COLLECTIONS_KEY = 'curated-map-collections'
const GLOBAL_MAP_INFO_KEY = 'global-map-info'

export default function MapsManager(props: {
  maps: { baseAssetsExist: boolean; worldBasemapExists: boolean; regionFiles: FileEntry[] }
}) {
  const { t } = useTranslation('maps')
  const queryClient = useQueryClient()
  const { openModal, closeAllModals } = useModals()
  const { addNotification } = useNotifications()
  const [downloading, setDownloading] = useState(false)
  const [deletingFileKey, setDeletingFileKey] = useState<string | null>(null)

  const { data: curatedCollections } = useQuery({
    queryKey: [CURATED_COLLECTIONS_KEY],
    queryFn: () => api.listCuratedMapCollections(),
    refetchOnWindowFocus: false,
  })

  const { data: activeMapDownloads = [], invalidate: invalidateDownloads } = useDownloads({
    filetype: 'map',
    enabled: true,
  })

  const prevMapDownloadCountRef = useRef(activeMapDownloads.length)
  useEffect(() => {
    if (activeMapDownloads.length < prevMapDownloadCountRef.current) {
      router.reload({ only: ['maps'] })
    }
    prevMapDownloadCountRef.current = activeMapDownloads.length
  }, [activeMapDownloads.length])

  const { data: globalMapInfo } = useQuery({
    queryKey: [GLOBAL_MAP_INFO_KEY],
    queryFn: () => api.getGlobalMapInfo(),
    refetchOnWindowFocus: false,
  })
  const globalMapAlreadyDownloaded = hasDownloadedGlobalMap(globalMapInfo?.key, props.maps.regionFiles)

  const setupWorldBasemap = useMutation({
    mutationFn: () => api.setupWorldBasemap(),
    onSuccess: () => {
      addNotification({
        type: 'success',
        message: t('manager.base_map_downloaded_success'),
      })
      router.reload({ only: ['maps'] })
    },
    onError: () => {
      addNotification({
        type: 'error',
        message: t('manager.base_map_download_error'),
      })
    },
  })

  const downloadGlobalMap = useMutation({
    mutationFn: () => api.downloadGlobalMap(),
    onSuccess: () => {
      invalidateDownloads()
      addNotification({
        type: 'success',
        message: t('manager.global_map_queued'),
      })
      closeAllModals()
    },
    onError: (error) => {
      console.error('Error downloading global map:', error)
      addNotification({
        type: 'error',
        message: t('manager.global_map_error'),
      })
    },
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
          message: t('manager.base_assets_success'),
        })
        router.reload()
      }
    } catch (error) {
      console.error('Error downloading base assets:', error)
      addNotification({
        type: 'error',
        message: t('manager.base_assets_error'),
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
        message: t('manager.collection_queued', { name: record.name }),
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
        message: t('manager.custom_file_queued'),
      })
    } catch (error) {
      console.error('Error downloading custom file:', error)
    }
  }

  async function deleteFile(file: FileEntry) {
    if (file.type !== 'file') return

    try {
      setDeletingFileKey(file.key)
      await api.deleteMapRegionFile(file.name)
      addNotification({
        type: 'success',
        message: t('manager.file_deleted', { name: file.name }),
      })
      closeAllModals()
      router.reload({ only: ['maps'] })
    } catch (error) {
      console.error('Error deleting map file:', error)
      addNotification({
        type: 'error',
        message: t('manager.file_delete_failed', { name: file.name }),
      })
    } finally {
      setDeletingFileKey(null)
    }
  }

  async function confirmDeleteFile(file: FileEntry) {
    openModal(
      <StyledModal
        title={t('manager.modal_delete_title')}
        onConfirm={() => deleteFile(file)}
        onCancel={closeAllModals}
        open={true}
        confirmText={t('common:buttons.confirm', { defaultValue: 'Delete' })}
        cancelText={t('common:buttons.cancel', { defaultValue: 'Cancel' })}
        confirmVariant="danger"
        confirmLoading={file.type === 'file' && deletingFileKey === file.key}
      >
        <p className="text-text-secondary">
          {t('manager.modal_delete_msg', { name: file.name })}
        </p>
      </StyledModal>,
      'confirm-delete-file-modal'
    )
  }

  async function confirmDownload(record: CollectionWithStatus) {
    const isCollection = 'resources' in record
    openModal(
      <StyledModal
        title={t('manager.modal_download_title')}
        onConfirm={() => {
          if (isCollection) {
            if (record.all_installed) {
              addNotification({
                message: t('manager.all_resources_downloaded', { name: record.name }),
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
        confirmText={t('common:buttons.confirm', { defaultValue: 'Download' })}
        cancelText={t('common:buttons.cancel', { defaultValue: 'Cancel' })}
        confirmVariant="primary"
      >
        <p className="text-text-secondary">
          <Trans
            i18nKey="manager.modal_download_msg"
            ns="maps"
            values={{ name: isCollection ? record.name : record }}
            components={[<strong />]}
          />
        </p>
      </StyledModal>,
      'confirm-download-file-modal'
    )
  }

  async function confirmGlobalMapDownload() {
    if (!globalMapInfo) return
    openModal(
      <StyledModal
        title={t('manager.modal_global_title')}
        onConfirm={() => downloadGlobalMap.mutate()}
        onCancel={closeAllModals}
        open={true}
        confirmText={t('common:buttons.confirm', { defaultValue: 'Download' })}
        cancelText={t('common:buttons.cancel', { defaultValue: 'Cancel' })}
        confirmVariant="primary"
        confirmLoading={downloadGlobalMap.isPending}
      >
        <p className="text-text-secondary">
          {t('manager.modal_global_msg', {
            size: formatBytes(globalMapInfo.size, 1),
            date: globalMapInfo.date,
          })}
        </p>
      </StyledModal>,
      'confirm-global-map-download-modal'
    )
  }

  function openCountryPickerModal() {
    openModal(
      <CountryPickerModal
        onCancel={closeAllModals}
        installedFilenames={(props.maps.regionFiles ?? []).map((f) => f.name)}
        onDownloadStart={() => {
          invalidateDownloads()
          addNotification({
            type: 'success',
            message: t('manager.country_picker_queued'),
          })
          closeAllModals()
        }}
      />,
      'country-picker-modal'
    )
  }

  async function openDownloadModal() {
    openModal(
      <DownloadURLModal
        title={t('manager.modal_custom_title')}
        suggestedURL={t('manager.modal_custom_suggested')}
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
        message: t('manager.manifests_refreshed'),
        type: 'success',
      })
      queryClient.invalidateQueries({ queryKey: [CURATED_COLLECTIONS_KEY] })
    },
  })

  return (
    <SettingsLayout>
      <Head title={t('manager.head_title')} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-4xl font-semibold mb-2">{t('manager.title')}</h1>
              <p className="text-text-muted">{t('manager.subtitle')}</p>
            </div>
            <div className="flex space-x-4"></div>
          </div>
          {!props.maps.baseAssetsExist && (
            <Alert
              title={t('manager.base_assets_alert')}
              type="warning"
              variant="solid"
              className="my-4"
              buttonProps={{
                variant: 'secondary',
                children: t('manager.download_base_assets'),
                icon: 'IconDownload',
                loading: downloading,
                onClick: () => downloadBaseAssets(),
              }}
            />
          )}
          {props.maps.baseAssetsExist && !props.maps.worldBasemapExists && (
            <Alert
              title={t('manager.world_basemap_title')}
              message={t('manager.world_basemap_msg')}
              type="warning"
              variant="solid"
              className="my-4"
              buttonProps={{
                variant: 'secondary',
                children: t('manager.download_base_map'),
                icon: 'IconCloudDownload',
                loading: setupWorldBasemap.isPending,
                onClick: () => setupWorldBasemap.mutate(),
              }}
            />
          )}
          {globalMapInfo && globalMapAlreadyDownloaded && (
            <Alert
              title={t('manager.global_installed_title')}
              message={t('manager.global_installed_msg', {
                date: globalMapInfo.date,
                size: formatBytes(globalMapInfo.size, 1),
              })}
              type="success"
              variant="bordered"
              className="mt-8"
              icon="IconCircleCheck"
              buttonProps={{
                variant: 'secondary',
                children: t('manager.download_latest_build'),
                icon: 'IconRefresh',
                onClick: () => confirmGlobalMapDownload(),
              }}
            />
          )}
          {globalMapInfo && !globalMapAlreadyDownloaded && (
            <Alert
              title={t('manager.global_available_title')}
              message={t('manager.global_available_msg', {
                size: formatBytes(globalMapInfo.size, 1),
                date: globalMapInfo.date,
              })}
              type="info-inverted"
              variant="bordered"
              className="mt-8"
              icon="IconWorld"
              buttonProps={{
                variant: 'primary',
                children: t('manager.download_global_map'),
                icon: 'IconCloudDownload',
                loading: downloadGlobalMap.isPending,
                onClick: () => confirmGlobalMapDownload(),
              }}
            />
          )}
          <Alert
            title={t('manager.country_picker_alert_title')}
            message={t('manager.country_picker_alert_msg')}
            type="info-inverted"
            variant="bordered"
            className="mt-8"
            icon="IconMap2"
            buttonProps={{
              variant: 'primary',
              children: t('manager.choose_countries'),
              icon: 'IconMap2',
              onClick: openCountryPickerModal,
            }}
          />

          <div className="mt-8 mb-6 flex items-center justify-between">
            <StyledSectionHeader title={t('manager.curated_regions')} className="!mb-0" />
            <StyledButton
              onClick={() => refreshManifests.mutate()}
              disabled={refreshManifests.isPending}
              icon="IconRefresh"
            >
              {t('manager.force_refresh_collections')}
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
              <p className="text-text-muted">{t('manager.no_curated_collections')}</p>
            )}
          </div>
          <div className="mt-12 mb-6 flex items-center justify-between">
            <StyledSectionHeader title={t('manager.stored_map_files')} className="!mb-0" />
            <StyledButton
              variant="primary"
              onClick={openDownloadModal}
              loading={downloading}
              icon="IconCloudDownload"
            >
              {t('manager.download_custom_file')}
            </StyledButton>
          </div>
          <StyledTable<FileEntry & { actions?: any }>
            className="font-semibold mt-4"
            rowLines={true}
            loading={false}
            compact
            columns={[
              { accessor: 'name', title: t('manager.th_name') },
              {
                accessor: 'actions',
                title: t('manager.th_actions'),
                render: (record) => (
                  <div className="flex space-x-2">
                    <StyledButton
                      variant="danger"
                      icon={'IconTrash'}
                      onClick={() => {
                        confirmDeleteFile(record)
                      }}
                    >
                      {t('common:buttons.confirm', { defaultValue: 'Delete' })}
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
