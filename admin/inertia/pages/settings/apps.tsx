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
import { IconCheck, IconDownload } from '@tabler/icons-react'

export default function SettingsPage(props: { system: { services: ServiceSlim[] } }) {
  const { openModal, closeAllModals } = useModals()
  const { showError } = useErrorNotification()
  const { isOnline } = useInternetStatus()
  const installActivity = useServiceInstallationActivity()

  const [isInstalling, setIsInstalling] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (installActivity.length === 0) return
    if (installActivity.some((activity) => activity.type === 'completed')) {
      // If any activity is completed, we can clear the installActivity state
      setTimeout(() => {
        window.location.reload() // Reload the page to reflect changes
      }, 3000) // Clear after 3 seconds
    }
  }, [installActivity])

  const handleInstallService = (service: ServiceSlim) => {
    openModal(
      <StyledModal
        title="Install Service?"
        onConfirm={() => {
          installService(service.service_name)
          closeAllModals()
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText="Install"
        cancelText="Cancel"
        confirmVariant="primary"
        icon={<IconDownload className="h-12 w-12 text-desert-green" />}
      >
        <p className="text-gray-700">
          Are you sure you want to install {service.friendly_name || service.service_name}? This
          will start the service and make it available in your Project N.O.M.A.D. instance. It may
          take some time to complete.
        </p>
      </StyledModal>,
      'install-service-modal'
    )
  }

  async function installService(serviceName: string) {
    try {
      if (!isOnline) {
        showError('You must have an internet connection to install services.')
        return
      }

      setIsInstalling(true)
      const response = await api.installService(serviceName)
      if (!response) {
        throw new Error('An internal error occurred while trying to install the service.')
      }
      if (!response.success) {
        throw new Error(response.message)
      }
    } catch (error) {
      console.error('Error installing service:', error)
      showError(`Failed to install service: ${error.message || 'Unknown error'}`)
    } finally {
      setIsInstalling(false)
    }
  }

  async function handleAffectAction(record: ServiceSlim, action: 'start' | 'stop' | 'restart') {
    try {
      setLoading(true)
      const response = await api.affectService(record.service_name, action)
      if (!response) {
        throw new Error('An internal error occurred while trying to affect the service.')
      }
      if (!response.success) {
        throw new Error(response.message)
      }

      closeAllModals()

      setTimeout(() => {
        setLoading(false)
        window.location.reload() // Reload the page to reflect changes
      }, 3000) // Add small delay to allow for the action to complete
    } catch (error) {
      console.error(`Error affecting service ${record.service_name}:`, error)
      showError(`Failed to ${action} service: ${error.message || 'Unknown error'}`)
    }
  }

  async function handleForceReinstall(record: ServiceSlim) {
    try {
      setLoading(true)
      const response = await api.forceReinstallService(record.service_name)
      if (!response) {
        throw new Error('An internal error occurred while trying to force reinstall the service.')
      }
      if (!response.success) {
        throw new Error(response.message)
      }

      closeAllModals()

      setTimeout(() => {
        setLoading(false)
        window.location.reload() // Reload the page to reflect changes
      }, 3000) // Add small delay to allow for the action to complete
    } catch (error) {
      console.error(`Error force reinstalling service ${record.service_name}:`, error)
      showError(`Failed to force reinstall service: ${error.message || 'Unknown error'}`)
    }
  }

  const AppActions = ({ record }: { record: ServiceSlim }) => {
    const ForceReinstallButton = () => (
      <StyledButton
        icon="IconDownload"
        variant="action"
        onClick={() => {
          openModal(
            <StyledModal
              title={'Force Reinstall?'}
              onConfirm={() => handleForceReinstall(record)}
              onCancel={closeAllModals}
              open={true}
              confirmText={'Force Reinstall'}
              cancelText="Cancel"
            >
              <p className="text-gray-700">
                Are you sure you want to force reinstall {record.service_name}? This will{' '}
                <strong>WIPE ALL DATA</strong> for this service and cannot be undone. You should
                only do this if the service is malfunctioning and other troubleshooting steps have
                failed.
              </p>
            </StyledModal>,
            `${record.service_name}-force-reinstall-modal`
          )
        }}
        disabled={isInstalling}
      >
        Force Reinstall
      </StyledButton>
    )

    if (!record) return null
    if (!record.installed) {
      return (
        <div className="flex space-x-2">
          <StyledButton
            icon={'IconDownload'}
            variant="primary"
            onClick={() => handleInstallService(record)}
            disabled={isInstalling || !isOnline}
            loading={isInstalling}
          >
            Install
          </StyledButton>
          <ForceReinstallButton />
        </div>
      )
    }

    return (
      <div className="flex space-x-2">
        <StyledButton
          icon={'IconExternalLink'}
          onClick={() => {
            window.open(getServiceLink(record.ui_location || 'unknown'), '_blank')
          }}
        >
          Open
        </StyledButton>
        {record.status && record.status !== 'unknown' && (
          <>
            <StyledButton
              icon={record.status === 'running' ? 'IconPlayerStop' : 'IconPlayerPlay'}
              variant={record.status === 'running' ? 'action' : undefined}
              onClick={() => {
                openModal(
                  <StyledModal
                    title={`${record.status === 'running' ? 'Stop' : 'Start'} Service?`}
                    onConfirm={() =>
                      handleAffectAction(record, record.status === 'running' ? 'stop' : 'start')
                    }
                    onCancel={closeAllModals}
                    open={true}
                    confirmText={record.status === 'running' ? 'Stop' : 'Start'}
                    cancelText="Cancel"
                  >
                    <p className="text-gray-700">
                      Are you sure you want to {record.status === 'running' ? 'stop' : 'start'}{' '}
                      {record.service_name}?
                    </p>
                  </StyledModal>,
                  `${record.service_name}-affect-modal`
                )
              }}
              disabled={isInstalling}
            >
              {record.status === 'running' ? 'Stop' : 'Start'}
            </StyledButton>
            {record.status === 'running' && (
              <StyledButton
                icon="IconRefresh"
                variant="action"
                onClick={() => {
                  openModal(
                    <StyledModal
                      title={'Restart Service?'}
                      onConfirm={() => handleAffectAction(record, 'restart')}
                      onCancel={closeAllModals}
                      open={true}
                      confirmText={'Restart'}
                      cancelText="Cancel"
                    >
                      <p className="text-gray-700">
                        Are you sure you want to restart {record.service_name}?
                      </p>
                    </StyledModal>,
                    `${record.service_name}-affect-modal`
                  )
                }}
                disabled={isInstalling}
              >
                Restart
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
      <Head title="App Settings" />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <h1 className="text-4xl font-semibold mb-4">Apps</h1>
          <p className="text-gray-500 mb-4">
            Manage the applications that are available in your Project N.O.M.A.D. instance.
          </p>
          {loading && <LoadingSpinner fullscreen />}
          {!loading && (
            <StyledTable<ServiceSlim & { actions?: any }>
              className="font-semibold"
              rowLines={true}
              columns={[
                {
                  accessor: 'friendly_name',
                  title: 'Name',
                  render(record) {
                    return (
                      <div className="flex flex-col">
                        <p>{record.friendly_name || record.service_name}</p>
                        <p className="text-sm text-gray-500">{record.description}</p>
                      </div>
                    )
                  },
                },
                {
                  accessor: 'ui_location',
                  title: 'Port',
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
                  title: 'Installed',
                  render: (record) =>
                    record.installed ? <IconCheck className="h-6 w-6 text-desert-green" /> : '',
                },
                {
                  accessor: 'actions',
                  title: 'Actions',
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
