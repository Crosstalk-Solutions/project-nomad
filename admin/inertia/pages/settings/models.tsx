import { Head } from '@inertiajs/react'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import { ServiceSlim } from '../../../types/services'
import { getServiceLink } from '~/lib/navigation'
import LoadingSpinner from '~/components/LoadingSpinner'
import { IconCheck } from '@tabler/icons-react'
import { useState } from 'react'

export default function ModelsPage(props: { models: { installedModels: string[] } }) {
  const [loading, setLoading] = useState(false)
  
  return (
    <SettingsLayout>
      <Head title="App Settings" />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <h1 className="text-4xl font-semibold mb-4">Models</h1>
          <p className="text-gray-500 mb-4">Easily manage the AI models available for Open WebUI</p>
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
              ]}
              data={[]}
            />
          )}
        </main>
      </div>
    </SettingsLayout>
  )
}
