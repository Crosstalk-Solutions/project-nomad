import { Head } from '@inertiajs/react'
import SettingsLayout from '~/layouts/SettingsLayout'
import { SystemInformationResponse } from '../../../types/system'
import { formatBytes } from '~/lib/util'
import CircularGauge from '~/components/systeminfo/CircularGauge'
import HorizontalBarChart from '~/components/HorizontalBarChart'
import InfoCard from '~/components/systeminfo/InfoCard'
import {
  CpuChipIcon,
  CircleStackIcon,
  ServerIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline'
import Alert from '~/components/Alert'
import { useSystemInfo } from '~/hooks/useSystemInfo'
import StatusCard from '~/components/systeminfo/StatusCard'

export default function SettingsPage(props: {
  system: { info: SystemInformationResponse | undefined }
}) {
  const { data: info } = useSystemInfo({
    initialData: props.system.info,
  })

  const memoryUsagePercent = info?.mem.total
    ? ((info.mem.used / info.mem.total) * 100).toFixed(1)
    : 0

  const swapUsagePercent = info?.mem.swaptotal
    ? ((info.mem.swapused / info.mem.swaptotal) * 100).toFixed(1)
    : 0

  const uptimeMinutes = info?.uptime.uptime ? Math.floor(info.uptime.uptime / 60) : 0

  return (
    <SettingsLayout>
      <Head title="System Information" />
      <div className="xl:pl-72 w-full">
        <main className="px-6 lg:px-12 py-6 lg:py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-desert-green mb-2">System Information</h1>
            <p className="text-desert-stone-dark">
              Real-time monitoring and diagnostics • Last updated: {new Date().toLocaleString()} •
              Refreshing data every 30 seconds
            </p>
          </div>
          {Number(memoryUsagePercent) > 90 && (
            <div className="mb-6">
              <Alert
                type="error"
                title="Very High Memory Usage Detected"
                message="System memory usage exceeds 90%. Performance degradation may occur."
                variant="bordered"
              />
            </div>
          )}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              Resource Usage
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
                <CircularGauge
                  value={info?.currentLoad.currentLoad || 0}
                  label="CPU Usage"
                  size="lg"
                  variant="cpu"
                  subtext={`${info?.cpu.cores || 0} cores`}
                  icon={<CpuChipIcon className="w-8 h-8" />}
                />
              </div>
              <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
                <CircularGauge
                  value={Number(memoryUsagePercent)}
                  label="Memory Usage"
                  size="lg"
                  variant="memory"
                  subtext={`${formatBytes(info?.mem.used || 0)} / ${formatBytes(info?.mem.total || 0)}`}
                  icon={<CircleStackIcon className="w-8 h-8" />}
                />
              </div>
              <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
                <CircularGauge
                  value={Number(swapUsagePercent)}
                  label="Swap Usage"
                  size="lg"
                  variant="disk"
                  subtext={`${formatBytes(info?.mem.swapused || 0)} / ${formatBytes(info?.mem.swaptotal || 0)}`}
                  icon={<ServerIcon className="w-8 h-8" />}
                />
              </div>
            </div>
          </section>
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              System Details
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InfoCard
                title="Operating System"
                icon={<ComputerDesktopIcon className="w-6 h-6" />}
                variant="elevated"
                data={[
                  { label: 'Distribution', value: info?.os.distro },
                  { label: 'Kernel Version', value: info?.os.kernel },
                  { label: 'Architecture', value: info?.os.arch },
                  { label: 'Hostname', value: info?.os.hostname },
                  { label: 'Platform', value: info?.os.platform },
                ]}
              />
              <InfoCard
                title="Processor"
                icon={<CpuChipIcon className="w-6 h-6" />}
                variant="elevated"
                data={[
                  { label: 'Manufacturer', value: info?.cpu.manufacturer },
                  { label: 'Brand', value: info?.cpu.brand },
                  { label: 'Cores', value: info?.cpu.cores },
                  { label: 'Physical Cores', value: info?.cpu.physicalCores },
                  {
                    label: 'Virtualization',
                    value: info?.cpu.virtualization ? 'Enabled' : 'Disabled',
                  },
                ]}
              />
            </div>
          </section>
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              Memory Allocation
            </h2>
            <div className="bg-desert-white rounded-lg p-8 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-desert-green mb-1">
                    {formatBytes(info?.mem.total || 0)}
                  </div>
                  <div className="text-sm text-desert-stone-dark uppercase tracking-wide">
                    Total RAM
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-desert-orange mb-1">
                    {formatBytes(info?.mem.used || 0)}
                  </div>
                  <div className="text-sm text-desert-stone-dark uppercase tracking-wide">
                    RAM in Use
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-desert-olive mb-1">
                    {formatBytes(info?.mem.free || 0)}
                  </div>
                  <div className="text-sm text-desert-stone-dark uppercase tracking-wide">
                    Free RAM
                  </div>
                </div>
              </div>
              <div className="relative h-12 bg-desert-stone-lighter rounded-lg overflow-hidden border border-desert-stone-light">
                <div
                  className="absolute left-0 top-0 h-full bg-desert-orange transition-all duration-1000"
                  style={{ width: `${memoryUsagePercent}%` }}
                ></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-desert-white drop-shadow-md z-10">
                    {memoryUsagePercent}% Utilized
                  </span>
                </div>
              </div>
            </div>
          </section>
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              Storage Devices
            </h2>

            <div className="bg-desert-white rounded-lg p-8 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
              {info?.disk && info.disk.length > 0 ? (
                <HorizontalBarChart
                  items={info.disk.map((disk) => ({
                    label: disk.name || 'Unknown',
                    value: disk.percentUsed || 0,
                    total: disk.totalSize ? formatBytes(disk.totalSize) : 'N/A',
                    used: disk.totalUsed ? formatBytes(disk.totalUsed) : 'N/A',
                    subtext: `${formatBytes(disk.totalUsed || 0)} / ${formatBytes(
                      disk.totalSize || 0
                    )}`,
                  }))}
                  progressiveBarColor={true}
                  statuses={[
                    {
                      label: 'Normal',
                      min_threshold: 0,
                      color_class: 'bg-desert-olive',
                    },
                    {
                      label: 'Warning - Usage High',
                      min_threshold: 75,
                      color_class: 'bg-desert-orange',
                    },
                    {
                      label: 'Critical - Disk Almost Full',
                      min_threshold: 90,
                      color_class: 'bg-desert-red',
                    },
                  ]}
                />
              ) : (
                <div className="text-center text-desert-stone-dark py-8">
                  No storage devices detected
                </div>
              )}
            </div>
          </section>
          <section>
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              System Status
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatusCard title="System Uptime" value={`${uptimeMinutes}m`} />
              <StatusCard title="CPU Cores" value={info?.cpu.cores || 0} />
              <StatusCard title="Storage Devices" value={info?.disk.length || 0} />
            </div>
          </section>
        </main>
      </div>
    </SettingsLayout>
  )
}
