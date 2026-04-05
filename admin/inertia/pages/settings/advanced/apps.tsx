import { Head, router } from '@inertiajs/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import StyledTable from '~/components/StyledTable'
import AdvancedSettingsLayout from '~/layouts/AdvancedSettingsLayout'
import { ServiceSlim } from '../../../../types/services'
import { getServiceLink } from '~/lib/navigation'
import StyledButton from '~/components/StyledButton'
import api from '~/lib/api'
import Alert from '~/components/Alert'
import useErrorNotification from '~/hooks/useErrorNotification'
import { useNotifications } from '~/context/NotificationContext'

function inputClassName() {
  return 'block w-full min-w-[12rem] rounded-md bg-surface-primary px-3 py-2 text-sm text-text-primary border border-border-default placeholder:text-text-muted focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-primary'
}

export default function AdvancedAppsPage(props: { system: { services: ServiceSlim[] } }) {
  const { showError } = useErrorNotification()
  const { addNotification } = useNotifications()
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(props.system.services.map((s) => [s.id, s.ui_location ?? '']))
  )
  const [savingId, setSavingId] = useState<number | null>(null)

  const servicesSyncKey = useMemo(
    () => props.system.services.map((s) => `${s.id}:${s.ui_location ?? ''}`).join('|'),
    [props.system.services]
  )

  useEffect(() => {
    setDrafts(Object.fromEntries(props.system.services.map((s) => [s.id, s.ui_location ?? ''])))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when server data identity (servicesSyncKey) changes
  }, [servicesSyncKey])

  const setDraft = useCallback((id: number, value: string) => {
    setDrafts((prev) => ({ ...prev, [id]: value }))
  }, [])

  async function handleSave(record: ServiceSlim) {
    const next = drafts[record.id]?.trim() ?? ''
    if (!next) {
      showError('UI location cannot be empty.')
      return
    }
    try {
      setSavingId(record.id)
      const res = await api.updateServiceUiLocation(record.id, next)
      if (!res?.success) {
        throw new Error(res?.message || 'Failed to update UI location')
      }
      addNotification({ type: 'success', message: res.message || 'UI location updated' })
      router.reload({ only: ['system'] })
    } catch (error) {
      console.error('updateServiceUiLocation', error)
      showError(error instanceof Error ? error.message : 'Failed to update UI location')
    } finally {
      setSavingId(null)
    }
  }

  const isDirty = (record: ServiceSlim) =>
    (drafts[record.id] ?? '').trim() !== (record.ui_location ?? '').trim()

  return (
    <AdvancedSettingsLayout>
      <Head title="Advanced Apps | Settings" />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="mb-6">
            <h1 className="text-4xl font-semibold">Apps (advanced)</h1>
            <p className="text-text-muted mt-1 max-w-3xl">
              Override each service&apos;s <code className="text-sm">ui_location</code> — port
              number (e.g. <code className="text-sm">8090</code>), path (e.g.{' '}
              <code className="text-sm">/chat</code>), or full URL. This controls where &quot;Open&quot;
              and in-app links point.
            </p>
          </div>

          <Alert
            type="warning"
            title="Power-user setting"
            message="Misconfigured locations can break shortcuts to your apps. Only change these if you know what you're doing."
            className="mb-6 max-w-3xl"
          />

          <StyledTable<ServiceSlim & { actions?: unknown }>
            className="font-semibold !overflow-x-auto"
            rowLines={true}
            columns={[
              {
                accessor: 'friendly_name',
                title: 'Name',
                render(record) {
                  return (
                    <div className="flex flex-col">
                      <p>{record.friendly_name || record.service_name}</p>
                      <p className="text-sm text-text-muted font-normal">{record.service_name}</p>
                    </div>
                  )
                },
              },
              {
                accessor: 'ui_location',
                title: 'Current location',
                render: (record) => (
                  <a
                    href={getServiceLink(record.ui_location || 'unknown')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-desert-green hover:underline font-semibold"
                  >
                    {record.ui_location || '—'}
                  </a>
                ),
              },
              {
                accessor: 'draft',
                title: 'New location',
                render: (record) => (
                  <input
                    type="text"
                    className={inputClassName()}
                    value={drafts[record.id] ?? ''}
                    onChange={(e) => setDraft(record.id, e.target.value)}
                    aria-label={`New UI location for ${record.friendly_name || record.service_name}`}
                    autoComplete="off"
                  />
                ),
              },
              {
                accessor: 'actions',
                title: '',
                className: '!whitespace-nowrap w-32',
                render: (record) => (
                  <StyledButton
                    variant="primary"
                    onClick={() => handleSave(record)}
                    disabled={!isDirty(record) || savingId === record.id}
                    loading={savingId === record.id}
                  >
                    Save
                  </StyledButton>
                ),
              },
            ]}
            data={props.system.services}
          />
        </main>
      </div>
    </AdvancedSettingsLayout>
  )
}
