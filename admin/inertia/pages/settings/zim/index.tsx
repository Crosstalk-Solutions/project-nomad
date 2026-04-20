import { Head } from '@inertiajs/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import api from '~/lib/api'
import StyledButton from '~/components/StyledButton'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import Alert from '~/components/Alert'
import ZimUploader from '~/components/ZimUploader'
import { ZimFileWithMetadata } from '../../../../types/zim'
import { SERVICE_NAMES } from '../../../../constants/service_names'
import { formatBytes } from '~/lib/util'
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react'

type SortKey = 'name' | 'size'
type SortDirection = 'asc' | 'desc'

export default function ZimPage() {
  const queryClient = useQueryClient()
  const { openModal, closeAllModals } = useModals()
  const { isInstalled } = useServiceInstalledStatus(SERVICE_NAMES.KIWIX)
  const [sortKey, setSortKey] = useState<SortKey>('size')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [showUploader, setShowUploader] = useState(false)
  const { data, isLoading } = useQuery<ZimFileWithMetadata[]>({
    queryKey: ['zim-files'],
    queryFn: getFiles,
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
            <StyledButton
              variant="secondary"
              icon={showUploader ? 'IconX' : 'IconUpload'}
              onClick={() => setShowUploader((v) => !v)}
            >
              {showUploader ? 'Hide Uploader' : 'Upload ZIM File'}
            </StyledButton>
          </div>
          {showUploader && (
            <div className="mt-6">
              <p className="text-text-muted text-sm mb-3">
                Upload a ZIM file from your browser. Files up to 20 GB are supported. For best results upload from the same machine or over a stable LAN connection. Larger files should be copied directly to the storage volume.
              </p>
              <ZimUploader
                existingFilenames={data?.map((f) => f.name) ?? []}
                onUploadComplete={() => {
                  queryClient.invalidateQueries({ queryKey: ['zim-files'] })
                  queryClient.invalidateQueries({ queryKey: ['wikipedia-state'] })
                  queryClient.invalidateQueries({ queryKey: ['curated-categories'] })
                  setShowUploader(false)
                }}
              />
            </div>
          )}
          {!isInstalled && (
            <Alert
              title="The Kiwix application is not installed. Please install it to view downloaded ZIM files"
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
                title: renderSortHeader('Title', 'name'),
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
                accessor: 'size_bytes',
                title: renderSortHeader('Size', 'size'),
                render: (record) => (
                  <span className="text-text-secondary tabular-nums">
                    {record.size_bytes ? formatBytes(record.size_bytes, 1) : '—'}
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
            data={sortedData}
          />
        </main>
      </div>
    </SettingsLayout>
  )
}
