import { Head } from '@inertiajs/react'
import { useState } from 'react'
import SettingsLayout from '~/layouts/SettingsLayout'
import StyledButton from '~/components/StyledButton'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import Alert from '~/components/Alert'
import Input from '~/components/inputs/Input'
import { useNotifications } from '~/context/NotificationContext'
import { useMutation } from '@tanstack/react-query'
import api from '~/lib/api'

export default function AdvancedPage(props: {
  advanced: {
    internetStatusTestUrl: string
    internetStatusTestUrlEnvOverride: boolean
    serviceLogsUrl: string
  }
}) {
  const { addNotification } = useNotifications()
  const { internetStatusTestUrlEnvOverride } = props.advanced

  const [internetStatusTestUrl, setInternetStatusTestUrl] = useState(
    props.advanced.internetStatusTestUrl ?? ''
  )
  const [testUrlError, setTestUrlError] = useState<string | null>(null)

  const [serviceLogsUrl, setServiceLogsUrl] = useState(props.advanced.serviceLogsUrl ?? '')
  const [serviceLogsUrlError, setServiceLogsUrlError] = useState<string | null>(null)

  // Mirror the backend validation (admin/app/validators/settings.ts) for instant
  // feedback. The backend remains the source of truth and returns 422 on failure.
  function validateTestUrl(value: string): string | null {
    if (value.trim() === '') return null // empty clears the setting
    try {
      const url = new URL(value)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return 'Test URL must use http or https.'
      }
    } catch {
      return 'Test URL must be a valid URL (e.g. "https://example.com").'
    }
    return null
  }

  const updateTestUrlMutation = useMutation({
    mutationFn: async (value: string) => {
      return await api.updateSetting('system.internetStatusTestUrl', value)
    },
    onSuccess: () => {
      addNotification({ message: 'Setting updated successfully.', type: 'success' })
    },
    onError: (error: any) => {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        'There was an error updating the setting. Please try again.'
      setTestUrlError(msg)
      addNotification({ message: msg, type: 'error' })
    },
  })

  function handleSaveTestUrl() {
    const trimmed = internetStatusTestUrl.trim()
    const validationError = validateTestUrl(trimmed)
    if (validationError) {
      setTestUrlError(validationError)
      return
    }
    setTestUrlError(null)
    updateTestUrlMutation.mutate(trimmed)
  }

  // Mirrors the backend's `ui.serviceLogsUrl` validation
  // (admin/app/validators/settings.ts). A bare host is accepted — normalizeCustomUrl
  // prepends http:// before it reaches an href.
  function validateServiceLogsUrl(value: string): string | null {
    if (value.trim() === '') return null // empty clears the override
    const trimmed = value.trim()
    const isHttpUrl = /^https?:\/\//i.test(trimmed)
    if (!isHttpUrl && /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
      return 'Service logs URL must use http or https.'
    }
    try {
      const url = new URL(isHttpUrl ? trimmed : `http://${trimmed}`)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return 'Service logs URL must use http or https.'
      }
    } catch {
      return 'Service logs URL must be a valid URL (e.g. "https://logs.example.com").'
    }
    return null
  }

  const updateServiceLogsUrlMutation = useMutation({
    mutationFn: async (value: string) => {
      return await api.updateSetting('ui.serviceLogsUrl', value)
    },
    onSuccess: () => {
      addNotification({ message: 'Setting updated successfully.', type: 'success' })
    },
    onError: (error: any) => {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        'There was an error updating the setting. Please try again.'
      setServiceLogsUrlError(msg)
      addNotification({ message: msg, type: 'error' })
    },
  })

  function handleSaveServiceLogsUrl() {
    const trimmed = serviceLogsUrl.trim()
    const validationError = validateServiceLogsUrl(trimmed)
    if (validationError) {
      setServiceLogsUrlError(validationError)
      return
    }
    setServiceLogsUrlError(null)
    updateServiceLogsUrlMutation.mutate(trimmed)
  }

  return (
    <SettingsLayout>
      <Head title="Advanced Settings | Project NOMAD" />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <h1 className="text-4xl font-semibold mb-4">Advanced</h1>
          <p className="text-text-muted mb-4">
            Advanced configuration for operators. These settings are optional — the defaults work
            for most deployments.
          </p>

          <StyledSectionHeader title="Connectivity" className="mt-8 mb-4" />
          <div className="bg-surface-primary rounded-lg border-2 border-border-subtle p-6">
            <p className="text-sm text-text-secondary mb-4">
              NOMAD periodically checks whether it can reach the internet. By default it probes
              Cloudflare's utility endpoint with a few fallbacks. Set a custom endpoint below if your
              network blocks the defaults. Leave blank to use the built-in defaults.
            </p>

            {internetStatusTestUrlEnvOverride && (
              <Alert
                type="info"
                variant="bordered"
                title="Managed by environment variable"
                message="The INTERNET_STATUS_TEST_URL environment variable is set and takes precedence over this setting. Remove it to manage the test URL here."
                className="!mb-4"
              />
            )}

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  name="internetStatusTestUrl"
                  label="Internet Status Test URL"
                  helpText="A single http(s) URL used to check connectivity. Any HTTP response counts as online."
                  placeholder="https://1.1.1.1/cdn-cgi/trace"
                  value={internetStatusTestUrl}
                  disabled={internetStatusTestUrlEnvOverride}
                  error={Boolean(testUrlError)}
                  onChange={(e) => {
                    setInternetStatusTestUrl(e.target.value)
                    setTestUrlError(null)
                  }}
                />
                {testUrlError && <p className="text-sm text-red-600 mt-1">{testUrlError}</p>}
              </div>
              <StyledButton
                variant="primary"
                onClick={handleSaveTestUrl}
                loading={updateTestUrlMutation.isPending}
                disabled={updateTestUrlMutation.isPending || internetStatusTestUrlEnvOverride}
                className="mb-0.5"
              >
                Save
              </StyledButton>
            </div>
          </div>

          <StyledSectionHeader title="Reverse Proxy" className="mt-8 mb-4" />
          <div className="bg-surface-primary rounded-lg border-2 border-border-subtle p-6">
            <p className="text-sm text-text-secondary mb-4">
              NOMAD's per-app URL overrides cover everything in the Services list, but the
              &ldquo;Service Logs &amp; Metrics&rdquo; entry in the Settings sidebar points at Dozzle,
              which runs as a management-compose container rather than an installed app. Set its
              address here if you serve NOMAD behind a reverse proxy or a local DNS name &mdash;
              otherwise the link always resolves to <code>http://&lt;current-host&gt;:9999</code>. Leave
              blank to use that port default.
            </p>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  name="serviceLogsUrl"
                  label="Service Logs & Metrics URL"
                  helpText="Where the Dozzle container is reachable, e.g. https://logs.example.com or logs.lan"
                  placeholder="https://logs.example.com"
                  value={serviceLogsUrl}
                  error={Boolean(serviceLogsUrlError)}
                  onChange={(e) => {
                    setServiceLogsUrl(e.target.value)
                    setServiceLogsUrlError(null)
                  }}
                />
                {serviceLogsUrlError && (
                  <p className="text-sm text-red-600 mt-1">{serviceLogsUrlError}</p>
                )}
              </div>
              <StyledButton
                variant="primary"
                onClick={handleSaveServiceLogsUrl}
                loading={updateServiceLogsUrlMutation.isPending}
                disabled={updateServiceLogsUrlMutation.isPending}
                className="mb-0.5"
              >
                Save
              </StyledButton>
            </div>
          </div>
        </main>
      </div>
    </SettingsLayout>
  )
}
