import { Head } from '@inertiajs/react'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import { ServiceSlim } from '../../../types/services'
import { getServiceLink } from '~/lib/navigation'
import StyledButton from '~/components/StyledButton'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'
import api from '~/lib/api'
import { useEffect, useState } from 'react'
import InstallActivityFeed from '~/components/InstallActivityFeed'
import LoadingSpinner from '~/components/LoadingSpinner'
import useErrorNotification from '~/hooks/useErrorNotification'
import useInternetStatus from '~/hooks/useInternetStatus'
import useServiceInstallationActivity from '~/hooks/useServiceInstallationActivity'
import { useTranslation } from 'react-i18next'
import { useTransmit } from 'react-adonis-transmit'
import { BROADCAST_CHANNELS } from '../../../constants/broadcast'
import { IconArrowUp, IconCheck, IconDownload } from '@tabler/icons-react'
import UpdateServiceModal from '~/components/UpdateServiceModal'

function extractTag(containerImage: string): string {
  if (!containerImage) return ''
  const parts = containerImage.split(':')
  return parts.length > 1 ? parts[parts.length - 1] : 'latest'
}

export default function SettingsPage(props: { system: { services: ServiceSlim[] } }) {
  const { t } = useTranslation()
  const { openModal, closeAllModals } = useModals()
  const { showError } = useErrorNotification()
  const { isOnline } = useInternetStatus()
  const { subscribe } = useTransmit()
  const installActivity = useServiceInstallationActivity()

  const [isInstalling, setIsInstalling] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  useEffect(() => {
    if (installActivity.length === 0) return
    if (
      installActivity.some(
        (activity) => activity.type === 'completed' || activity.type === 'update-complete'
      )
    ) {
      setTimeout(() => {
        window.location.reload()
      }, 3000)
    }
  }, [installActivity])

  // Listen for service update check completion
  useEffect(() => {
    const unsubscribe = subscribe(BROADCAST_CHANNELS.SERVICE_UPDATES, () => {
      setCheckingUpdates(false)
      window.location.reload()
    })
    return () => { unsubscribe() }
  }, [])

  async function handleCheckUpdates() {
    try {
      if (!isOnline) {
        showError(t('apps.noInternetUpdates'))
        return
      }
      setCheckingUpdates(true)
      const response = await api.checkServiceUpdates()
      if (!response?.success) {
        throw new Error(t('apps.failedDispatchUpdate'))
      }
    } catch (error) {
      console.error('Error checking for updates:', error)
      showError(t('apps.failedCheckUpdates', { error: error.message || 'Unknown error' }))
      setCheckingUpdates(false)
    }
  }

  const handleInstallService = (service: ServiceSlim) => {
    openModal(
      <StyledModal
        title={t('apps.installService')}
        onConfirm={() => {
          installService(service.service_name)
          closeAllModals()
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText={t('apps.install')}
        cancelText={t('apps.cancel')}
        confirmVariant="primary"
        icon={<IconDownload className="h-12 w-12 text-desert-green" />}
      >
        <p className="text-text-primary">
          {t('apps.installConfirm', { name: service.friendly_name || service.service_name })}
        </p>
      </StyledModal>,
      'install-service-modal'
    )
  }

  async function installService(serviceName: string) {
    try {
      if (!isOnline) {
        showError(t('apps.noInternetInstall'))
        return
      }

      setIsInstalling(true)
      const response = await api.installService(serviceName)
      if (!response) {
        throw new Error(t('apps.installInternalError'))
      }
      if (!response.success) {
        throw new Error(response.message)
      }
    } catch (error) {
      console.error('Error installing service:', error)
      showError(t('apps.failedInstall', { error: error.message || 'Unknown error' }))
    } finally {
      setIsInstalling(false)
    }
  }

  async function handleAffectAction(record: ServiceSlim, action: 'start' | 'stop' | 'restart') {
    try {
      setLoading(true)
      const response = await api.affectService(record.service_name, action)
      if (!response) {
        throw new Error(t('apps.affectInternalError'))
      }
      if (!response.success) {
        throw new Error(response.message)
      }

      closeAllModals()

      setTimeout(() => {
        setLoading(false)
        window.location.reload()
      }, 3000)
    } catch (error) {
      console.error(`Error affecting service ${record.service_name}:`, error)
      showError(t('apps.failedAction', { action, error: error.message || 'Unknown error' }))
    }
  }

  async function handleForceReinstall(record: ServiceSlim) {
    try {
      setLoading(true)
      const response = await api.forceReinstallService(record.service_name)
      if (!response) {
        throw new Error(t('apps.forceReinstallInternalError'))
      }
      if (!response.success) {
        throw new Error(response.message)
      }

      closeAllModals()

      setTimeout(() => {
        setLoading(false)
        window.location.reload()
      }, 3000)
    } catch (error) {
      console.error(`Error force reinstalling service ${record.service_name}:`, error)
      showError(t('apps.failedForceReinstall', { error: error.message || 'Unknown error' }))
    }
  }

  function handleUpdateService(record: ServiceSlim) {
    const currentTag = extractTag(record.container_image)
    const latestVersion = record.available_update_version!

    openModal(
      <UpdateServiceModal
        record={record}
        currentTag={currentTag}
        latestVersion={latestVersion}
        onCancel={closeAllModals}
        onUpdate={async (targetVersion: string) => {
          closeAllModals()
          try {
            setLoading(true)
            const response = await api.updateService(record.service_name, targetVersion)
            if (!response?.success) {
              throw new Error(response?.message || 'Update failed')
            }
          } catch (error) {
            console.error(`Error updating service ${record.service_name}:`, error)
            showError(`Failed to update service: ${error.message || 'Unknown error'}`)
            setLoading(false)
          }
        }}
        showError={showError}
      />,
      `${record.service_name}-update-modal`
    )
  }

  const AppActions = ({ record }: { record: ServiceSlim }) => {
    const ForceReinstallButton = () => (
      <StyledButton
        icon="IconDownload"
        variant="action"
        onClick={() => {
          openModal(
            <StyledModal
              title={t('apps.forceReinstallTitle')}
              onConfirm={() => handleForceReinstall(record)}
              onCancel={closeAllModals}
              open={true}
              confirmText={t('apps.forceReinstall')}
              cancelText={t('apps.cancel')}
            >
              <p className="text-text-primary" dangerouslySetInnerHTML={{ __html: t('apps.forceReinstallConfirm', { name: record.service_name }) }} />
            </StyledModal>,
            `${record.service_name}-force-reinstall-modal`
          )
        }}
        disabled={isInstalling}
      >
        {t('apps.forceReinstall')}
      </StyledButton>
    )

    if (!record) return null
    if (!record.installed) {
      return (
        <div className="flex flex-wrap gap-2">
          <StyledButton
            icon={'IconDownload'}
            variant="primary"
            onClick={() => handleInstallService(record)}
            disabled={isInstalling || !isOnline}
            loading={isInstalling}
          >
            {t('apps.install')}
          </StyledButton>
          <ForceReinstallButton />
        </div>
      )
    }

    return (
      <div className="flex flex-wrap gap-2">
        <StyledButton
          icon={'IconExternalLink'}
          onClick={() => {
            window.open(getServiceLink(record.ui_location || 'unknown'), '_blank')
          }}
        >
          {t('apps.open')}
        </StyledButton>
        {record.available_update_version && (
          <StyledButton
            icon="IconArrowUp"
            variant="primary"
            onClick={() => handleUpdateService(record)}
            disabled={isInstalling || !isOnline}
          >
            {t('apps.update')}
          </StyledButton>
        )}
        {record.status && record.status !== 'unknown' && (
          <>
            <StyledButton
              icon={record.status === 'running' ? 'IconPlayerStop' : 'IconPlayerPlay'}
              variant={record.status === 'running' ? 'action' : undefined}
              onClick={() => {
                openModal(
                  <StyledModal
                    title={record.status === 'running' ? t('apps.stopService') : t('apps.startService')}
                    onConfirm={() =>
                      handleAffectAction(record, record.status === 'running' ? 'stop' : 'start')
                    }
                    onCancel={closeAllModals}
                    open={true}
                    confirmText={record.status === 'running' ? t('apps.stop') : t('apps.start')}
                    cancelText={t('apps.cancel')}
                  >
                    <p className="text-text-primary">
                      {record.status === 'running' ? t('apps.stopConfirm', { name: record.service_name }) : t('apps.startConfirm', { name: record.service_name })}
                    </p>
                  </StyledModal>,
                  `${record.service_name}-affect-modal`
                )
              }}
              disabled={isInstalling}
            >
              {record.status === 'running' ? t('apps.stop') : t('apps.start')}
            </StyledButton>
            {record.status === 'running' && (
              <StyledButton
                icon="IconRefresh"
                variant="action"
                onClick={() => {
                  openModal(
                    <StyledModal
                      title={t('apps.restartService')}
                      onConfirm={() => handleAffectAction(record, 'restart')}
                      onCancel={closeAllModals}
                      open={true}
                      confirmText={t('apps.restart')}
                      cancelText={t('apps.cancel')}
                    >
                      <p className="text-text-primary">
                        {t('apps.restartConfirm', { name: record.service_name })}
                      </p>
                    </StyledModal>,
                    `${record.service_name}-affect-modal`
                  )
                }}
                disabled={isInstalling}
              >
                {t('apps.restart')}
              </StyledButton>
            )}
            <ForceReinstallButton />
          </>
        )}
      </div>
    )
  }

  return (
    <SettingsLayout>
      <Head title={t('apps.title')} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-semibold">{t('apps.heading')}</h1>
              <p className="text-text-muted mt-1">
                {t('apps.description')}
              </p>
            </div>
            <StyledButton
              icon="IconRefreshAlert"
              onClick={handleCheckUpdates}
              disabled={checkingUpdates || !isOnline}
              loading={checkingUpdates}
            >
              {t('apps.checkForUpdates')}
            </StyledButton>
          </div>
          {loading && <LoadingSpinner fullscreen />}
          {!loading && (
            <StyledTable<ServiceSlim & { actions?: any }>
              className="font-semibold !overflow-x-auto"
              rowLines={true}
              columns={[
                {
                  accessor: 'friendly_name',
                  title: t('apps.columns.name'),
                  render(record) {
                    return (
                      <div className="flex flex-col">
                        <p>{record.friendly_name || record.service_name}</p>
                        <p className="text-sm text-text-muted">{record.description}</p>
                      </div>
                    )
                  },
                },
                {
                  accessor: 'ui_location',
                  title: t('apps.columns.location'),
                  render: (record) => (
                    <a
                      href={getServiceLink(record.ui_location || 'unknown')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-desert-green hover:underline font-semibold"
                    >
                      {record.ui_location}
                    </a>
                  ),
                },
                {
                  accessor: 'installed',
                  title: t('apps.columns.installed'),
                  render: (record) =>
                    record.installed ? <IconCheck className="h-6 w-6 text-desert-green" /> : '',
                },
                {
                  accessor: 'container_image',
                  title: t('apps.columns.version'),
                  render: (record) => {
                    if (!record.installed) return null
                    const currentTag = extractTag(record.container_image)
                    if (record.available_update_version) {
                      return (
                        <div className="flex items-center gap-1.5">
                          <span className="text-text-muted">{currentTag}</span>
                          <IconArrowUp className="h-4 w-4 text-desert-green" />
                          <span className="text-desert-green font-semibold">
                            {record.available_update_version}
                          </span>
                        </div>
                      )
                    }
                    return <span className="text-text-secondary">{currentTag}</span>
                  },
                },
                {
                  accessor: 'actions',
                  title: 'Actions',
                  className: '!whitespace-normal',
                  render: (record) => <AppActions record={record} />,
                },
              ]}
              data={props.system.services}
            />
          )}
          {installActivity.length > 0 && (
            <InstallActivityFeed activity={installActivity} className="mt-8" withHeader />
          )}
        </main>
      </div>
    </SettingsLayout>
  )
}

