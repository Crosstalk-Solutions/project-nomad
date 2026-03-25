import { Head } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
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

export default function ZimPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { openModal, closeAllModals } = useModals()
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
        title={t('contentManager.confirmDelete')}
        onConfirm={() => {
          deleteFileMutation.mutateAsync(file)
          closeAllModals()
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText={t('contentManager.delete')}
        cancelText={t('contentManager.cancel')}
        confirmVariant="danger"
      >
        <p className="text-text-secondary">
          {t('contentManager.confirmDeleteMessage', { name: file.name })}
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
      <Head title={t('contentManager.title')} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-4xl font-semibold mb-2">{t('contentManager.heading')}</h1>
              <p className="text-text-muted">
                {t('contentManager.description')}
              </p>
            </div>
          </div>
          {!isInstalled && (
            <Alert
              title={t('contentManager.kiwixNotInstalled')}
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
                title: t('contentManager.columns.title'),
                render: (record) => (
                  <span className="font-medium">
                    {record.title || record.name}
                  </span>
                ),
              },
              {
                accessor: 'summary',
                title: t('contentManager.columns.summary'),
                render: (record) => (
                  <span className="text-text-secondary text-sm line-clamp-2">
                    {record.summary || '—'}
                  </span>
                ),
              },
              {
                accessor: 'actions',
                title: t('contentManager.columns.actions'),
                render: (record) => (
                  <div className="flex space-x-2">
                    <StyledButton
                      variant="danger"
                      icon={'IconTrash'}
                      onClick={() => {
                        confirmDeleteFile(record)
                      }}
                    >
                      {t('contentManager.delete')}
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
