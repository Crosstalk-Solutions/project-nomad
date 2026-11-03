import { useState } from 'react'
import { Head } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import SettingsLayout from '~/layouts/SettingsLayout'
import { SystemInformationResponse } from '../../../types/system'
import { formatBytes } from '~/lib/util'
import { getAllDiskDisplayItems } from '~/hooks/useDiskDisplayData'
import CircularGauge from '~/components/systeminfo/CircularGauge'
import HorizontalBarChart from '~/components/HorizontalBarChart'
import InfoCard from '~/components/systeminfo/InfoCard'
import Alert from '~/components/Alert'
import StyledModal from '~/components/StyledModal'
import { useSystemInfo } from '~/hooks/useSystemInfo'
import { useNotifications } from '~/context/NotificationContext'
import { useModals } from '~/context/ModalContext'
import api from '~/lib/api'
import StatusCard from '~/components/systeminfo/StatusCard'
import { IconCpu, IconDatabase, IconServer, IconDeviceDesktop, IconComponents } from '@tabler/icons-react'

export default function SettingsPage(props: {
  system: { info: SystemInformationResponse | undefined }
}) {
  const { t } = useTranslation('settings')
  const { data: info } = useSystemInfo({
    initialData: props.system.info,
  })
  const { addNotification } = useNotifications()
  const { openModal, closeAllModals } = useModals()

  const [gpuBannerDismissed, setGpuBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem('nomad:gpu-banner-dismissed') === 'true'
    } catch {
      return false
    }
  })
  const [reinstalling, setReinstalling] = useState(false)

  const handleDismissGpuBanner = () => {
    setGpuBannerDismissed(true)
    try {
      localStorage.setItem('nomad:gpu-banner-dismissed', 'true')
    } catch {}
  }

  const handleForceReinstallOllama = () => {
    openModal(
      <StyledModal
        title={t('system.reinstall_modal.title')}
        onConfirm={async () => {
          closeAllModals()
          setReinstalling(true)
          try {
            const response = await api.forceReinstallService('nomad_ollama')
            if (!response || !response.success) {
              throw new Error(response?.message || 'Force reinstall failed')
            }
            addNotification({
              message: t('system.reinstall_modal.success'),
              type: 'success',
            })
            try { localStorage.removeItem('nomad:gpu-banner-dismissed') } catch {}
            setTimeout(() => window.location.reload(), 5000)
          } catch (error) {
            addNotification({
              message: t('system.reinstall_modal.error', { error: error instanceof Error ? error.message : 'Unknown error' }),
              type: 'error',
            })
            setReinstalling(false)
          }
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText={t('system.reinstall_modal.confirm')}
        cancelText={t('system.reinstall_modal.cancel')}
      >
        <p className="text-text-primary">
          {t('system.reinstall_modal.description')}
        </p>
      </StyledModal>,
      'gpu-health-force-reinstall-modal'
    )
  }

  // Use (total - available) to reflect actual memory pressure.
  // mem.used includes reclaimable buff/cache on Linux, which inflates the number.
  const memoryUsed = info?.mem.total && info?.mem.available != null
    ? info.mem.total - info.mem.available
    : info?.mem.used || 0
  const memoryUsagePercent = info?.mem.total
    ? ((memoryUsed / info.mem.total) * 100).toFixed(1)
    : 0

  const swapUsagePercent = info?.mem.swaptotal
    ? ((info.mem.swapused / info.mem.swaptotal) * 100).toFixed(1)
    : 0

  const uptimeSeconds = info?.uptime.uptime || 0
  const uptimeDays = Math.floor(uptimeSeconds / 86400)
  const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600)
  const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60)
  const uptimeDisplay = uptimeDays > 0
    ? `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`
    : uptimeHours > 0
      ? `${uptimeHours}h ${uptimeMinutes}m`
      : `${uptimeMinutes}m`

  // Build storage display items - fall back to fsSize when disk array is empty
  const storageItems = getAllDiskDisplayItems(info?.disk, info?.fsSize)

  return (
    <SettingsLayout>
      <Head title={t('system.title')} />
      <div className="xl:pl-72 w-full">
        <main className="px-6 lg:px-12 py-6 lg:py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-desert-green mb-2">{t('system.title')}</h1>
            <p className="text-desert-stone-dark">
              {t('system.subtitle', { date: new Date().toLocaleString() })}
            </p>
          </div>
          {Number(memoryUsagePercent) > 90 && (
            <div className="mb-6">
              <Alert
                type="error"
                title={t('system.alerts.high_memory_title')}
                message={t('system.alerts.high_memory_message')}
                variant="bordered"
              />
            </div>
          )}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              {t('system.sections.resource_usage')}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
                <CircularGauge
                  value={info?.currentLoad.currentLoad || 0}
                  label={t('system.gauges.cpu_usage')}
                  size="lg"
                  variant="cpu"
                  subtext={t('system.gauges.cores_count', { count: info?.cpu.cores || 0 })}
                  icon={<IconCpu className="w-8 h-8" />}
                />
              </div>
              <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
                <CircularGauge
                  value={Number(memoryUsagePercent)}
                  label={t('system.gauges.memory_usage')}
                  size="lg"
                  variant="memory"
                  subtext={`${formatBytes(memoryUsed)} / ${formatBytes(info?.mem.total || 0)}`}
                  icon={<IconDatabase className="w-8 h-8" />}
                />
              </div>
              <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
                <CircularGauge
                  value={Number(swapUsagePercent)}
                  label={t('system.gauges.swap_usage')}
                  size="lg"
                  variant="disk"
                  subtext={`${formatBytes(info?.mem.swapused || 0)} / ${formatBytes(info?.mem.swaptotal || 0)}`}
                  icon={<IconServer className="w-8 h-8" />}
                />
              </div>
            </div>
          </section>
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              {t('system.sections.system_details')}
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InfoCard
                title={t('system.cards.os_title')}
                icon={<IconDeviceDesktop className="w-6 h-6" />}
                variant="elevated"
                data={[
                  { label: t('system.cards.distribution'), value: info?.os.distro },
                  { label: t('system.cards.kernel'), value: info?.os.kernel },
                  { label: t('system.cards.architecture'), value: info?.os.arch },
                  { label: t('system.cards.hostname'), value: info?.os.hostname },
                  { label: t('system.cards.platform'), value: info?.os.platform },
                ]}
              />
              <InfoCard
                title={t('system.cards.processor_title')}
                icon={<IconCpu className="w-6 h-6" />}
                variant="elevated"
                data={[
                  { label: t('system.cards.manufacturer'), value: info?.cpu.manufacturer },
                  { label: t('system.cards.brand'), value: info?.cpu.brand },
                  { label: t('system.cards.cores'), value: info?.cpu.cores },
                  { label: t('system.cards.physical_cores'), value: info?.cpu.physicalCores },
                  {
                    label: t('system.cards.virtualization'),
                    value: info?.cpu.virtualization ? t('system.cards.enabled') : t('system.cards.disabled'),
                  },
                ]}
              />
              {info?.gpuHealth?.status === 'passthrough_failed' && !gpuBannerDismissed && (
                <div className="lg:col-span-2">
                  <Alert
                    type="warning"
                    variant="bordered"
                    title={t('system.alerts.gpu_failed_title')}
                    message={t('system.alerts.gpu_failed_message', { vendor: info?.gpuHealth?.gpuVendor === 'amd' ? 'AMD' : 'NVIDIA' })}
                    dismissible={true}
                    onDismiss={handleDismissGpuBanner}
                    buttonProps={{
                      children: t('system.alerts.fix_gpu_button'),
                      icon: 'IconRefresh',
                      variant: 'action',
                      size: 'sm',
                      onClick: handleForceReinstallOllama,
                      loading: reinstalling,
                      disabled: reinstalling,
                    }}
                  />
                </div>
              )}
              {info?.graphics?.controllers && info.graphics.controllers.length > 0 && (
                <InfoCard
                  title={t('system.cards.graphics_title')}
                  icon={<IconComponents className="w-6 h-6" />}
                  variant="elevated"
                  data={info.graphics.controllers.map((gpu, i) => {
                    const prefix = info.graphics.controllers.length > 1 ? `GPU ${i + 1} ` : ''
                    return [
                      { label: `${prefix}${t('system.cards.model')}`, value: gpu.model },
                      { label: `${prefix}${t('system.cards.vendor')}`, value: gpu.vendor },
                      { label: `${prefix}${t('system.cards.vram')}`, value: gpu.vram ? `${gpu.vram} MB` : 'N/A' },
                    ]
                  }).flat()}
                />
              )}
            </div>
          </section>
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              {t('system.sections.memory_allocation')}
            </h2>
            <div className="bg-desert-white rounded-lg p-8 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-desert-green mb-1">
                    {formatBytes(info?.mem.total || 0)}
                  </div>
                  <div className="text-sm text-desert-stone-dark uppercase tracking-wide">
                    {t('system.cards.total_ram')}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-desert-green mb-1">
                    {formatBytes(memoryUsed)}
                  </div>
                  <div className="text-sm text-desert-stone-dark uppercase tracking-wide">
                    {t('system.cards.used_ram')}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-desert-green mb-1">
                    {formatBytes(info?.mem.available || 0)}
                  </div>
                  <div className="text-sm text-desert-stone-dark uppercase tracking-wide">
                    {t('system.cards.available_ram')}
                  </div>
                </div>
              </div>
              <div className="relative h-12 bg-desert-stone-lighter rounded-lg overflow-hidden border border-desert-stone-light">
                <div
                  className="absolute left-0 top-0 h-full bg-desert-orange transition-all duration-1000"
                  style={{ width: `${memoryUsagePercent}%` }}
                ></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-white drop-shadow-md z-10">
                    {t('system.gauges.utilized', { percent: memoryUsagePercent })}
                  </span>
                </div>
              </div>
            </div>
          </section>
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              {t('system.sections.storage_devices')}
            </h2>

            <div className="bg-desert-white rounded-lg p-8 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
              {storageItems.length > 0 ? (
                <HorizontalBarChart
                  items={storageItems}
                  progressiveBarColor={true}
                  statuses={[
                    {
                      label: t('system.cards.status_normal'),
                      min_threshold: 0,
                      color_class: 'bg-desert-olive',
                    },
                    {
                      label: t('system.cards.status_warning'),
                      min_threshold: 75,
                      color_class: 'bg-desert-orange',
                    },
                    {
                      label: t('system.cards.status_critical'),
                      min_threshold: 90,
                      color_class: 'bg-desert-red',
                    },
                  ]}
                />
              ) : (
                <div className="text-center text-desert-stone-dark py-8">
                  {t('system.cards.no_storage_devices')}
                </div>
              )}
            </div>
          </section>
          <section>
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              {t('system.sections.system_status')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatusCard title={t('system.cards.uptime_title')} value={uptimeDisplay} />
              <StatusCard title={t('system.cards.cpu_cores_title')} value={info?.cpu.cores || 0} />
              <StatusCard title={t('system.cards.storage_devices_title')} value={storageItems.length} />
            </div>
          </section>
        </main>
      </div>
    </SettingsLayout>
  )
}
