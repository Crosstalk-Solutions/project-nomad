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
import InstallActivityFeed, { InstallActivityFeedProps } from '~/components/InstallActivityFeed'
import { useTransmit } from 'react-adonis-transmit'
import LoadingSpinner from '~/components/LoadingSpinner'
import useErrorNotification from '~/hooks/useErrorNotification'
import useInternetStatus from '~/hooks/useInternetStatus'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'

export default function SettingsPage(props: { system: { services: ServiceSlim[] } }) {
  const { openModal, closeAllModals } = useModals()
  const { subscribe } = useTransmit()
  const { showError } = useErrorNotification()
  const { isOnline } = useInternetStatus()
  const [installActivity, setInstallActivity] = useState<InstallActivityFeedProps['activity']>([])
  const [isInstalling, setIsInstalling] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribe('service-installation', (data: any) => {
      setInstallActivity((prev) => [
        ...prev,
        {
          service_name: data.service_name ?? 'unknown',
          type: data.status ?? 'unknown',
          timestamp: new Date().toISOString(),
          message: data.message ?? 'No message provided',
        },
      ])
    })

    return () => {
      unsubscribe()
    }
  }, [])

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
        confirmVariant='primary'
        icon={<ArrowDownTrayIcon className="h-12 w-12 text-desert-green" />}
      >
        <p className="text-gray-700">
          Are you sure you want to install {service.service_name}? This will start the service and
          make it available in your Project N.O.M.A.D. instance. It may take some time to complete.
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

  const AppActions = ({ record }: { record: ServiceSlim }) => {
    if (!record) return null
    if (!record.installed) {
      return (
        <div className="flex space-x-2">
          <StyledButton
            icon={'ArrowDownTrayIcon'}
            variant="primary"
            onClick={() => handleInstallService(record)}
            disabled={isInstalling || !isOnline}
            loading={isInstalling}
          >
            Install
          </StyledButton>
        </div>
      )
    }

    async function handleAffectAction(action: 'start' | 'stop' | 'restart') {
      try {
        setLoading(true)
        const response = await api.affectService(record.service_name, action)
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

    return (
      <div className="flex space-x-2">
        <StyledButton
          icon={'ArrowTopRightOnSquareIcon'}
          onClick={() => {
            window.open(getServiceLink(record.ui_location || 'unknown'), '_blank')
          }}
        >
          Open
        </StyledButton>
        {record.status && record.status !== 'unknown' && (
          <>
            <StyledButton
              icon={record.status === 'running' ? 'StopIcon' : 'PlayIcon'}
              variant={record.status === 'running' ? 'action' : undefined}
              onClick={() => {
                openModal(
                  <StyledModal
                    title={`${record.status === 'running' ? 'Stop' : 'Start'} Service?`}
                    onConfirm={() =>
                      handleAffectAction(record.status === 'running' ? 'stop' : 'start')
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
                icon="ArrowPathIcon"
                variant="action"
                onClick={() => {
                  openModal(
                    <StyledModal
                      title={'Restart Service?'}
                      onConfirm={() => handleAffectAction('restart')}
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
          </>
        )}
      </div>
    )
  }

  return (
    <SettingsLayout>
      <Head title="App Settings | Project N.O.M.A.D." />
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
                { accessor: 'service_name', title: 'Name' },
                {
                  accessor: 'ui_location',
                  title: 'Location',
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
                  title: 'Installed?',
                  render: (record) => (record.installed ? 'Yes' : 'No'),
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
            <InstallActivityFeed activity={installActivity} className="mt-8" />
          )}
        </main>
      </div>
    </SettingsLayout>
  )
}
