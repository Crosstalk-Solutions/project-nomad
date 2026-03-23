import { useState, useCallback } from 'react'
import { Head } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'
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
  const { t: tCommon } = useTranslation('common')
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
        title={tCommon('alerts.reinstallAIConfirmTitle')}
        onConfirm={async () => {
          closeAllModals()
          setReinstalling(true)
          try {
            const response = await api.forceReinstallService('nomad_ollama')
            if (!response || !response.success) {
              throw new Error(response?.message || 'Force reinstall failed')
            }
            addNotification({
              message: tCommon('alerts.reinstallSuccess'),
              type: 'success',
            })
            try { localStorage.removeItem('nomad:gpu-banner-dismissed') } catch {}
            setTimeout(() => window.location.reload(), 5000)
          } catch (error) {
            addNotification({
              message: tCommon('alerts.reinstallFailed', { error: error instanceof Error ? error.message : 'Unknown error' }),
              type: 'error',
            })
            setReinstalling(false)
          }
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText={tCommon('buttons.reinstall')}
        cancelText={tCommon('buttons.cancel')}
      >
        <p className="text-text-primary">
          {tCommon('alerts.reinstallAIConfirmMessage')}
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
              {t('system.subtitle')} • {t('system.lastUpdated', { time: new Date().toLocaleString() })} •
              {' '}{t('system.refreshing')}
            </p>
          </div>
          {Number(memoryUsagePercent) > 90 && (
            <div className="mb-6">
              <Alert
                type="error"
                title={tCommon('alerts.highMemoryTitle')}
                message={tCommon('alerts.highMemoryMessage')}
                variant="bordered"
              />
            </div>
          )}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              {t('sections.resourceUsage')}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
                <CircularGauge
                  value={info?.currentLoad.currentLoad || 0}
                  label={t('labels.cpuUsage')}
                  size="lg"
                  variant="cpu"
                  subtext={t('labels.cores', { count: info?.cpu.cores || 0 })}
                  icon={<IconCpu className="w-8 h-8" />}
                />
              </div>
              <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
                <CircularGauge
                  value={Number(memoryUsagePercent)}
                  label={t('labels.memoryUsage')}
                  size="lg"
                  variant="memory"
                  subtext={`${formatBytes(memoryUsed)} / ${formatBytes(info?.mem.total || 0)}`}
                  icon={<IconDatabase className="w-8 h-8" />}
                />
              </div>
              <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
                <CircularGauge
                  value={Number(swapUsagePercent)}
                  label={t('labels.swapUsage')}
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
              {t('sections.systemDetails')}
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InfoCard
                title="Operating System"
                icon={<IconDeviceDesktop className="w-6 h-6" />}
                variant="elevated"
                data={[
                  { label: t('os.distribution'), value: info?.os.distro },
                  { label: t('os.kernelVersion'), value: info?.os.kernel },
                  { label: t('os.architecture'), value: info?.os.arch },
                  { label: t('os.hostname'), value: info?.os.hostname },
                  { label: t('os.platform'), value: info?.os.platform },
                ]}
              />
              <InfoCard
                title="Processor"
                icon={<IconCpu className="w-6 h-6" />}
                variant="elevated"
                data={[
                  { label: t('cpu.manufacturer'), value: info?.cpu.manufacturer },
                  { label: t('cpu.brand'), value: info?.cpu.brand },
                  { label: t('cpu.cores'), value: info?.cpu.cores },
                  { label: t('cpu.physicalCores'), value: info?.cpu.physicalCores },
                  {
                    label: t('cpu.virtualization'),
                    value: info?.cpu.virtualization ? t('cpu.enabled') : t('cpu.disabled'),
                  },
                ]}
              />
              {info?.gpuHealth?.status === 'passthrough_failed' && !gpuBannerDismissed && (
                <div className="lg:col-span-2">
                  <Alert
                    type="warning"
                    variant="bordered"
                    title={tCommon('alerts.gpuNotAccessibleTitle')}
                    message={tCommon('alerts.gpuNotAccessibleMessage')}
                    dismissible={true}
                    onDismiss={handleDismissGpuBanner}
                    buttonProps={{
                      children: tCommon('alerts.fixReinstallAI'),
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
                  title={t('gpu.title')}
                  icon={<IconComponents className="w-6 h-6" />}
                  variant="elevated"
                  data={info.graphics.controllers.map((gpu, i) => {
                    const prefix = info.graphics.controllers.length > 1 ? `GPU ${i + 1} ` : ''
                    return [
                      { label: `${prefix}${t('gpu.model')}`, value: gpu.model },
                      { label: `${prefix}${t('gpu.vendor')}`, value: gpu.vendor },
                      { label: `${prefix}${t('gpu.vram')}`, value: gpu.vram ? `${gpu.vram} MB` : 'N/A' },
                    ]
                  }).flat()}
                />
              )}
            </div>
          </section>
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              {t('sections.memoryAllocation')}
            </h2>
            <div className="bg-desert-white rounded-lg p-8 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-desert-green mb-1">
                    {formatBytes(info?.mem.total || 0)}
                  </div>
                  <div className="text-sm text-desert-stone-dark uppercase tracking-wide">
                    {t('labels.totalRam')}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-desert-green mb-1">
                    {formatBytes(memoryUsed)}
                  </div>
                  <div className="text-sm text-desert-stone-dark uppercase tracking-wide">
                    {t('labels.usedRam')}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-desert-green mb-1">
                    {formatBytes(info?.mem.available || 0)}
                  </div>
                  <div className="text-sm text-desert-stone-dark uppercase tracking-wide">
                    {t('labels.availableRam')}
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
                    {t('labels.utilized', { percent: memoryUsagePercent })}
                  </span>
                </div>
              </div>
            </div>
          </section>
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              {t('sections.storageDevices')}
            </h2>

            <div className="bg-desert-white rounded-lg p-8 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
              {storageItems.length > 0 ? (
                <HorizontalBarChart
                  items={storageItems}
                  progressiveBarColor={true}
                  statuses={[
                    {
                      label: t('storage.normal'),
                      min_threshold: 0,
                      color_class: 'bg-desert-olive',
                    },
                    {
                      label: t('storage.warningHigh'),
                      min_threshold: 75,
                      color_class: 'bg-desert-orange',
                    },
                    {
                      label: t('storage.criticalFull'),
                      min_threshold: 90,
                      color_class: 'bg-desert-red',
                    },
                  ]}
                />
              ) : (
                <div className="text-center text-desert-stone-dark py-8">
                  {t('labels.noStorageDetected')}
                </div>
              )}
            </div>
          </section>
          <section>
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              {t('sections.systemStatus')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatusCard title={t('labels.systemUptime')} value={uptimeDisplay} />
              <StatusCard title={t('labels.cpuCores')} value={info?.cpu.cores || 0} />
              <StatusCard title={t('labels.storageDevicesCount')} value={storageItems.length} />
            </div>
          </section>
          <section className="mt-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              {t('sections.preferences')}
            </h2>
            <div className="bg-desert-white rounded-lg p-8 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">{tCommon('language.label')}</h3>
                </div>
                <select
                  value={i18n.language}
                  onChange={(e) => {
                    const lang = e.target.value
                    i18n.changeLanguage(lang)
                    try { localStorage.setItem('nomad:language', lang) } catch {}
                    api.updateSetting('ui.language', lang).catch(() => {})
                  }}
                  className="bg-surface-primary border border-border-default rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-desert-green"
                >
                  <option value="en">{tCommon('language.en')}</option>
                  <option value="pt-BR">{tCommon('language.pt-BR')}</option>
                </select>
              </div>
            </div>
          </section>
        </main>
      </div>
    </SettingsLayout>
  )
}
