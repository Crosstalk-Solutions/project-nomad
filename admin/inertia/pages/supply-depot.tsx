import { Head, router } from '@inertiajs/react'
import { useEffect, useRef, useState } from 'react'
import {
  IconAlertTriangle,
  IconArrowUp,
  IconBook,
  IconBox,
  IconBrandDocker,
  IconChartBar,
  IconClockBolt,
  IconCloudDownload,
  IconFileText,
  IconPackage,
  IconPencil,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconWorld,
} from '@tabler/icons-react'
import AppLayout from '~/layouts/AppLayout'
import DynamicIcon, { DynamicIconName } from '~/components/DynamicIcon'
import StyledButton from '~/components/StyledButton'
import StyledModal from '~/components/StyledModal'
import InstallActivityFeed from '~/components/InstallActivityFeed'
import LoadingSpinner from '~/components/LoadingSpinner'
import Alert from '~/components/Alert'
import CustomAppModal, { CustomAppInitial } from '~/components/CustomAppModal'
import AppUrlModal from '~/components/AppUrlModal'
import ServiceLogsModal from '~/components/ServiceLogsModal'
import ServiceStatsModal from '~/components/ServiceStatsModal'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import UpdateServiceModal from '~/components/UpdateServiceModal'
import useErrorNotification from '~/hooks/useErrorNotification'
import { useNotifications } from '~/context/NotificationContext'
import useInternetStatus from '~/hooks/useInternetStatus'
import { useAppAutoUpdateStatus } from '~/hooks/useAppAutoUpdateStatus'
import useServiceInstallationActivity from '~/hooks/useServiceInstallationActivity'
import { useTransmit } from 'react-adonis-transmit'
import { BROADCAST_CHANNELS } from '../../constants/broadcast'
import { ServiceSlim } from '../../types/services'
import { getServiceLink } from '~/lib/navigation'
import { getSupplyDepotDocLink } from '../../constants/supply_depot_docs'
import api from '~/lib/api'
import { toTitleCase } from '../../app/utils/misc'

function extractTag(containerImage: string): string {
  if (!containerImage) return ''
  const parts = containerImage.split(':')
  return parts.length > 1 ? parts[parts.length - 1] : 'latest'
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'installed', label: 'Installed' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'media', label: 'Media' },
  { id: 'security', label: 'Security' },
  { id: 'networking', label: 'Networking' },
  { id: 'utility', label: 'Utility' },
  { id: 'ai', label: 'AI' },
  { id: 'education', label: 'Education' },
  { id: 'custom', label: 'Custom' },
]

const CATEGORY_COLORS: Record<string, string> = {
  productivity: 'border border-desert-green-light bg-desert-green-lighter text-desert-green-dark',
  media: 'border border-desert-tan-light bg-desert-tan-lighter text-desert-tan-dark',
  security: 'border border-desert-red-light bg-desert-red-lighter text-desert-red-dark',
  networking: 'border border-desert-stone-light bg-desert-stone-lighter text-desert-stone-dark',
  utility: 'border border-desert-olive-light bg-desert-olive-lighter text-desert-olive-dark',
  ai: 'border border-desert-green bg-desert-green-light text-desert-green-darker',
  education: 'border border-desert-orange-light bg-desert-orange-lighter text-desert-orange-dark',
  custom: 'border border-border-subtle bg-surface-secondary text-text-secondary',
}

type Modal =
  | { type: 'install'; service: ServiceSlim }
  | { type: 'start'; service: ServiceSlim }
  | { type: 'stop'; service: ServiceSlim }
  | { type: 'restart'; service: ServiceSlim }
  | { type: 'reinstall'; service: ServiceSlim }
  | { type: 'delete'; service: ServiceSlim }
  | { type: 'logs'; service: ServiceSlim }
  | { type: 'stats'; service: ServiceSlim }
  | { type: 'update'; service: ServiceSlim }
  | null

