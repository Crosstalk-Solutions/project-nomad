import { Head } from '@inertiajs/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import api from '~/lib/api'
import StyledButton from '~/components/StyledButton'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import Alert from '~/components/Alert'
import { useNotifications } from '~/context/NotificationContext'
import ZimUploader from '~/components/ZimUploader'
import { ZimFileWithMetadata } from '../../../../types/zim'
import { SERVICE_NAMES } from '../../../../constants/service_names'
import { formatBytes } from '~/lib/util'
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react'

type SortKey = 'name' | 'size'
type SortDirection = 'asc' | 'desc'

export default function ZimPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { openModal, closeAllModals } = useModals()
  const { addNotification } = useNotifications()
  const { isInstalled } = useServiceInstalledStatus(SERVICE_NAMES.KIWIX)
  const [sortKey, setSortKey] = useState<SortKey>('size')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [showUploader, setShowUploader] = useState(false)
  const { data, isLoading } = useQuery<ZimFileWithMetadata[]>({
    queryKey: ['zim-files'],
    queryFn: getFiles,
    refetchOnWindowFocus: false,
  })

  async function getFiles() {
    const res = await api.listZimFiles()
    return res.data.files
  }

  const sortedData = useMemo(() => {
    if (!data) return []
    const copy = [...data]
    copy.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'size') {
        const aSize = a.size_bytes ?? 0
        const bSize = b.size_bytes ?? 0
        cmp = aSize - bSize
      } else {
        const aName = (a.title || a.name).toLowerCase()
        const bName = (b.title || b.name).toLowerCase()
        cmp = aName.localeCompare(bName)
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return copy
  }, [data, sortKey, sortDirection])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection(key === 'size' ? 'desc' : 'asc')
    }
  }

  function renderSortHeader(label: string, key: SortKey) {
    const active = sortKey === key
    const Icon = !active ? IconArrowsSort : sortDirection === 'asc' ? IconArrowUp : IconArrowDown
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className="flex items-center gap-1 font-semibold text-text-primary hover:text-desert-orange"
      >
        {label}
        <Icon className="size-4" />
      </button>
    )
  }

  async function confirmDeleteFile(file: ZimFileWithMetadata) {
    openModal(
      <StyledModal
        title={t('settings_zim.delete_modal.title')}
        onConfirm={() => {
          deleteFileMutation.mutateAsync(file)
          closeAllModals()
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText={t('settings_zim.delete_modal.confirm')}
        cancelText={t('settings_zim.delete_modal.cancel')}
        confirmVariant="danger"
      >
        <p className="text-text-secondary">
          {t('settings_zim.delete_modal.body', { name: file.name })}
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

  const rescanMutation = useMutation({
    mutationFn: async () => api.rescanZimLibrary(),
    onSuccess: (result) => {
      // catchInternal returns undefined on error (and shows its own error toast)
      if (!result) return
      queryClient.invalidateQueries({ queryKey: ['zim-files'] })
      addNotification({
        type: 'success',
        message:
          result.added > 0
            ? t('settings_zim.rescan.found_new', { count: result.added, total: result.after })
            : t('settings_zim.rescan.up_to_date', { count: result.after }),
      })
    },
  })

  return (
    <SettingsLayout>
      <Head title={t('settings_zim.page_title')} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <h1 className="text-4xl font-semibold mb-2">{t('settings_zim.heading')}</h1>
              <p className="text-text-muted">
                {t('settings_zim.subheading')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StyledButton
                variant="secondary"
                icon={showUploader ? 'IconX' : 'IconUpload'}
                onClick={() => setShowUploader((v) => !v)}
              >
                {showUploader ? t('settings_zim.uploader.hide') : t('settings_zim.uploader.show')}
              </StyledButton>
              {isInstalled && (
                <StyledButton
                  variant="secondary"
                  icon={'IconRefresh'}
                  loading={rescanMutation.isPending}
                  title={t('settings_zim.rescan.tooltip')}
                  onClick={() => rescanMutation.mutate()}
                >
                  {t('settings_zim.rescan.button')}
                </StyledButton>
              )}
            </div>
          </div>
          {showUploader && (
            <div className="mt-6">
              <p className="text-text-muted text-sm mb-3">
                {t('settings_zim.uploader.description')}
              </p>
              <ZimUploader
                existingFilenames={data?.map((f) => f.name) ?? []}
                onUploadComplete={(added) => {
                  queryClient.invalidateQueries({ queryKey: ['zim-files'] })
                  queryClient.invalidateQueries({ queryKey: ['wikipedia-state'] })
                  queryClient.invalidateQueries({ queryKey: ['curated-categories'] })
                  setShowUploader(false)
                  addNotification({
                    type: 'success',
                    message:
                      added > 0
                        ? t('settings_zim.uploader.upload_complete_new', { count: added })
                        : t('settings_zim.uploader.upload_complete_up_to_date'),
                  })
                }}
              />
            </div>
          )}
          {!isInstalled && (
            <Alert
              title={t('settings_zim.kiwix_not_installed')}
              type="warning"
              variant='solid'
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
                title: renderSortHeader(t('settings_zim.table.title'), 'name'),
                render: (record) => (
                  <span className="font-medium">
                    {record.title || record.name}
                  </span>
                ),
              },
              {
                accessor: 'summary',
                title: t('settings_zim.table.summary'),
                render: (record) => (
                  <span className="text-text-secondary text-sm line-clamp-2">
                    {record.summary || '—'}
                  </span>
                ),
              },
              {
                accessor: 'size_bytes',
                title: renderSortHeader(t('settings_zim.table.size'), 'size'),
                render: (record) => (
                  <span className="text-text-secondary tabular-nums">
                    {record.size_bytes ? formatBytes(record.size_bytes, 1) : '—'}
                  </span>
                ),
              },
              {
                accessor: 'actions',
                title: t('settings_zim.table.actions'),
                render: (record) => (
                  <div className="flex space-x-2">
                    <StyledButton
                      variant="danger"
                      icon={'IconTrash'}
                      onClick={() => {
                        confirmDeleteFile(record)
                      }}
                    >
                      {t('settings_zim.table.delete_button')}
                    </StyledButton>
                  </div>
                ),
              },
            ]}
            data={sortedData}
          />
        </main>
      </div>
    </SettingsLayout>
  )
}
