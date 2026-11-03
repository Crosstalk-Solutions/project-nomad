import { Head, router } from '@inertiajs/react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
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
import { SERVICE_NAMES } from '../../constants/service_names'

function extractTag(containerImage: string): string {
  if (!containerImage) return ''
  const parts = containerImage.split(':')
  return parts.length > 1 ? parts[parts.length - 1] : 'latest'
}

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
  | { type: 'uninstall'; service: ServiceSlim }
  | { type: 'logs'; service: ServiceSlim }
  | { type: 'stats'; service: ServiceSlim }
  | { type: 'update'; service: ServiceSlim }
  | null

export default function SupplyDepotPage(props: { system: { services: ServiceSlim[] } }) {
  const { t } = useTranslation('supply_depot')
  const { showError } = useErrorNotification()
  const { addNotification } = useNotifications()
  const { isOnline } = useInternetStatus()
  const { subscribe } = useTransmit()
  const installActivity = useServiceInstallationActivity()
  const { data: appAutoUpdateStatus } = useAppAutoUpdateStatus()
  const appAutoUpdateMasterEnabled = appAutoUpdateStatus?.enabled ?? false

  const categories = [
    { id: 'all', label: t('categories.all') },
    { id: 'installed', label: t('categories.installed') },
    { id: 'productivity', label: t('categories.productivity') },
    { id: 'media', label: t('categories.media') },
    { id: 'security', label: t('categories.security') },
    { id: 'networking', label: t('categories.networking') },
    { id: 'utility', label: t('categories.utility') },
    { id: 'ai', label: t('categories.ai') },
    { id: 'education', label: t('categories.education') },
    { id: 'custom', label: t('categories.custom') },
  ]

  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<Modal>(null)
  const [loading, setLoading] = useState(false)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [customAppOpen, setCustomAppOpen] = useState(false)
  const [editApp, setEditApp] = useState<CustomAppInitial | null>(null)
  const [urlApp, setUrlApp] = useState<ServiceSlim | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [autoUpdateOverrides, setAutoUpdateOverrides] = useState<Record<string, boolean>>({})

  const [preflight, setPreflight] = useState<{
    portConflicts: Array<{ port: number; usedBy: string }>
    resourceWarnings: string[]
  } | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [forceInstall, setForceInstall] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!installActivity.length) return
    if (installActivity.some((a) => a.type === 'completed' || a.type === 'update-complete')) {
      setTimeout(() => window.location.reload(), 3000)
    }
  }, [installActivity])

  useEffect(() => {
    const unsubscribe = subscribe(BROADCAST_CHANNELS.SERVICE_UPDATES, () => {
      setCheckingUpdates(false)
      window.location.reload()
    })
    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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
      .catch(() => { })
      .finally(() => setPreflightLoading(false))
  }, [modal])

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

  const educationGen2Installed = props.system.services.some(
    (s) => s.service_name === SERVICE_NAMES.KOLIBRI_GEN2 && s.installed
  )

  async function handleInstall(service: ServiceSlim) {
    const hasWarnings =
      (preflight?.portConflicts.length ?? 0) > 0 || (preflight?.resourceWarnings.length ?? 0) > 0

    if (hasWarnings && !forceInstall) return

    setLoading(true)
    const result = await api.installService(service.service_name)
    setModal(null)
    setLoading(false)
    if (!result?.success) showError(result?.message || 'Failed to start installation.')
  }

  async function handleAffect(service: ServiceSlim, action: 'start' | 'stop' | 'restart') {
    setLoading(true)
    const result = await api.affectService(service.service_name, action)
    setModal(null)
    if (!result?.success) {
      setLoading(false)
      showError(result?.message || `Failed to ${action} service.`)
    } else {
      setTimeout(() => window.location.reload(), 1500)
    }
  }

  async function handleForceReinstall(service: ServiceSlim) {
    setLoading(true)
    const result = await api.forceReinstallService(service.service_name)
    setModal(null)
    setLoading(false)
    if (!result?.success) showError(result?.message || 'Failed to start reinstall.')
  }

  async function handleDelete(service: ServiceSlim) {
    setLoading(true)
    const result = await api.deleteCustomApp(service.service_name, removeImage)
    setRemoveImage(false)
    setModal(null)
    if (!result?.success) {
      setLoading(false)
      showError(result?.message || 'Failed to delete app.')
    } else {
      setTimeout(() => window.location.reload(), 1000)
    }
  }

  async function handleUninstall(service: ServiceSlim) {
    setLoading(true)
    const result = await api.uninstallService(service.service_name, removeImage)
    setRemoveImage(false)
    setModal(null)
    if (!result?.success) {
      setLoading(false)
      showError(result?.message || 'Failed to uninstall app.')
    } else {
      setTimeout(() => window.location.reload(), 1000)
    }
  }

  async function handleUpdate(service: ServiceSlim) {
    setOpenDropdown(null)
    setLoading(true)
    const result = await api.updateCustomAppImage(service.service_name)
    setLoading(false)
    if (!result?.success) showError(result?.message || 'Failed to update app.')
    else setTimeout(() => window.location.reload(), 1500)
  }

  async function handleCheckUpdates() {
    if (!isOnline) {
      showError(t('notifications.offline_check'))
      return
    }
    try {
      setCheckingUpdates(true)
      const response = await api.checkServiceUpdates()
      if (!response?.success) throw new Error(response?.message || 'Failed to dispatch update check')
    } catch (error: any) {
      showError(t('notifications.check_failed', { error: error?.message || 'Unknown error' }))
      setCheckingUpdates(false)
    }
  }

  async function handleUpdateService(service: ServiceSlim, targetVersion: string) {
    setLoading(true)
    const result = await api.updateService(service.service_name, targetVersion)
    setLoading(false)
    if (!result?.success) showError(result?.message || 'Failed to update service.')
  }

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
      message: t('notifications.auto_update_changed', {
        app: appName,
        status: enabled ? t('actions.on').toLowerCase() : t('actions.off').toLowerCase(),
      }),
      type: 'success',
    })
  }

  function handleCustomAppCreated() {
    setCustomAppOpen(false)
  }

  async function handleEdit(service: ServiceSlim) {
    setOpenDropdown(null)
    setLoading(true)
    const res = await api.getCustomApp(service.service_name)
    setLoading(false)
    if (res?.success && res.app) {
      setEditApp(res.app)
    } else {
      showError(t('notifications.load_edit_failed'))
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
    window.location.reload()
  }

  const hasPreflightWarnings =
    (preflight?.portConflicts.length ?? 0) > 0 || (preflight?.resourceWarnings.length ?? 0) > 0

  return (
    <AppLayout>
      <Head title={t('head_title')} />

      {loading && !modal && <LoadingSpinner fullscreen text={t('working')} />}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isOnline && (
          <Alert
            title={t('no_internet_warning')}
            message=""
            type="warning"
            variant="solid"
            className="!mb-4"
          />
        )}

        {/* ── Hero / controls panel ─────────────────────────────────────────── */}
        <div className="rounded-lg overflow-hidden bg-desert-white border border-desert-stone-light shadow-sm mb-8">
          {/* Green header band */}
          <div className="relative bg-desert-green px-6 py-5 overflow-hidden">
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
                  {t('title')}
                </h1>
                <p className="text-sm text-white/70 mt-1 max-w-xl">
                  {t('subtitle')}
                </p>
              </div>
            </div>
          </div>

          {/* Controls body */}
          <div className="p-6 space-y-4">
            {installActivity.length > 0 && (
              <InstallActivityFeed activity={installActivity} withHeader />
            )}

            {/* Search + Add Custom App */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted h-4 w-4" />
                <input
                  type="text"
                  placeholder={t('search_placeholder')}
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
                {t('check_for_updates')}
              </StyledButton>
              <StyledButton
                icon="IconBrandDocker"
                variant="outline"
                onClick={() => setCustomAppOpen(true)}
              >
                {t('add_custom_app')}
              </StyledButton>
            </div>

            {/* Category filters */}
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border ${activeCategory === cat.id
                    ? 'bg-desert-green text-white border-desert-green'
                    : 'bg-surface-secondary text-text-muted border-desert-stone-lighter hover:text-text-primary hover:border-desert-stone-light'
                    }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-1 bg-desert-green" />
        </div>

        {/* App cards */}
        {filteredServices.length === 0 ? (
          <div className="text-center py-16">
            <IconPackage className="mx-auto mb-3 opacity-40 text-desert-stone-light" size={48} />
            <p className="text-text-muted">{t('no_apps_matched')}</p>
          </div>
        ) : (
          <div className="space-y-10">
            {installedServices.length > 0 && (
              <section>
                <StyledSectionHeader title={t('installed_section', { count: installedServices.length })} />
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
                      onUninstall={() => setModal({ type: 'uninstall', service })}
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
                      migrationInstructionsHref={(service.service_name.startsWith(SERVICE_NAMES.KOLIBRI) && educationGen2Installed) ? getSupplyDepotDocLink(SERVICE_NAMES.KOLIBRI) || undefined : undefined}
                      migrationInstructionsText={(service.service_name === SERVICE_NAMES.KOLIBRI) ? t('migrations.kolibri_to_gen2') : t('migrations.kolibri_from_gen1')}
                    />
                  ))}
                </div>
              </section>
            )}

            {availableServices.length > 0 && (
              <section>
                <StyledSectionHeader title={t('available_section', { count: availableServices.length })} />
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
                      onUninstall={() => setModal({ type: 'uninstall', service })}
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
          title={t('modals.install_title', { name: modal.service.friendly_name ?? modal.service.service_name })}
          open
          onCancel={() => {
            if (loading) return
            setModal(null)
          }}
          onConfirm={() => handleInstall(modal.service)}
          confirmText={t('actions.install')}
          confirmIcon="IconDownload"
          confirmVariant="primary"
          confirmLoading={loading}
        >
          <div className="space-y-3 text-sm text-text-muted">
            <p>
              {modal.service.ui_location ? (
                <Trans
                  i18nKey="modals.install_desc"
                  ns="supply_depot"
                  values={{ name: modal.service.friendly_name }}
                  components={[
                    <strong className="text-text-primary" />,
                    <strong className="text-text-primary" />,
                  ]}
                  // @ts-ignore
                  portClause={
                    <span>
                      {' '}
                      {t('modals.install_on_port', { port: modal.service.ui_location })}
                    </span>
                  }
                />
              ) : (
                <Trans
                  i18nKey="modals.install_desc"
                  ns="supply_depot"
                  values={{ name: modal.service.friendly_name, portClause: '' }}
                  components={[
                    <strong className="text-text-primary" />,
                    <strong className="text-text-primary" />,
                  ]}
                />
              )}
            </p>
            {modal.service.powered_by && (
              <p className="text-xs">{t('modals.powered_by', { poweredBy: modal.service.powered_by })}</p>
            )}

            {preflightLoading && (
              <div className="flex items-center gap-2 text-xs text-text-muted py-2">
                <span className="animate-spin inline-block w-3 h-3 border border-desert-green border-t-transparent rounded-full" />
                {t('modals.checking_conflicts')}
              </div>
            )}

            {!preflightLoading && preflight && hasPreflightWarnings && (
              <div className="space-y-2 pt-1">
                {preflight.portConflicts.map((c) => (
                  <Alert
                    key={c.port}
                    type="warning"
                    title={t('modals.port_conflict_title', { port: c.port })}
                    message={t('modals.port_conflict_msg', { usedBy: c.usedBy })}
                  />
                ))}
                {preflight.resourceWarnings.map((w, i) => (
                  <Alert key={i} type="warning" title={t('modals.resource_warning_title')} message={w} />
                ))}
                <label className="flex items-center gap-2 cursor-pointer select-none mt-2">
                  <input
                    type="checkbox"
                    checked={forceInstall}
                    onChange={(e) => setForceInstall(e.target.checked)}
                    className="accent-desert-orange h-4 w-4 rounded"
                  />
                  <span className="text-xs text-text-muted">{t('modals.install_anyway')}</span>
                </label>
              </div>
            )}
          </div>
        </StyledModal>
      )}

      {/* Start modal */}
      {modal?.type === 'start' && (
        <StyledModal
          title={t('modals.start_title', { name: modal.service.friendly_name ?? modal.service.service_name })}
          open
          onCancel={() => {
            if (loading) return
            setModal(null)
          }}
          onConfirm={() => handleAffect(modal.service, 'start')}
          confirmText={t('actions.start')}
          confirmIcon="IconPlayerPlay"
          confirmVariant="primary"
          confirmLoading={loading}
        >
          <p className="text-sm text-text-muted">{t('modals.start_desc')}</p>
        </StyledModal>
      )}

      {/* Stop modal */}
      {modal?.type === 'stop' && (
        <StyledModal
          title={t('modals.stop_title', { name: modal.service.friendly_name ?? modal.service.service_name })}
          open
          onCancel={() => {
            if (loading) return
            setModal(null)
          }}
          onConfirm={() => handleAffect(modal.service, 'stop')}
          confirmText={t('actions.stop')}
          confirmIcon="IconPlayerStop"
          confirmVariant="action"
          confirmLoading={loading}
        >
          <p className="text-sm text-text-muted">{t('modals.stop_desc')}</p>
        </StyledModal>
      )}

      {/* Restart modal */}
      {modal?.type === 'restart' && (
        <StyledModal
          title={t('modals.restart_title', { name: modal.service.friendly_name ?? modal.service.service_name })}
          open
          onCancel={() => {
            if (loading) return
            setModal(null)
          }}
          onConfirm={() => handleAffect(modal.service, 'restart')}
          confirmText={t('actions.restart')}
          confirmIcon="IconRefresh"
          confirmVariant="action"
          confirmLoading={loading}
        >
          <p className="text-sm text-text-muted">{t('modals.restart_desc')}</p>
        </StyledModal>
      )}

      {/* Force reinstall modal */}
      {modal?.type === 'reinstall' && (
        <StyledModal
          title={t('modals.reinstall_title', { name: modal.service.friendly_name ?? modal.service.service_name })}
          open
          onCancel={() => {
            if (loading) return
            setModal(null)
          }}
          onConfirm={() => handleForceReinstall(modal.service)}
          confirmText={t('modals.reinstall_confirm')}
          confirmIcon="IconRefresh"
          confirmVariant="danger"
          confirmLoading={loading}
          icon={<IconAlertTriangle className="text-desert-red" size={40} />}
        >
          <div className="space-y-2 text-sm text-text-muted">
            <p className="font-semibold text-desert-red">{t('modals.reinstall_warning')}</p>
            <p>{t('modals.reinstall_desc')}</p>
          </div>
        </StyledModal>
      )}

      {/* Delete custom app modal */}
      {modal?.type === 'delete' && (
        <StyledModal
          title={t('modals.delete_title', { name: modal.service.friendly_name ?? modal.service.service_name })}
          open
          onCancel={() => {
            if (loading) return
            setRemoveImage(false)
            setModal(null)
          }}
          onConfirm={() => handleDelete(modal.service)}
          confirmText={t('actions.delete')}
          confirmIcon="IconTrash"
          confirmVariant="danger"
          confirmLoading={loading}
          icon={<IconAlertTriangle className="text-desert-red" size={40} />}
        >
          <div className="space-y-3 text-sm text-text-muted">
            <p className="font-semibold text-desert-red">{t('modals.delete_warning')}</p>
            <p>{t('modals.delete_desc')}</p>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={removeImage}
                onChange={(e) => setRemoveImage(e.target.checked)}
                className="accent-desert-red h-4 w-4 rounded"
              />
              <span className="text-text-muted text-xs">{t('modals.delete_remove_image')}</span>
            </label>
          </div>
        </StyledModal>
      )}

      {/* Uninstall curated app modal */}
      {modal?.type === 'uninstall' && (
        <StyledModal
          title={t('modals.uninstall_title', { name: modal.service.friendly_name ?? modal.service.service_name })}
          open
          onCancel={() => {
            if (loading) return
            setRemoveImage(false)
            setModal(null)
          }}
          onConfirm={() => handleUninstall(modal.service)}
          confirmText={t('actions.uninstall')}
          confirmIcon="IconTrash"
          confirmVariant="danger"
          confirmLoading={loading}
          icon={<IconAlertTriangle className="text-desert-red" size={40} />}
        >
          <div className="space-y-3 text-sm text-text-muted">
            <p className="font-semibold text-desert-red">{t('modals.uninstall_warning')}</p>
            <p>{t('modals.uninstall_desc')}</p>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={removeImage}
                onChange={(e) => setRemoveImage(e.target.checked)}
                className="accent-desert-red h-4 w-4 rounded"
              />
              <span className="text-text-muted text-xs">{t('modals.delete_remove_image')}</span>
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

      {/* Versioned update modal */}
      {modal?.type === 'update' && (
        <UpdateServiceModal
          record={modal.service}
          currentTag={extractTag(modal.service.container_image)}
          latestVersion={modal.service.available_update_version!}
          onCancel={() => {
            if (loading) return
            setModal(null)
          }}
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
  onUninstall: () => void
  onLogs: () => void
  onStats: () => void
  onEdit: () => void
  onSetUrl: () => void
  onUpdate: () => void
  onUpdateVersion: () => void
  autoUpdateEnabled?: boolean
  autoUpdateMasterEnabled?: boolean
  onToggleAutoUpdate?: (enabled: boolean) => void
  migrationInstructionsHref?: string
  migrationInstructionsText?: string
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
  onUninstall,
  onLogs,
  onStats,
  onEdit,
  onSetUrl,
  onUpdate,
  onUpdateVersion,
  autoUpdateEnabled,
  autoUpdateMasterEnabled,
  onToggleAutoUpdate,
  migrationInstructionsHref,
  migrationInstructionsText,
}: AppCardProps) {
  const { t } = useTranslation('supply_depot')
  const isRunning = service.status === 'running'
  const isStopped = service.installed && !isRunning
  const catColor = service.category ? CATEGORY_COLORS[service.category] ?? CATEGORY_COLORS.custom : CATEGORY_COLORS.custom
  const isDropdownOpen = openDropdown === service.service_name
  const uiIsPath = !!service.ui_location && service.ui_location.startsWith('/')
  const uiIsHttps = /^https:/.test(service.ui_location || '')
  const uiPort = service.ui_location && !uiIsPath ? service.ui_location.replace(/^https?:/, '') : null
  const docLink = getSupplyDepotDocLink(service.service_name)

  const version = service.installed ? extractTag(service.container_image) : ''
  const subtitle =
    !service.powered_by && !version ? null : (
      <p className="text-xs text-text-muted truncate">
        {service.powered_by}
        {service.powered_by && version ? ' · ' : ''}
        {version ? <span className="font-mono">{version}</span> : null}
      </p>
    )

  function toggleDropdown(e: React.MouseEvent) {
    e.stopPropagation()
    onOpenDropdown(isDropdownOpen ? null : service.service_name)
  }

  return (
    <div
      className={`relative flex flex-col rounded-xl border p-4 bg-surface-primary shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${service.installed
        ? 'border-desert-stone-light'
        : 'border-desert-stone-lighter hover:border-desert-stone-light'
        }`}
    >
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
            {subtitle}
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex-shrink-0 ml-2">
          {service.installation_status === 'installing' ? (
            <span className="flex items-center gap-1 text-xs text-desert-orange">
              <span className="animate-spin inline-block w-3 h-3 border border-desert-orange border-t-transparent rounded-full" />
              {t('status.installing')}
            </span>
          ) : isRunning ? (
            <span className="flex items-center gap-1 text-xs text-desert-green">
              <span className="h-2 w-2 rounded-full bg-desert-green" />
              {t('status.running')}
            </span>
          ) : isStopped ? (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <span className="h-2 w-2 rounded-full bg-text-muted" />
              {t('status.stopped')}
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
            {t(`categories.${service.category}`, { defaultValue: toTitleCase(service.category) })}
          </span>
        )}
        {service.is_custom ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-surface-secondary text-text-muted border border-surface-secondary">
            {t('status.custom')}
          </span>
        ) : null}
        {service.is_user_modified && !service.is_custom ? (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium bg-desert-tan-lighter text-desert-tan-dark border border-desert-tan-light"
            title={t('tooltips.modified')}
          >
            {t('status.modified')}
          </span>
        ) : null}
        {service.is_deprecated ? (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium bg-desert-orange-lighter text-desert-orange-dark border border-desert-orange-light"
            title={t('tooltips.legacy')}
          >
            {t('status.legacy')}
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
            title={t('tooltips.update_to', { version: service.available_update_version })}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-desert-orange text-white shadow-sm cursor-pointer transition-colors hover:bg-desert-orange-dark"
          >
            <IconArrowUp className="h-3 w-3" />
            {t('status.update_available')}
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
            {t('actions.install')}
          </StyledButton>
        )}

        {service.installed ? (
          <>
            {(service.ui_location || service.custom_url) && (
              <a
                href={getServiceLink(service.ui_location || "", service.custom_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <StyledButton size="sm" variant="primary" icon="IconExternalLink" fullWidth>
                  {t('actions.open')}
                </StyledButton>
              </a>
            )}

            {/* Manage dropdown */}
            <div className="relative" ref={isDropdownOpen ? dropdownRef : null}>
              <StyledButton size="sm" variant="outline" onClick={toggleDropdown} icon="IconChevronDown">
                {t('actions.manage')}
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
                      {t('actions.docs')}
                    </a>
                  )}
                  {isStopped && (
                    <DropdownItem icon={<IconPlayerPlay className="h-4 w-4" />} label={t('actions.start')} onClick={onStart} />
                  )}
                  {isRunning && (
                    <DropdownItem icon={<IconPlayerStop className="h-4 w-4" />} label={t('actions.stop')} onClick={onStop} />
                  )}
                  <DropdownItem icon={<IconRefresh className="h-4 w-4" />} label={t('actions.restart')} onClick={onRestart} />
                  <DropdownItem icon={<IconFileText className="h-4 w-4" />} label={t('actions.logs')} onClick={onLogs} />
                  <DropdownItem icon={<IconChartBar className="h-4 w-4" />} label={t('actions.stats')} onClick={onStats} />
                  <DropdownItem icon={<IconPencil className="h-4 w-4" />} label={t('actions.edit')} onClick={onEdit} />
                  <DropdownItem icon={<IconWorld className="h-4 w-4" />} label={t('actions.set_custom_url')} onClick={onSetUrl} />
                  {
                    migrationInstructionsHref ? (
                      <a
                        href={migrationInstructionsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors text-left cursor-pointer text-text-primary hover:bg-surface-secondary"
                      >
                        <IconBook className="h-4 w-4" />
                        {migrationInstructionsText || t('migrations.instructions')}
                      </a>
                    ) : (null)
                  }
                  {!service.is_custom && onToggleAutoUpdate ? (
                    autoUpdateMasterEnabled ? (
                      <DropdownItem
                        icon={
                          <IconClockBolt
                            className={`h-4 w-4 ${autoUpdateEnabled ? 'text-desert-green' : ''}`}
                          />
                        }
                        label={t('actions.auto_update_toggle', { status: autoUpdateEnabled ? t('actions.on') : t('actions.off') })}
                        onClick={() => onToggleAutoUpdate(!autoUpdateEnabled)}
                      />
                    ) : (
                      <DropdownItem
                        icon={<IconClockBolt className="h-4 w-4" />}
                        label={t('actions.auto_update_off_settings')}
                        onClick={() => router.visit('/settings/update')}
                      />
                    )
                  ) : null}
                  {service.available_update_version && !service.is_custom ? (
                    <DropdownItem
                      icon={<IconArrowUp className="h-4 w-4 text-desert-green" />}
                      label={t('actions.update_to_version', { version: service.available_update_version })}
                      onClick={onUpdateVersion}
                    />
                  ) : null}
                  {service.is_custom ? (
                    <DropdownItem icon={<IconCloudDownload className="h-4 w-4" />} label={t('actions.update_pull_latest')} onClick={onUpdate} />
                  ) : null}
                  <DropdownItem icon={<IconRefresh className="h-4 w-4 text-desert-orange" />} label={t('actions.force_reinstall')} onClick={onReinstall} danger />
                  {service.is_custom ? (
                    <DropdownItem icon={<IconTrash className="h-4 w-4 text-desert-red" />} label={t('actions.delete')} onClick={onDelete} danger />
                  ) : (
                    <DropdownItem icon={<IconTrash className="h-4 w-4 text-desert-red" />} label={t('actions.uninstall')} onClick={onUninstall} danger />
                  )}
                </div>
              )}
            </div>
          </>
        ) : null}

        {service.installation_status === 'installing' && (
          <div className="flex-1 flex items-center justify-center text-xs text-text-muted gap-1 py-1">
            <span className="animate-spin inline-block w-3 h-3 border border-desert-green border-t-transparent rounded-full" />
            {t('status.in_progress')}
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
      className={`flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors text-left cursor-pointer ${danger
        ? 'text-desert-red hover:bg-desert-red/10'
        : 'text-text-primary hover:bg-surface-secondary'
        }`}
    >
      {icon}
      {label}
    </button>
  )
}
