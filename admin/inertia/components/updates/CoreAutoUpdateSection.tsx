import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import StyledButton from '~/components/StyledButton'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import Alert from '~/components/Alert'
import api from '~/lib/api'
import Input from '~/components/inputs/Input'
import Switch from '~/components/inputs/Switch'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNotifications } from '~/context/NotificationContext'
import { useAutoUpdateStatus } from '~/hooks/useAutoUpdateStatus'

const COOLOFF_OPTIONS = [
  { value: 24, labelKey: 'update.core_auto_update.cooloff_24h' },
  { value: 48, labelKey: 'update.core_auto_update.cooloff_48h' },
  { value: 72, labelKey: 'update.core_auto_update.cooloff_72h' },
  { value: 168, labelKey: 'update.core_auto_update.cooloff_7d' },
]

export default function CoreAutoUpdateSection() {
  const { t } = useTranslation()
  const { addNotification } = useNotifications()
  const queryClient = useQueryClient()
  const { data: status, isLoading } = useAutoUpdateStatus()

  const [windowStart, setWindowStart] = useState('02:00')
  const [windowEnd, setWindowEnd] = useState('05:00')
  const [cooloff, setCooloff] = useState(72)

  // Seed editable fields once the persisted status loads.
  useEffect(() => {
    if (status) {
      setWindowStart(status.windowStart)
      setWindowEnd(status.windowEnd)
      setCooloff(status.cooloffHours)
    }
  }, [status?.windowStart, status?.windowEnd, status?.cooloffHours])

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) => api.updateSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-update-status'] })
    },
    onError: () => {
      addNotification({ type: 'error', message: t('update.core_auto_update.error_update_setting') })
    },
  })

  const enabled = status?.enabled ?? false
  const autoDisabled = !!status?.autoDisabledReason

  const handleToggle = (value: boolean) => {
    saveMutation.mutate(
      { key: 'autoUpdate.enabled', value },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['auto-update-status'] })
          addNotification({
            type: 'success',
            message: value
              ? t('update.core_auto_update.enabled_success')
              : t('update.core_auto_update.disabled_success'),
          })
        },
      }
    )
  }

  const handleSaveWindow = async () => {
    try {
      await api.updateSetting('autoUpdate.windowStart', windowStart)
      await api.updateSetting('autoUpdate.windowEnd', windowEnd)
      await api.updateSetting('autoUpdate.cooloffHours', String(cooloff))
      queryClient.invalidateQueries({ queryKey: ['auto-update-status'] })
      addNotification({ type: 'success', message: t('update.core_auto_update.schedule_saved') })
    } catch {
      addNotification({ type: 'error', message: t('update.core_auto_update.error_save_schedule') })
    }
  }

  return (
    <>
      <StyledSectionHeader title={t('update.core_auto_update.section_title')} className="mt-8" />
      <div className="bg-surface-primary rounded-lg border shadow-md overflow-hidden mt-6 p-6">
        {autoDisabled && (
          <Alert
            type="warning"
            title={t('update.core_auto_update.alert_disabled_title')}
            message={status?.autoDisabledReason || t('update.core_auto_update.alert_disabled_message')}
            variant="bordered"
            className="mb-4"
          />
        )}

        <Switch
          checked={enabled}
          onChange={handleToggle}
          disabled={saveMutation.isPending || isLoading}
          label={t('update.core_auto_update.switch_label')}
          description={t('update.core_auto_update.switch_description')}
        />

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            name="autoUpdateWindowStart"
            label={t('update.core_auto_update.window_start_label')}
            type="time"
            value={windowStart}
            onChange={(e) => setWindowStart(e.target.value)}
            disabled={!enabled}
            helpText={t('update.core_auto_update.local_server_time')}
          />
          <Input
            name="autoUpdateWindowEnd"
            label={t('update.core_auto_update.window_end_label')}
            type="time"
            value={windowEnd}
            onChange={(e) => setWindowEnd(e.target.value)}
            disabled={!enabled}
            helpText={t('update.core_auto_update.local_server_time')}
          />
          <div>
            <label
              htmlFor="autoUpdateCooloff"
              className="block text-base/6 font-medium text-text-primary"
            >
              {t('update.core_auto_update.cooloff_label')}
            </label>
            <p className="mt-1 text-sm text-text-muted">{t('update.core_auto_update.cooloff_help')}</p>
            <select
              id="autoUpdateCooloff"
              value={cooloff}
              onChange={(e) => setCooloff(Number(e.target.value))}
              disabled={!enabled}
              className="mt-1.5 block w-full rounded-md bg-surface-primary px-3 py-2 text-base text-text-primary border border-border-default focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-primary sm:text-sm/6 disabled:opacity-50"
            >
              {COOLOFF_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <StyledButton
            variant="primary"
            size="sm"
            onClick={handleSaveWindow}
            disabled={!enabled}
          >
            {t('update.core_auto_update.save_schedule')}
          </StyledButton>
        </div>

        {enabled && status && (
          <div className="mt-6 pt-4 border-t border-desert-stone-light text-sm space-y-1">
            <p className="text-desert-stone-dark">
              <span className="font-medium">{t('update.core_auto_update.status_label')} </span>
              {status.eligibleTarget
                ? t('update.core_auto_update.status_eligible', { version: status.eligibleTarget.version })
                : t('update.core_auto_update.status_no_eligible')}
            </p>
            <p className="text-desert-stone">
              <span className="font-medium">{t('update.core_auto_update.window_label')} </span>
              {status.withinWindow
                ? t('update.core_auto_update.window_inside')
                : t('update.core_auto_update.window_outside')}
            </p>
            {status.lastResult && (
              <p className="text-desert-stone">
                <span className="font-medium">{t('update.core_auto_update.last_check_label')} </span>
                {status.lastResult}
                {status.lastAttemptAt
                  ? ` (${new Date(status.lastAttemptAt).toLocaleString()})`
                  : ''}
              </p>
            )}
            {status.lastError && (
              <p className="text-desert-red">
                <span className="font-medium">{t('update.core_auto_update.last_error_label')} </span>
                {status.lastError}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
