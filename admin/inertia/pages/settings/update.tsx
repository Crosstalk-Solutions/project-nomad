import { Head } from '@inertiajs/react'
import SettingsLayout from '~/layouts/SettingsLayout'
import StyledButton from '~/components/StyledButton'
import StyledTable from '~/components/StyledTable'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import ActiveDownloads from '~/components/ActiveDownloads'
import Alert from '~/components/Alert'
import { useEffect, useRef, useState } from 'react'
import { IconAlertCircle, IconArrowBigUpLines, IconCheck, IconCircleCheck, IconReload } from '@tabler/icons-react'
import { SystemUpdateStatus } from '../../../types/system'
import type { ContentUpdateCheckResult, ResourceUpdateInfo } from '../../../types/collections'
import api from '~/lib/api'
import Input from '~/components/inputs/Input'
import Switch from '~/components/inputs/Switch'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNotifications } from '~/context/NotificationContext'
import { useSystemSetting } from '~/hooks/useSystemSetting'
import { useAutoUpdateStatus } from '~/hooks/useAutoUpdateStatus'
import { formatBytes } from '~/lib/util'

type Props = {
  updateAvailable: boolean
  latestVersion: string
  currentVersion: string
  earlyAccess: boolean
}

const STAGE_LABELS: Record<SystemUpdateStatus['stage'], string> = {
  idle: 'Preparing Update',
  starting: 'Starting Update',
  pulling: 'Pulling Images',
  pulled: 'Images Pulled',
  recreating: 'Recreating Containers',
  complete: 'Update Complete',
  error: 'Update Failed',
}

const ADVANCED_STAGES: ReadonlySet<SystemUpdateStatus['stage']> = new Set([
  'pulling',
  'pulled',
  'recreating',
  'complete',
])

