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

export default function SettingsPage(props: { system: { services: ServiceSlim[] } }) {
  const { openModal, closeAllModals } = useModals()
  const { subscribe } = useTransmit()
  const [installActivity, setInstallActivity] = useState<InstallActivityFeedProps['activity']>([])
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribe('service-installation', (data: any) => {
      console.log('Received service installation message:', data)
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
      setIsInstalling(true)
      const response = await api.installService(serviceName)
      if (!response.success) {
        throw new Error(response.message)
      }
    } catch (error) {
      console.error('Error installing service:', error)
    } finally {
      setIsInstalling(false)
    }
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
                    href={getServiceLink(record.ui_location)}
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
                render: (record) => (
                  <div className="flex space-x-2">
                    {record.installed ? (
                      <StyledButton
                        icon={'ArrowTopRightOnSquareIcon'}
                        onClick={() => {
                          window.open(getServiceLink(record.ui_location), '_blank')
                        }}
                      >
                        Open
                      </StyledButton>
                    ) : (
                      <StyledButton
                        icon={'ArrowDownTrayIcon'}
                        variant="action"
                        onClick={() => handleInstallService(record)}
                        disabled={isInstalling}
                        loading={isInstalling}
                      >
                        Install
                      </StyledButton>
                    )}
                  </div>
                ),
              },
            ]}
            data={props.system.services}
          />
          {installActivity.length > 0 && (
            <InstallActivityFeed activity={installActivity} className="mt-8" />
          )}
        </main>
      </div>
    </SettingsLayout>
  )
}
