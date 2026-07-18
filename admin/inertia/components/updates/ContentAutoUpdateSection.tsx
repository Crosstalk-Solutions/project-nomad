import { useEffect, useState } from 'react'
import StyledButton from '~/components/StyledButton'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import Alert from '~/components/Alert'
import api from '~/lib/api'
import Input from '~/components/inputs/Input'
import Switch from '~/components/inputs/Switch'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNotifications } from '~/context/NotificationContext'
import { useContentAutoUpdateStatus } from '~/hooks/useContentAutoUpdateStatus'
import { formatBytes } from '~/lib/util'

const COOLOFF_OPTIONS = [
  { value: 24, label: '24 hours (1 day)' },
  { value: 48, label: '48 hours (2 days)' },
  { value: 72, label: '72 hours (3 days)' },
  { value: 168, label: '7 days' },
]

const BYTES_PER_GB = 1024 * 1024 * 1024

export default function ContentAutoUpdateSection() {
  const { addNotification } = useNotifications()
  const queryClient = useQueryClient()
  const { data: status, isLoading } = useContentAutoUpdateStatus()

  const [windowStart, setWindowStart] = useState('02:00')
  const [windowEnd, setWindowEnd] = useState('05:00')
  const [cooloff, setCooloff] = useState(72)
  // Data cap is stored in bytes but edited in GB (0 = unlimited).
  const [capGb, setCapGb] = useState('0')

  // Seed editable fields once the persisted status loads.
  useEffect(() => {
    if (status) {
      setWindowStart(status.windowStart)
      setWindowEnd(status.windowEnd)
      setCooloff(status.cooloffHours)
      setCapGb(
        status.maxBytesPerWindow > 0
          ? String(Math.round((status.maxBytesPerWindow / BYTES_PER_GB) * 100) / 100)
          : '0'
      )
    }
  }, [status?.windowStart, status?.windowEnd, status?.cooloffHours, status?.maxBytesPerWindow])

  const enabled = status?.enabled ?? false
  const autoDisabled = !!status?.autoDisabledReason

  const toggleMutation = useMutation({
    mutationFn: (value: boolean) => api.updateSetting('contentAutoUpdate.enabled', value),
    onSuccess: (_data, value) => {
      queryClient.invalidateQueries({ queryKey: ['content-auto-update-status'] })
      addNotification({
        type: 'success',
        message: value
          ? 'Automatic content updates enabled.'
          : 'Automatic content updates disabled.',
      })
    },
    onError: () => {
      addNotification({ type: 'error', message: 'Failed to update content auto-update setting.' })
    },
  })

  const handleSaveSchedule = async () => {
    const parsedGb = Number(capGb)
    if (!Number.isFinite(parsedGb) || parsedGb < 0) {
      addNotification({ type: 'error', message: 'Data cap must be 0 or a positive number of GB.' })
      return
    }
    const capBytes = Math.round(parsedGb * BYTES_PER_GB)
    try {
      await api.updateSetting('contentAutoUpdate.windowStart', windowStart)
      await api.updateSetting('contentAutoUpdate.windowEnd', windowEnd)
      await api.updateSetting('contentAutoUpdate.cooloffHours', String(cooloff))
      await api.updateSetting('contentAutoUpdate.maxBytesPerWindow', String(capBytes))
      queryClient.invalidateQueries({ queryKey: ['content-auto-update-status'] })
      addNotification({ type: 'success', message: 'Content update schedule saved.' })
    } catch {
      addNotification({ type: 'error', message: 'Failed to save content update schedule.' })
    }
  }

  return (
    <>
      <StyledSectionHeader title="Automatic Content Updates" className="mt-8" />
      <div className="bg-surface-primary rounded-lg border shadow-md overflow-hidden mt-6 p-6">
        {autoDisabled && (
          <Alert
            type="warning"
            title="Automatic Content Updates Disabled"
            message={
              status?.autoDisabledReason ||
              'Automatic content updates were disabled after repeated failures.'
            }
            variant="bordered"
            className="mb-4"
          />
        )}

        <Switch
          checked={enabled}
          onChange={(value) => toggleMutation.mutate(value)}
          disabled={toggleMutation.isPending || isLoading}
          label="Enable Automatic Content Updates"
          description="Automatically download newer versions of your installed Information Library content (ZIM files) and maps during your chosen window. Content downloads can be very large, so set a per-window data cap to limit how much is pulled at once. We recommend allowing at least 0.5 GB per update window to ensure most updates can be pulled in a timely manner, but you can set a lower cap if you have very limited bandwidth and don't mind some updates being skipped (they will still appear in the UI and can be updated manually). If an update repeatedly fails to download within the window, it will be automatically disabled and require manual intervention to re-enable."
        />

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input
            name="contentWindowStart"
            label="Window Start"
            type="time"
            value={windowStart}
            onChange={(e) => setWindowStart(e.target.value)}
            disabled={!enabled}
            helpText="Local server time"
          />
          <Input
            name="contentWindowEnd"
            label="Window End"
            type="time"
            value={windowEnd}
            onChange={(e) => setWindowEnd(e.target.value)}
            disabled={!enabled}
            helpText="Local server time"
          />
          <div>
            <label
              htmlFor="contentCooloff"
              className="block text-base/6 font-medium text-text-primary"
            >
              Cool-off Period
            </label>
            <p className="mt-1 text-sm text-text-muted">Delay after a new version appears</p>
            <select
              id="contentCooloff"
              value={cooloff}
              onChange={(e) => setCooloff(Number(e.target.value))}
              disabled={!enabled}
              className="mt-1.5 block w-full rounded-md bg-surface-primary px-3 py-2 text-base text-text-primary border border-border-default focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-primary sm:text-sm/6 disabled:opacity-50"
            >
              {COOLOFF_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            name="contentDataCap"
            label="Data Cap (GB)"
            type="number"
            min="0"
            step="1"
            value={capGb}
            onChange={(e) => setCapGb(e.target.value)}
            disabled={!enabled}
            helpText="Per window. 0 = unlimited"
          />
        </div>

        <div className="mt-4 flex justify-end">
          <StyledButton variant="primary" size="sm" onClick={handleSaveSchedule} disabled={!enabled}>
            Save Schedule
          </StyledButton>
        </div>

        {enabled && status && (
          <div className="mt-6 pt-4 border-t border-desert-stone-light text-sm">
            <p className="text-desert-stone mb-3">
              <span className="font-medium">Update window: </span>
              {status.windowStart}–{status.windowEnd} (
              {status.withinWindow ? 'currently inside' : 'currently outside'}); cool-off{' '}
              {status.cooloffHours}h; data cap{' '}
              {status.maxBytesPerWindow > 0 ? formatBytes(status.maxBytesPerWindow) : 'unlimited'}
              {status.maxBytesPerWindow > 0 && (
                <> ({formatBytes(status.windowBytesUsed)} used this window)</>
              )}
              .
              {status.lastResult && (
                <>
                  {' '}
                  <span className="font-medium">Last run: </span>
                  {status.lastResult}
                  {status.lastAttemptAt
                    ? ` (${new Date(status.lastAttemptAt).toLocaleString()})`
                    : ''}
                </>
              )}
            </p>

            {status.lastError && (
              <p className="text-desert-red mb-3">
                <span className="font-medium">Last error: </span>
                {status.lastError}
              </p>
            )}

            {status.resources.length === 0 ? (
              <p className="text-desert-stone-dark">
                All installed content is up to date. New versions will appear here when detected.
              </p>
            ) : (
              <ul className="space-y-2">
                {status.resources.map((resource) => (
                  <li
                    key={`${resource.resource_type}:${resource.resource_id}`}
                    className="flex items-start justify-between gap-4 rounded-md bg-surface-secondary px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-text-primary">
                        {resource.resource_id}{' '}
                        <span className="text-xs uppercase text-desert-stone">
                          {resource.resource_type}
                        </span>
                      </p>
                      <p className="text-desert-stone">
                        {resource.current_version}
                        {resource.available_update_version
                          ? ` → ${resource.available_update_version}`
                          : ' (up to date)'}
                        {resource.size_bytes ? ` · ${formatBytes(resource.size_bytes)}` : ''}
                      </p>
                      {resource.auto_disabled_reason && (
                        <p className="text-desert-red mt-0.5">{resource.auto_disabled_reason}</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 text-xs font-medium ${resource.exceeds_cap
                          ? 'text-desert-red'
                          : resource.eligible
                            ? 'text-desert-green'
                            : 'text-desert-stone'
                        }`}
                    >
                      {resource.exceeds_cap ? 'Skipped — exceeds data cap, update manually' : resource.reason}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </>
  )
}