function ContentUpdatesSection() {
  const { addNotification } = useNotifications()
  const queryClient = useQueryClient()
  const [checkResult, setCheckResult] = useState<ContentUpdateCheckResult | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [applyingIds, setApplyingIds] = useState<Set<string>>(new Set())
  const [isApplyingAll, setIsApplyingAll] = useState(false)

  const handleCheck = async () => {
    setIsChecking(true)
    try {
      const result = await api.checkForContentUpdates()
      if (result) {
        setCheckResult(result)
      }
    } catch {
      setCheckResult({
        updates: [],
        checked_at: new Date().toISOString(),
        error: 'Failed to check for content updates',
      })
    } finally {
      setIsChecking(false)
    }
  }

  const handleApply = async (update: ResourceUpdateInfo) => {
    setApplyingIds((prev) => new Set(prev).add(update.resource_id))
    try {
      const result = await api.applyContentUpdate(update)
      if (result?.success) {
        addNotification({ type: 'success', message: `Update started for ${update.resource_id}` })
        // Remove from the updates list
        setCheckResult((prev) =>
          prev
            ? { ...prev, updates: prev.updates.filter((u) => u.resource_id !== update.resource_id) }
            : prev
        )
        // Force Active Downloads to refetch now — small updates finish before the next
        // idle poll fires, so without this the user wouldn't see them.
        queryClient.invalidateQueries({ queryKey: ['download-jobs'] })
      } else {
        addNotification({ type: 'error', message: result?.error || 'Failed to start update' })
      }
    } catch {
      addNotification({ type: 'error', message: `Failed to start update for ${update.resource_id}` })
    } finally {
      setApplyingIds((prev) => {
        const next = new Set(prev)
        next.delete(update.resource_id)
        return next
      })
    }
  }

  const handleApplyAll = async () => {
    if (!checkResult?.updates.length) return
    setIsApplyingAll(true)
    try {
      const result = await api.applyAllContentUpdates(checkResult.updates)
      if (result?.results) {
        const succeeded = result.results.filter((r) => r.success).length
        const failed = result.results.filter((r) => !r.success).length
        if (succeeded > 0) {
          addNotification({ type: 'success', message: `Started ${succeeded} update(s)` })
        }
        if (failed > 0) {
          addNotification({ type: 'error', message: `${failed} update(s) could not be started` })
        }
        // Remove successful updates from the list
        const successIds = new Set(result.results.filter((r) => r.success).map((r) => r.resource_id))
        setCheckResult((prev) =>
          prev
            ? { ...prev, updates: prev.updates.filter((u) => !successIds.has(u.resource_id)) }
            : prev
        )
        if (successIds.size > 0) {
          queryClient.invalidateQueries({ queryKey: ['download-jobs'] })
        }
      }
    } catch {
      addNotification({ type: 'error', message: 'Failed to apply updates' })
    } finally {
      setIsApplyingAll(false)
    }
  }

  return (
    <div className="mt-8">
      <StyledSectionHeader title="Content Updates" />

      <div className="bg-surface-primary rounded-lg border shadow-md overflow-hidden p-6">
        <div className="flex items-center justify-between">
          <p className="text-desert-stone-dark">
            Check if newer versions of your installed ZIM files and maps are available.
          </p>
          <StyledButton
            variant="primary"
            icon="IconRefresh"
            onClick={handleCheck}
            loading={isChecking}
          >
            Check for Content Updates
          </StyledButton>
        </div>

        {checkResult?.error && (
          <Alert
            type="warning"
            title="Update Check Issue"
            message={checkResult.error}
            variant="bordered"
            className="my-4"
          />
        )}

        {checkResult && !checkResult.error && checkResult.updates.length === 0 && (
          <Alert
            type="success"
            title="All Content Up to Date"
            message="All your installed content is running the latest available version."
            variant="bordered"
            className="my-4"
          />
        )}

        {checkResult && checkResult.updates.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-desert-stone-dark">
                {checkResult.updates.length} update(s) available
              </p>
              <StyledButton
                variant="primary"
                size="sm"
                icon="IconDownload"
                onClick={handleApplyAll}
                loading={isApplyingAll}
              >
                Update All ({checkResult.updates.length})
              </StyledButton>
            </div>
            <StyledTable
              data={checkResult.updates}
              columns={[
                {
                  accessor: 'resource_id',
                  title: 'Title',
                  render: (record) => (
                    <span className="font-medium text-desert-green">{record.resource_id}</span>
                  ),
                },
                {
                  accessor: 'resource_type',
                  title: 'Type',
                  render: (record) => (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${record.resource_type === 'zim'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-emerald-100 text-emerald-800'
                        }`}
                    >
                      {record.resource_type === 'zim' ? 'ZIM' : 'Map'}
                    </span>
                  ),
                },
                {
                  accessor: 'size_bytes',
                  title: 'Size',
                  render: (record) => (
                    <span className="text-desert-stone-dark">
                      {record.size_bytes ? formatBytes(record.size_bytes, 1) : '—'}
                    </span>
                  ),
                },
                {
                  accessor: 'installed_version',
                  title: 'Version',
                  render: (record) => (
                    <span className="text-desert-stone-dark">
                      {record.installed_version} → {record.latest_version}
                    </span>
                  ),
                },
                {
                  accessor: 'resource_id',
                  title: '',
                  render: (record) => (
                    <StyledButton
                      variant="secondary"
                      size="sm"
                      icon="IconDownload"
                      onClick={() => handleApply(record)}
                      loading={applyingIds.has(record.resource_id)}
                    >
                      Update
                    </StyledButton>
                  ),
                },
              ]}
            />
          </div>
        )}

        {checkResult?.checked_at && (
          <p className="text-xs text-desert-stone mt-3">
            Last checked: {new Date(checkResult.checked_at).toLocaleString()}
          </p>
        )}
      </div>

      <ActiveDownloads withHeader />
    </div>
  )
}

const COOLOFF_OPTIONS = [
  { value: 24, label: '24 hours (1 day)' },
  { value: 48, label: '48 hours (2 days)' },
  { value: 72, label: '72 hours (3 days)' },
  { value: 168, label: '7 days' },
]

function AutoUpdateSection() {
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
      addNotification({ type: 'error', message: 'Failed to update auto-update setting.' })
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
            message: value ? 'Automatic updates enabled.' : 'Automatic updates disabled.',
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
      addNotification({ type: 'success', message: 'Auto-update schedule saved.' })
    } catch {
      addNotification({ type: 'error', message: 'Failed to save auto-update schedule.' })
    }
  }

  return (
    <>
      <StyledSectionHeader title="Automatic Updates" className="mt-8" />
      <div className="bg-surface-primary rounded-lg border shadow-md overflow-hidden mt-6 p-6">
        {autoDisabled && (
          <Alert
            type="warning"
            title="Automatic Updates Disabled"
            message={status?.autoDisabledReason || 'Auto-update was disabled after repeated failures.'}
            variant="bordered"
            className="mb-4"
          />
        )}

        <Switch
          checked={enabled}
          onChange={handleToggle}
          disabled={saveMutation.isPending || isLoading}
          label="Enable Automatic Updates"
          description="Automatically install minor and patch updates during your chosen window. Major versions always require a manual update due to their potentially breaking nature."
        />

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            name="autoUpdateWindowStart"
            label="Window Start"
            type="time"
            value={windowStart}
            onChange={(e) => setWindowStart(e.target.value)}
            disabled={!enabled}
            helpText="Local server time"
          />
          <Input
            name="autoUpdateWindowEnd"
            label="Window End"
            type="time"
            value={windowEnd}
            onChange={(e) => setWindowEnd(e.target.value)}
            disabled={!enabled}
            helpText="Local server time"
          />
          <div>
            <label
              htmlFor="autoUpdateCooloff"
              className="block text-base/6 font-medium text-text-primary"
            >
              Cool-off Period
            </label>
            <p className="mt-1 text-sm text-text-muted">Delay after a release is published</p>
            <select
              id="autoUpdateCooloff"
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
        </div>

        <div className="mt-4 flex justify-end">
          <StyledButton
            variant="primary"
            size="sm"
            onClick={handleSaveWindow}
            disabled={!enabled}
          >
            Save Schedule
          </StyledButton>
        </div>

        {enabled && status && (
          <div className="mt-6 pt-4 border-t border-desert-stone-light text-sm space-y-1">
            <p className="text-desert-stone-dark">
              <span className="font-medium">Status: </span>
              {status.eligibleTarget
                ? `Eligible update ready: ${status.eligibleTarget.version}`
                : 'No eligible update — system is current or the latest release is a major version / still in cool-off.'}
            </p>
            <p className="text-desert-stone">
              <span className="font-medium">Update window: </span>
              {status.withinWindow ? 'Currently inside the window' : 'Currently outside the window'}
            </p>
            {status.lastResult && (
              <p className="text-desert-stone">
                <span className="font-medium">Last check: </span>
                {status.lastResult}
                {status.lastAttemptAt
                  ? ` (${new Date(status.lastAttemptAt).toLocaleString()})`
                  : ''}
              </p>
            )}
            {status.lastError && (
              <p className="text-desert-red">
                <span className="font-medium">Last error: </span>
                {status.lastError}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}

export default function SystemUpdatePage(props: { system: Props }) {
  const { addNotification } = useNotifications()

  const [isUpdating, setIsUpdating] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<SystemUpdateStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState<string>('')
  const [email, setEmail] = useState('')
  const [versionInfo, setVersionInfo] = useState<Omit<Props, 'earlyAccess'>>(props.system)
  const [showConnectionLostNotice, setShowConnectionLostNotice] = useState(false)
  // Tracks whether this update session has progressed past 'idle'/'starting'.
  // The sidecar sits on 'complete' for ~5s before resetting to 'idle' (see
  // install/sidecar-updater/update-watcher.sh), and the SPA can miss that
  // window across the admin container restart. If we resurface to 'idle'
  // after seeing an advanced stage, treat it as the missed completion.
  const seenAdvancedStageRef = useRef(false)

  const earlyAccessSetting = useSystemSetting({
    key: 'system.earlyAccess', initialData: {
      key: 'system.earlyAccess',
      value: props.system.earlyAccess,
    }
  })

  useEffect(() => {
    if (!isUpdating) return

    const interval = setInterval(async () => {
      try {
        const response = await api.getSystemUpdateStatus()
        if (!response) {
          throw new Error('Failed to fetch update status')
        }
        setUpdateStatus(response)

        if (ADVANCED_STAGES.has(response.stage)) {
          seenAdvancedStageRef.current = true
        }

        // If we can connect again, hide the connection lost notice
        setShowConnectionLostNotice(false)

        // Check if update is complete or errored. We also treat a return to
        // 'idle' as completion if we previously saw an advanced stage — this
        // catches the race where the sidecar's brief 'complete' window passes
        // while we're disconnected during the admin container restart.
        const isComplete =
          response.stage === 'complete' ||
          (response.stage === 'idle' && seenAdvancedStageRef.current)

        if (isComplete) {
          // Re-check version so the KV store clears the stale "update available" flag
          // before we reload, otherwise the banner shows "current → current"
          try {
            await api.checkLatestVersion(true)
          } catch {
            // Non-critical - page reload will still work
          }
          setTimeout(() => {
            window.location.reload()
          }, 2000)
        } else if (response.stage === 'error') {
          setIsUpdating(false)
          setError(response.message)
        }
      } catch (err) {
        // During container restart, we'll lose connection - this is expected
        // Show a notice to inform the user that this is normal
        setShowConnectionLostNotice(true)
        // Continue polling to detect when the container comes back up
        console.log('Polling update status (container may be restarting)...')
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [isUpdating])

  const handleStartUpdate = async () => {
    try {
      setError(null)
      seenAdvancedStageRef.current = false
      setIsUpdating(true)
      const response = await api.startSystemUpdate()
      if (!response || !response.success) {
        throw new Error('Failed to start update')
      }
    } catch (err: any) {
      setIsUpdating(false)
      setError(err.response?.data?.error || err.message || 'Failed to start update')
    }
  }

  const handleViewLogs = async () => {
    try {
      const response = await api.getSystemUpdateLogs()
      if (!response) {
        throw new Error('Failed to fetch update logs')
      }
      setLogs(response.logs)
      setShowLogs(true)
    } catch (err) {
      setError('Failed to fetch update logs')
    }
  }

  const checkVersionMutation = useMutation({
    mutationKey: ['checkLatestVersion'],
    mutationFn: () => api.checkLatestVersion(true),
    onSuccess: (data) => {
      if (data) {
        setVersionInfo({
          updateAvailable: data.updateAvailable,
          latestVersion: data.latestVersion,
          currentVersion: data.currentVersion,
        })
        if (data.updateAvailable) {
          addNotification({
            type: 'success',
            message: `Update available: ${data.latestVersion}`,
          })
        } else {
          addNotification({ type: 'success', message: 'System is up to date' })
        }
        setError(null)
      }
    },
    onError: (error: any) => {
      const errorMessage = error?.message || 'Failed to check for updates'
      setError(errorMessage)
      addNotification({ type: 'error', message: errorMessage })
    },
  })

  const getProgressBarColor = () => {
    if (updateStatus?.stage === 'error') return 'bg-desert-red'
    if (updateStatus?.stage === 'complete') return 'bg-desert-olive'
    return 'bg-desert-green'
  }

  const getStatusIcon = () => {
    if (updateStatus?.stage === 'complete')
      return <IconCheck className="h-12 w-12 text-desert-olive" />
    if (updateStatus?.stage === 'error')
      return <IconAlertCircle className="h-12 w-12 text-desert-red" />
    if (isUpdating) return <IconReload className="h-12 w-12 text-desert-green animate-spin" />
    if (versionInfo.updateAvailable)
      return <IconArrowBigUpLines className="h-16 w-16 text-desert-green" />
    return <IconCircleCheck className="h-16 w-16 text-desert-olive" />
  }

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean }) => {
      return await api.updateSetting(key, value)
    },
    onSuccess: () => {
      addNotification({ message: 'Setting updated successfully.', type: 'success' })
      earlyAccessSetting.refetch()
      // Toggling Early Access changes which versions are eligible, so re-evaluate
      // immediately rather than making the user click Check Again.
      checkVersionMutation.mutate()
    },
    onError: (error) => {
      console.error('Error updating setting:', error)
      addNotification({ message: 'There was an error updating the setting. Please try again.', type: 'error' })
    },
  })

  const subscribeToReleaseNotesMutation = useMutation({
    mutationKey: ['subscribeToReleaseNotes'],
    mutationFn: (email: string) => api.subscribeToReleaseNotes(email),
    onSuccess: (data) => {
      if (data && data.success) {
        addNotification({ type: 'success', message: 'Successfully subscribed to release notes!' })
        setEmail('')
      } else {
        addNotification({
          type: 'error',
          message: `Failed to subscribe: ${data?.message || 'Unknown error'}`,
        })
      }
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        message: `Error subscribing to release notes: ${error.message || 'Unknown error'}`,
      })
    },
  })

  return (
    <SettingsLayout>
      <Head title="System Update" />
      <div className="xl:pl-72 w-full">
        <main className="px-6 lg:px-12 py-6 lg:py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-desert-green mb-2">System Update</h1>
            <p className="text-desert-stone-dark">
              Keep your Project N.O.M.A.D. instance up to date with the latest features and
              improvements.
            </p>
          </div>

          {error && (
            <div className="mb-6">
              <Alert
                type="error"
                title="Update Failed"
                message={error}
                variant="bordered"
                dismissible
                onDismiss={() => setError(null)}
              />
            </div>
          )}
          {isUpdating && updateStatus?.stage === 'recreating' && (
            <div className="mb-6">
              <Alert
                type="info"
                title="Container Restarting"
                message="The admin container is restarting. This page will reload automatically when the update is complete."
                variant="solid"
              />
            </div>
          )}
          {isUpdating && showConnectionLostNotice && (
            <div className="mb-6">
              <Alert
                type="info"
                title="Connection Temporarily Lost (Expected)"
                message="You may see error notifications while the backend restarts during the update. This is completely normal and expected. Connection should be restored momentarily."
                variant="solid"
              />
            </div>
          )}
          <div className="bg-surface-primary rounded-lg border shadow-md overflow-hidden">
            <div className="p-8 text-center">
              <div className="flex justify-center mb-4">{getStatusIcon()}</div>

              {!isUpdating && (
                <>
                  <h2 className="text-2xl font-bold text-desert-green mb-2">
                    {versionInfo.updateAvailable ? 'Update Available' : 'System Up to Date'}
                  </h2>
                  <p className="text-desert-stone-dark mb-6">
                    {versionInfo.updateAvailable
                      ? `A new version (${versionInfo.latestVersion}) is available for your Project N.O.M.A.D. instance.`
                      : 'Your system is running the latest version!'}
                  </p>
                </>
              )}

              {isUpdating && updateStatus && (
                <>
                  <h2 className="text-2xl font-bold text-desert-green mb-2">
                    {STAGE_LABELS[updateStatus.stage] ?? updateStatus.stage}
                  </h2>
                  <p className="text-desert-stone-dark mb-6">{updateStatus.message}</p>
                </>
              )}

              <div className="flex justify-center gap-8 mb-6">
                <div className="text-center">
                  <p className="text-sm text-desert-stone mb-1">Current Version</p>
                  <p className="text-xl font-bold text-desert-green">
                    {versionInfo.currentVersion}
                  </p>
                </div>
                {versionInfo.updateAvailable && (
                  <>
                    <div className="flex items-center">
                      <svg
                        className="h-6 w-6 text-desert-stone"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 7l5 5m0 0l-5 5m5-5H6"
                        />
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-desert-stone mb-1">Latest Version</p>
                      <p className="text-xl font-bold text-desert-olive">
                        {versionInfo.latestVersion}
                      </p>
                    </div>
                  </>
                )}
              </div>
              {isUpdating && updateStatus && (
                <div className="mb-4">
                  <div className="w-full bg-desert-stone-light rounded-full h-3 overflow-hidden">
                    <div
                      className={`${getProgressBarColor()} h-full transition-all duration-500 ease-out`}
                      style={{ width: `${updateStatus.progress}%` }}
                    />
                  </div>
                  <p className="text-sm text-desert-stone mt-2">
                    {updateStatus.progress}% complete
                  </p>
                </div>
              )}
              {!isUpdating && (
                <div className="flex justify-center gap-4">
                  <StyledButton
                    variant="primary"
                    size="lg"
                    icon="IconDownload"
                    onClick={handleStartUpdate}
                    disabled={!versionInfo.updateAvailable}
                  >
                    {versionInfo.updateAvailable ? 'Start Update' : 'No Update Available'}
                  </StyledButton>
                  <StyledButton
                    variant="ghost"
                    size="lg"
                    icon="IconRefresh"
                    onClick={() => checkVersionMutation.mutate()}
                    loading={checkVersionMutation.isPending}
                  >
                    Check Again
                  </StyledButton>
                </div>
              )}
            </div>
            <div className="border-t bg-surface-primary p-6">
              <h3 className="text-lg font-semibold text-desert-green mb-4">
                What happens during an update?
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">Pull Latest Images</p>
                    <p className="text-sm text-desert-stone">
                      Downloads the newest Docker images for all core containers
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">Recreate Containers</p>
                    <p className="text-sm text-desert-stone">
                      Safely stops and recreates all core containers with the new images
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">Automatic Reload</p>
                    <p className="text-sm text-desert-stone">
                      This page will automatically reload when the update is complete
                    </p>
                  </div>
                </div>
              </div>

              {isUpdating && (
                <div className="mt-6 pt-6 border-t border-desert-stone-light">
                  <StyledButton
                    variant="ghost"
                    size="sm"
                    icon="IconLogs"
                    onClick={handleViewLogs}
                    fullWidth
                  >
                    View Update Logs
                  </StyledButton>
                </div>
              )}
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Alert
              type="info"
              title="Backup Reminder"
              message="While updates are designed to be safe, it's always recommended to backup any critical data before proceeding."
              variant="solid"
            />
            <Alert
              type="warning"
              title="Temporary Downtime"
              message="Services will be briefly unavailable during the update process. This typically takes 2-5 minutes depending on your internet connection."
              variant="solid"
            />
          </div>
          <StyledSectionHeader title="Early Access" className="mt-8" />
          <div className="bg-surface-primary rounded-lg border shadow-md overflow-hidden mt-6 p-6">
            <Switch
              checked={earlyAccessSetting.data?.value || false}
              onChange={(newVal) => {
                updateSettingMutation.mutate({ key: 'system.earlyAccess', value: newVal })
              }}
              disabled={updateSettingMutation.isPending}
              label="Enable Early Access"
              description="Receive release candidate (RC) versions before they are officially released. Note: RC versions may contain bugs and are not recommended for environments where stability and data integrity are critical."
            />
          </div>
          <AutoUpdateSection />
          <ContentUpdatesSection />
          <div className="bg-surface-primary rounded-lg border shadow-md overflow-hidden py-6 mt-12">
            <div className="flex flex-col md:flex-row justify-between items-center p-8 gap-y-8 md:gap-y-0 gap-x-8">
              <div>
                <h2 className="max-w-xl text-lg font-bold text-desert-green sm:text-xl lg:col-span-7">
                  Want to stay updated with the latest from Project N.O.M.A.D.? Subscribe to receive
                  release notes directly to your inbox. Unsubscribe anytime.
                </h2>
              </div>
              <div className="flex flex-col">
                <div className="flex gap-x-3">
                  <Input
                    name="email"
                    label=""
                    type="email"
                    placeholder="Your email address"
                    disabled={false}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full"
                    containerClassName="!mt-0"
                  />
                  <StyledButton
                    variant="primary"
                    disabled={!email}
                    onClick={() => subscribeToReleaseNotesMutation.mutateAsync(email)}
                    loading={subscribeToReleaseNotesMutation.isPending}
                  >
                    Subscribe
                  </StyledButton>
                </div>
                <p className="mt-2 text-sm text-desert-stone-dark">
                  We care about your privacy. Project N.O.M.A.D. will never share your email with
                  third parties or send you spam.
                </p>
              </div>
            </div>
          </div>

          {showLogs && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-surface-primary rounded-lg shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
                <div className="p-6 border-b border-desert-stone-light flex justify-between items-center">
                  <h3 className="text-xl font-bold text-desert-green">Update Logs</h3>
                  <button
                    onClick={() => setShowLogs(false)}
                    className="text-desert-stone hover:text-desert-green transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <div className="p-6 overflow-auto flex-1">
                  <pre className="bg-black text-green-400 p-4 rounded text-xs font-mono whitespace-pre-wrap">
                    {logs || 'No logs available yet...'}
                  </pre>
                </div>
                <div className="p-6 border-t border-desert-stone-light">
                  <StyledButton variant="secondary" onClick={() => setShowLogs(false)} fullWidth>
                    Close
                  </StyledButton>
                </div>
              </div>
            </div>
          )}
        </main>
      </div >
    </SettingsLayout >
  )
}