export default function SupplyDepotPage(props: { system: { services: ServiceSlim[] } }) {
  const { showError } = useErrorNotification()
  const { addNotification } = useNotifications()
  const { isOnline } = useInternetStatus()
  const { subscribe } = useTransmit()
  const installActivity = useServiceInstallationActivity()
  // Global master switch for app auto-updates (Settings → Updates). Per-app
  // toggles are inert until this is on, so the UI reflects that state.
  const { data: appAutoUpdateStatus } = useAppAutoUpdateStatus()
  const appAutoUpdateMasterEnabled = appAutoUpdateStatus?.enabled ?? false

  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<Modal>(null)
  const [loading, setLoading] = useState(false)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [customAppOpen, setCustomAppOpen] = useState(false)
  const [editApp, setEditApp] = useState<CustomAppInitial | null>(null)
  // App whose custom launch URL is being configured (null while the modal is closed).
  const [urlApp, setUrlApp] = useState<ServiceSlim | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  // Optimistic per-app auto-update toggle state, keyed by service_name. Lets the
  // toggle reflect instantly without a full page reload (props come from Inertia).
  const [autoUpdateOverrides, setAutoUpdateOverrides] = useState<Record<string, boolean>>({})

  // Preflight state — scoped to the current install modal
  const [preflight, setPreflight] = useState<{
    portConflicts: Array<{ port: number; usedBy: string }>
    resourceWarnings: string[]
  } | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [forceInstall, setForceInstall] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)

  // Auto-reload when installation completes
  useEffect(() => {
    if (!installActivity.length) return
    if (installActivity.some((a) => a.type === 'completed' || a.type === 'update-complete')) {
      setTimeout(() => window.location.reload(), 3000)
    }
  }, [installActivity])

  // Listen for service update-check completion (manual or nightly), then reload so
  // refreshed available_update_version values surface on the cards.
  useEffect(() => {
    const unsubscribe = subscribe(BROADCAST_CHANNELS.SERVICE_UPDATES, () => {
      setCheckingUpdates(false)
      window.location.reload()
    })
    return () => {
      unsubscribe()
    }
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Run preflight when install modal opens
  useEffect(() => {
    if (modal?.type !== 'install') {
      setPreflight(null)
      setForceInstall(false)
      return
    }
    setPreflightLoading(true)
    api
      .preflightCheck(modal.service.service_name)
      .then((res) => {
        if (res) setPreflight(res)
      })
      .catch(() => {}) // non-fatal; proceed without warnings
      .finally(() => setPreflightLoading(false))
  }, [modal])

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredServices = props.system.services.filter((s) => {
    if (activeCategory === 'installed' && !s.installed) return false
    if (activeCategory !== 'all' && activeCategory !== 'installed') {
      if (s.category !== activeCategory) return false
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        s.friendly_name?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.powered_by?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const installedServices = filteredServices.filter((s) => s.installed)
  const availableServices = filteredServices.filter((s) => !s.installed)

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleInstall(service: ServiceSlim) {
    const hasWarnings =
      (preflight?.portConflicts.length ?? 0) > 0 || (preflight?.resourceWarnings.length ?? 0) > 0

    if (hasWarnings && !forceInstall) return

    setLoading(true)
    setModal(null)
    const result = await api.installService(service.service_name)
    setLoading(false)
    if (!result?.success) showError(result?.message || 'Failed to start installation.')
  }

  async function handleAffect(service: ServiceSlim, action: 'start' | 'stop' | 'restart') {
    setModal(null)
    setLoading(true)
    const result = await api.affectService(service.service_name, action)
    setLoading(false)
    if (!result?.success) showError(result?.message || `Failed to ${action} service.`)
    else setTimeout(() => window.location.reload(), 1500)
  }

  async function handleForceReinstall(service: ServiceSlim) {
    setModal(null)
    setLoading(true)
    const result = await api.forceReinstallService(service.service_name)
    setLoading(false)
    if (!result?.success) showError(result?.message || 'Failed to start reinstall.')
  }

  async function handleDelete(service: ServiceSlim) {
    setModal(null)
    setLoading(true)
    const result = await api.deleteCustomApp(service.service_name, removeImage)
    setRemoveImage(false)
    setLoading(false)
    if (!result?.success) showError(result?.message || 'Failed to delete app.')
    else setTimeout(() => window.location.reload(), 1000)
  }

  async function handleUpdate(service: ServiceSlim) {
    setOpenDropdown(null)
    setLoading(true)
    const result = await api.updateCustomAppImage(service.service_name)
    setLoading(false)
    if (!result?.success) showError(result?.message || 'Failed to update app.')
    else setTimeout(() => window.location.reload(), 1500)
  }

  // Manual trigger for the catalog-wide update check. Results stream back over the
  // SERVICE_UPDATES broadcast (handled by the effect above), which reloads the page.
  async function handleCheckUpdates() {
    if (!isOnline) {
      showError('You must have an internet connection to check for updates.')
      return
    }
    try {
      setCheckingUpdates(true)
      const response = await api.checkServiceUpdates()
      if (!response?.success) throw new Error(response?.message || 'Failed to dispatch update check')
    } catch (error: any) {
      showError(`Failed to check for updates: ${error?.message || 'Unknown error'}`)
      setCheckingUpdates(false)
    }
  }

  // Versioned update for a curated (non-custom) catalog app. Progress + reload are handled
  // by the installActivity effect (update-complete) above.
  async function handleUpdateService(service: ServiceSlim, targetVersion: string) {
    setLoading(true)
    const result = await api.updateService(service.service_name, targetVersion)
    setLoading(false)
    if (!result?.success) showError(result?.message || 'Failed to update service.')
  }

  // Toggle per-app automatic updates (opt-in). Optimistically reflects the new
  // state, reverting if the request fails. Gated by the global master switch in
  // Settings → Updates; this only sets the per-app preference.
  async function handleToggleAutoUpdate(service: ServiceSlim, enabled: boolean) {
    setOpenDropdown(null)
    setAutoUpdateOverrides((prev) => ({ ...prev, [service.service_name]: enabled }))
    const result = await api.setServiceAutoUpdate(service.service_name, enabled)
    if (!result?.success) {
      setAutoUpdateOverrides((prev) => ({ ...prev, [service.service_name]: !enabled }))
      showError(result?.message || 'Failed to update auto-update preference.')
      return
    }
    const appName = service.friendly_name || service.service_name
    addNotification({
      message: `Auto-updates for ${appName} are ${enabled ? 'on' : 'off'}.`,
      type: 'success',
    })
  }

  function handleCustomAppCreated() {
    setCustomAppOpen(false)
    // Page will reload when installation completes via broadcast
  }

  async function handleEdit(service: ServiceSlim) {
    setOpenDropdown(null)
    setLoading(true)
    const res = await api.getCustomApp(service.service_name)
    setLoading(false)
    if (res?.success && res.app) {
      setEditApp(res.app)
    } else {
      showError('Could not load this app for editing.')
    }
  }

  function handleEdited() {
    setEditApp(null)
    setTimeout(() => window.location.reload(), 1500)
  }

  function handleSetUrl(service: ServiceSlim) {
    setOpenDropdown(null)
    setUrlApp(service)
  }

  function handleUrlSaved() {
    setUrlApp(null)
    // Reload so the new link flows through to the card, /home, and settings.
    window.location.reload()
  }

  // ── Install modal helpers ─────────────────────────────────────────────────
  const hasPreflightWarnings =
    (preflight?.portConflicts.length ?? 0) > 0 || (preflight?.resourceWarnings.length ?? 0) > 0

  return (
    <AppLayout>
      <Head title="Supply Depot" />

      {loading && <LoadingSpinner fullscreen text="Working..." />}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Hero / controls panel ─────────────────────────────────────────── */}
        <div className="rounded-lg overflow-hidden bg-desert-white border border-desert-stone-light shadow-sm mb-8">
          {/* Green header band */}
          <div className="relative bg-desert-green px-6 py-5 overflow-hidden">
            {/* Diagonal line pattern */}
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: `repeating-linear-gradient(
                  45deg,
                  transparent,
                  transparent 10px,
                  rgba(255, 255, 255, 0.1) 10px,
                  rgba(255, 255, 255, 0.1) 20px
                )`,
              }}
            />
            <div className="absolute top-0 right-0 w-24 h-24 transform translate-x-8 -translate-y-8">
              <div className="w-full h-full bg-desert-green-dark opacity-30 transform rotate-45" />
            </div>

            <div className="relative flex items-center gap-3">
              <IconBox className="text-white opacity-90 flex-shrink-0" size={28} />
              <div>
                <h1 className="text-2xl font-bold text-white uppercase tracking-wide leading-tight">
                  Supply Depot
                </h1>
                <p className="text-sm text-white/70 mt-1 max-w-xl">
                  Browse and install curated apps, or add your own custom apps by providing a Docker
                  image.
                </p>
              </div>
            </div>
          </div>

          {/* Controls body */}
          <div className="p-6 space-y-4">
            {/* Activity feed (shown only while installing) */}
            {installActivity.length > 0 && (
              <InstallActivityFeed activity={installActivity} withHeader />
            )}

            {/* Search + Add Custom App */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted h-4 w-4" />
                <input
                  type="text"
                  placeholder="Search apps..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-md bg-surface-secondary border border-desert-stone-lighter text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-desert-green placeholder:text-text-muted/50"
                />
              </div>
              <StyledButton
                icon="IconRefreshAlert"
                variant="outline"
                onClick={handleCheckUpdates}
                loading={checkingUpdates}
                disabled={checkingUpdates || !isOnline}
              >
                Check for Updates
              </StyledButton>
              <StyledButton
                icon="IconBrandDocker"
                variant="outline"
                onClick={() => setCustomAppOpen(true)}
              >
                Add Custom App
              </StyledButton>
            </div>

            {/* Category filters */}
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                    activeCategory === cat.id
                      ? 'bg-desert-green text-white border-desert-green'
                      : 'bg-surface-secondary text-text-muted border-desert-stone-lighter hover:text-text-primary hover:border-desert-stone-light'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom accent bar */}
          <div className="h-1 bg-desert-green" />
        </div>

        {/* App cards */}
        {filteredServices.length === 0 ? (
          <div className="text-center py-16">
            <IconPackage className="mx-auto mb-3 opacity-40 text-desert-stone-light" size={48} />
            <p className="text-text-muted">No apps match your filter.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {installedServices.length > 0 && (
              <section>
                <StyledSectionHeader title={`Installed (${installedServices.length})`} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {installedServices.map((service) => (
                    <AppCard
                      key={service.service_name}
                      service={service}
                      openDropdown={openDropdown}
                      dropdownRef={dropdownRef}
                      onOpenDropdown={setOpenDropdown}
                      onInstall={() => setModal({ type: 'install', service })}
                      onStart={() => setModal({ type: 'start', service })}
                      onStop={() => setModal({ type: 'stop', service })}
                      onRestart={() => setModal({ type: 'restart', service })}
                      onReinstall={() => setModal({ type: 'reinstall', service })}
                      onDelete={() => setModal({ type: 'delete', service })}
                      onLogs={() => setModal({ type: 'logs', service })}
                      onStats={() => setModal({ type: 'stats', service })}
                      onEdit={() => handleEdit(service)}
                      onSetUrl={() => handleSetUrl(service)}
                      onUpdate={() => handleUpdate(service)}
                      onUpdateVersion={() => setModal({ type: 'update', service })}
                      autoUpdateEnabled={
                        autoUpdateOverrides[service.service_name] ?? service.auto_update_enabled
                      }
                      autoUpdateMasterEnabled={appAutoUpdateMasterEnabled}
                      onToggleAutoUpdate={(enabled) => handleToggleAutoUpdate(service, enabled)}
                    />
                  ))}
                </div>
              </section>
            )}

            {availableServices.length > 0 && (
              <section>
                <StyledSectionHeader title={`Available (${availableServices.length})`} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availableServices.map((service) => (
                    <AppCard
                      key={service.service_name}
                      service={service}
                      openDropdown={openDropdown}
                      dropdownRef={dropdownRef}
                      onOpenDropdown={setOpenDropdown}
                      onInstall={() => setModal({ type: 'install', service })}
                      onStart={() => setModal({ type: 'start', service })}
                      onStop={() => setModal({ type: 'stop', service })}
                      onRestart={() => setModal({ type: 'restart', service })}
                      onReinstall={() => setModal({ type: 'reinstall', service })}
                      onDelete={() => setModal({ type: 'delete', service })}
                      onLogs={() => setModal({ type: 'logs', service })}
                      onStats={() => setModal({ type: 'stats', service })}
                      onEdit={() => handleEdit(service)}
                      onSetUrl={() => handleSetUrl(service)}
                      onUpdate={() => handleUpdate(service)}
                      onUpdateVersion={() => setModal({ type: 'update', service })}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {/* Install modal */}
      {modal?.type === 'install' && (
        <StyledModal
          title={`Install ${modal.service.friendly_name ?? modal.service.service_name}`}
          open
          onCancel={() => setModal(null)}
          onConfirm={() => handleInstall(modal.service)}
          confirmText="Install"
          confirmIcon="IconDownload"
          confirmVariant="primary"
          confirmLoading={loading}
        >
          <div className="space-y-3 text-sm text-text-muted">
            <p>
              This will download and start <strong className="text-text-primary">{modal.service.friendly_name}</strong>
              {modal.service.ui_location && (
                <> on port <strong className="text-text-primary">{modal.service.ui_location}</strong></>
              )}.
            </p>
            {modal.service.powered_by && (
              <p className="text-xs">Powered by {modal.service.powered_by}</p>
            )}

            {preflightLoading && (
              <div className="flex items-center gap-2 text-xs text-text-muted py-2">
                <span className="animate-spin inline-block w-3 h-3 border border-desert-green border-t-transparent rounded-full" />
                Checking for conflicts…
              </div>
            )}

            {!preflightLoading && preflight && hasPreflightWarnings && (
              <div className="space-y-2 pt-1">
                {preflight.portConflicts.map((c) => (
                  <Alert
                    key={c.port}
                    type="warning"
                    title={`Port ${c.port} already in use`}
                    message={`Currently bound by: ${c.usedBy}. Installation may fail.`}
                  />
                ))}
                {preflight.resourceWarnings.map((w, i) => (
                  <Alert key={i} type="warning" title="Resource warning" message={w} />
                ))}
                <label className="flex items-center gap-2 cursor-pointer select-none mt-2">
                  <input
                    type="checkbox"
                    checked={forceInstall}
                    onChange={(e) => setForceInstall(e.target.checked)}
                    className="accent-desert-orange h-4 w-4 rounded"
                  />
                  <span className="text-xs text-text-muted">I understand — install anyway</span>
                </label>
              </div>
            )}
          </div>
        </StyledModal>
      )}

      {/* Start modal */}
      {modal?.type === 'start' && (
        <StyledModal
          title={`Start ${modal.service.friendly_name ?? modal.service.service_name}`}
          open
          onCancel={() => setModal(null)}
          onConfirm={() => handleAffect(modal.service, 'start')}
          confirmText="Start"
          confirmIcon="IconPlayerPlay"
          confirmVariant="primary"
          confirmLoading={loading}
        >
          <p className="text-sm text-text-muted">This will start the container.</p>
        </StyledModal>
      )}

      {/* Stop modal */}
      {modal?.type === 'stop' && (
        <StyledModal
          title={`Stop ${modal.service.friendly_name ?? modal.service.service_name}`}
          open
          onCancel={() => setModal(null)}
          onConfirm={() => handleAffect(modal.service, 'stop')}
          confirmText="Stop"
          confirmIcon="IconPlayerStop"
          confirmVariant="action"
          confirmLoading={loading}
        >
          <p className="text-sm text-text-muted">The container will be stopped. Your data is preserved.</p>
        </StyledModal>
      )}

      {/* Restart modal */}
      {modal?.type === 'restart' && (
        <StyledModal
          title={`Restart ${modal.service.friendly_name ?? modal.service.service_name}`}
          open
          onCancel={() => setModal(null)}
          onConfirm={() => handleAffect(modal.service, 'restart')}
          confirmText="Restart"
          confirmIcon="IconRefresh"
          confirmVariant="action"
          confirmLoading={loading}
        >
          <p className="text-sm text-text-muted">The container will be briefly stopped and restarted.</p>
        </StyledModal>
      )}

      {/* Force reinstall modal */}
      {modal?.type === 'reinstall' && (
        <StyledModal
          title={`Force Reinstall ${modal.service.friendly_name ?? modal.service.service_name}`}
          open
          onCancel={() => setModal(null)}
          onConfirm={() => handleForceReinstall(modal.service)}
          confirmText="Wipe & Reinstall"
          confirmIcon="IconRefresh"
          confirmVariant="danger"
          confirmLoading={loading}
          icon={<IconAlertTriangle className="text-desert-red" size={40} />}
        >
          <div className="space-y-2 text-sm text-text-muted">
            <p className="font-semibold text-desert-red">This will delete all app data and cannot be undone.</p>
            <p>The container and its associated volumes will be removed, then a fresh installation will begin.</p>
          </div>
        </StyledModal>
      )}

      {/* Delete custom app modal */}
      {modal?.type === 'delete' && (
        <StyledModal
          title={`Delete ${modal.service.friendly_name ?? modal.service.service_name}`}
          open
          onCancel={() => {
            setRemoveImage(false)
            setModal(null)
          }}
          onConfirm={() => handleDelete(modal.service)}
          confirmText="Delete"
          confirmIcon="IconTrash"
          confirmVariant="danger"
          confirmLoading={loading}
          icon={<IconAlertTriangle className="text-desert-red" size={40} />}
        >
          <div className="space-y-3 text-sm text-text-muted">
            <p className="font-semibold text-desert-red">This will permanently remove this custom app.</p>
            <p>The container will be stopped and removed. Host volume data will remain on disk.</p>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={removeImage}
                onChange={(e) => setRemoveImage(e.target.checked)}
                className="accent-desert-red h-4 w-4 rounded"
              />
              <span className="text-text-muted text-xs">Also remove the Docker image to reclaim disk space</span>
            </label>
          </div>
        </StyledModal>
      )}

      {/* Logs modal */}
      {modal?.type === 'logs' && (
        <ServiceLogsModal
          serviceName={modal.service.service_name}
          friendlyName={modal.service.friendly_name ?? modal.service.service_name}
          open
          onClose={() => setModal(null)}
        />
      )}

      {/* Stats modal */}
      {modal?.type === 'stats' && (
        <ServiceStatsModal
          serviceName={modal.service.service_name}
          friendlyName={modal.service.friendly_name ?? modal.service.service_name}
          open
          onClose={() => setModal(null)}
        />
      )}

      {/* Versioned update modal (curated apps with an available update) */}
      {modal?.type === 'update' && (
        <UpdateServiceModal
          record={modal.service}
          currentTag={extractTag(modal.service.container_image)}
          latestVersion={modal.service.available_update_version!}
          onCancel={() => setModal(null)}
          onUpdate={(targetVersion) => {
            const service = modal.service
            setModal(null)
            handleUpdateService(service, targetVersion)
          }}
          showError={showError}
        />
      )}

      {/* Custom app creation modal */}
      <CustomAppModal
        open={customAppOpen}
        onClose={() => setCustomAppOpen(false)}
        onCreated={handleCustomAppCreated}
        showError={showError}
      />

      {/* Custom app edit modal */}
      <CustomAppModal
        open={!!editApp}
        mode="edit"
        initial={editApp}
        onClose={() => setEditApp(null)}
        onCreated={handleEdited}
        showError={showError}
      />

      {/* Custom launch URL modal */}
      <AppUrlModal
        open={!!urlApp}
        service={urlApp}
        onClose={() => setUrlApp(null)}
        onSaved={handleUrlSaved}
        showError={showError}
      />
    </AppLayout>
  )
}

// ── App Card component ────────────────────────────────────────────────────────

interface AppCardProps {
  service: ServiceSlim
  openDropdown: string | null
  dropdownRef: React.RefObject<HTMLDivElement | null>
  onOpenDropdown: (name: string | null) => void
  onInstall: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onReinstall: () => void
  onDelete: () => void
  onLogs: () => void
  onStats: () => void
  onEdit: () => void
  onSetUrl: () => void
  onUpdate: () => void
  onUpdateVersion: () => void
  // Installed-only: per-app auto-update preference + toggle handler.
  autoUpdateEnabled?: boolean
  // Global master switch (Settings → Updates). When off, per-app toggles are inert.
  autoUpdateMasterEnabled?: boolean
  onToggleAutoUpdate?: (enabled: boolean) => void
}

function AppCard({
  service,
  openDropdown,
  dropdownRef,
  onOpenDropdown,
  onInstall,
  onStart,
  onStop,
  onRestart,
  onReinstall,
  onDelete,
  onLogs,
  onStats,
  onEdit,
  onSetUrl,
  onUpdate,
  onUpdateVersion,
  autoUpdateEnabled,
  autoUpdateMasterEnabled,
  onToggleAutoUpdate,
}: AppCardProps) {
  const isRunning = service.status === 'running'
  const isStopped = service.installed && !isRunning
  const catColor = service.category ? CATEGORY_COLORS[service.category] ?? CATEGORY_COLORS.custom : CATEGORY_COLORS.custom
  const isDropdownOpen = openDropdown === service.service_name
  // Port pill: an ui_location may carry an explicit scheme ("https:8480") — show just the port,
  // with a lock when it's served over HTTPS, rather than the raw "https:8480" string.
  const uiIsPath = !!service.ui_location && service.ui_location.startsWith('/')
  const uiIsHttps = /^https:/.test(service.ui_location || '')
  const uiPort = service.ui_location && !uiIsPath ? service.ui_location.replace(/^https?:/, '') : null
  // Per-app documentation link (in-app docs page, anchored to this app's section). Null for apps
  // without a doc section (custom apps, undocumented catalog apps) so the Docs item is hidden.
  const docLink = getSupplyDepotDocLink(service.service_name)

  function toggleDropdown(e: React.MouseEvent) {
    e.stopPropagation()
    onOpenDropdown(isDropdownOpen ? null : service.service_name)
  }

  return (
    <div
      className={`relative flex flex-col rounded-xl border p-4 bg-surface-primary shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
        service.installed
          ? 'border-desert-stone-light'
          : 'border-desert-stone-lighter hover:border-desert-stone-light'
      }`}
    >
      {/* Installed accent spine (rounded to follow the card corners — the card no longer clips
          overflow so the Manage dropdown can open above the card without being cut off) */}
      {service.installed ? (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-desert-green rounded-l-xl" />
      ) : null}

      {/* Top row: icon + status badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-desert-green-lighter border border-desert-green-light flex items-center justify-center flex-shrink-0">
            {service.icon ? (
              <DynamicIcon icon={service.icon as DynamicIconName} className="h-7 w-7 text-desert-green" />
            ) : (
              <IconBrandDocker className="h-7 w-7 text-text-muted" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-text-primary text-sm leading-tight truncate">
              {service.friendly_name ?? service.service_name}
            </p>
            {service.powered_by && (
              <p className="text-xs text-text-muted truncate">{service.powered_by}</p>
            )}
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex-shrink-0 ml-2">
          {service.installation_status === 'installing' ? (
            <span className="flex items-center gap-1 text-xs text-desert-orange">
              <span className="animate-spin inline-block w-3 h-3 border border-desert-orange border-t-transparent rounded-full" />
              Installing
            </span>
          ) : isRunning ? (
            <span className="flex items-center gap-1 text-xs text-desert-green">
              <span className="h-2 w-2 rounded-full bg-desert-green" />
              Running
            </span>
          ) : isStopped ? (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <span className="h-2 w-2 rounded-full bg-text-muted" />
              Stopped
            </span>
          ) : null}
        </div>
      </div>

      {/* Description */}
      {service.description && (
        <p className="text-xs text-text-muted leading-relaxed mb-3 flex-1 line-clamp-2">
          {service.description}
        </p>
      )}

      {/* Metadata row: category badge + port pill */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {service.category && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catColor}`}>
            {toTitleCase(service.category)}
          </span>
        )}
        {service.is_custom ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-surface-secondary text-text-muted border border-surface-secondary">
            custom
          </span>
        ) : null}
        {service.is_user_modified && !service.is_custom ? (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium bg-desert-tan-lighter text-desert-tan-dark border border-desert-tan-light"
            title="You've customized this app, so it won't be overwritten by catalog updates."
          >
            modified
          </span>
        ) : null}
        {uiPort && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-secondary text-text-muted font-mono">
            {uiIsHttps ? '🔒 ' : ''}:{uiPort}
          </span>
        )}
        {service.available_update_version && !service.is_custom && (
          <button
            type="button"
            onClick={onUpdateVersion}
            title={`Update to ${service.available_update_version}`}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border border-desert-green-light bg-desert-green-lighter text-desert-green-dark cursor-pointer transition-colors hover:bg-desert-green-light"
          >
            <IconArrowUp className="h-3 w-3" />
            Update available
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {!service.installed && service.installation_status !== 'installing' && (
          <StyledButton
            size="sm"
            variant="primary"
            icon="IconDownload"
            onClick={onInstall}
            fullWidth
          >
            Install
          </StyledButton>
        )}

        {service.installed ? (
          <>
            {/* Open button — shown when the app has a default location or a user-set custom URL */}
            {(service.ui_location || service.custom_url) && (
              <a
                href={getServiceLink(service.ui_location, service.custom_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <StyledButton size="sm" variant="primary" icon="IconExternalLink" fullWidth>
                  Open
                </StyledButton>
              </a>
            )}

            {/* Manage dropdown */}
            <div className="relative" ref={isDropdownOpen ? dropdownRef : null}>
              <StyledButton size="sm" variant="outline" onClick={toggleDropdown} icon="IconChevronDown">
                Manage
              </StyledButton>

              {isDropdownOpen && (
                <div className="absolute right-0 bottom-full mb-1 w-44 bg-surface-primary border border-surface-secondary rounded-lg shadow-xl z-20 overflow-hidden">
                  {docLink && (
                    <a
                      href={docLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors text-left cursor-pointer text-text-primary hover:bg-surface-secondary"
                    >
                      <IconBook className="h-4 w-4" />
                      Docs
                    </a>
                  )}
                  {isStopped && (
                    <DropdownItem icon={<IconPlayerPlay className="h-4 w-4" />} label="Start" onClick={onStart} />
                  )}
                  {isRunning && (
                    <DropdownItem icon={<IconPlayerStop className="h-4 w-4" />} label="Stop" onClick={onStop} />
                  )}
                  <DropdownItem icon={<IconRefresh className="h-4 w-4" />} label="Restart" onClick={onRestart} />
                  <DropdownItem icon={<IconFileText className="h-4 w-4" />} label="Logs" onClick={onLogs} />
                  <DropdownItem icon={<IconChartBar className="h-4 w-4" />} label="Stats" onClick={onStats} />
                  <DropdownItem icon={<IconPencil className="h-4 w-4" />} label="Edit" onClick={onEdit} />
                  <DropdownItem icon={<IconWorld className="h-4 w-4" />} label="Set custom URL" onClick={onSetUrl} />
                  {!service.is_custom && onToggleAutoUpdate ? (
                    autoUpdateMasterEnabled ? (
                      <DropdownItem
                        icon={
                          <IconClockBolt
                            className={`h-4 w-4 ${autoUpdateEnabled ? 'text-desert-green' : ''}`}
                          />
                        }
                        label={`Auto-update: ${autoUpdateEnabled ? 'On' : 'Off'}`}
                        onClick={() => onToggleAutoUpdate(!autoUpdateEnabled)}
                      />
                    ) : (
                      <DropdownItem
                        icon={<IconClockBolt className="h-4 w-4" />}
                        label="App auto-updates off — open Settings"
                        onClick={() => router.visit('/settings/update')}
                      />
                    )
                  ) : null}
                  {service.available_update_version && !service.is_custom ? (
                    <DropdownItem
                      icon={<IconArrowUp className="h-4 w-4 text-desert-green" />}
                      label={`Update to ${service.available_update_version}`}
                      onClick={onUpdateVersion}
                    />
                  ) : null}
                  {service.is_custom ? (
                    <DropdownItem icon={<IconCloudDownload className="h-4 w-4" />} label="Update (pull latest)" onClick={onUpdate} />
                  ) : null}
                  <DropdownItem icon={<IconRefresh className="h-4 w-4 text-desert-orange" />} label="Force Reinstall" onClick={onReinstall} danger />
                  {service.is_custom ? (
                    <DropdownItem icon={<IconTrash className="h-4 w-4 text-desert-red" />} label="Delete" onClick={onDelete} danger />
                  ): null}
                </div>
              )}
            </div>
          </>
        ) : null}

        {service.installation_status === 'installing' && (
          <div className="flex-1 flex items-center justify-center text-xs text-text-muted gap-1 py-1">
            <span className="animate-spin inline-block w-3 h-3 border border-desert-green border-t-transparent rounded-full" />
            In progress…
          </div>
        )}
      </div>
    </div>
  )
}

function DropdownItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors text-left cursor-pointer ${
        danger
          ? 'text-desert-red hover:bg-desert-red/10'
          : 'text-text-primary hover:bg-surface-secondary'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
