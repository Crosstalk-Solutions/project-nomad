import { Head } from '@inertiajs/react'
import SettingsLayout from '~/layouts/SettingsLayout'
import { SystemInformationResponse } from '../../../types/system'
import { formatBytes } from '~/lib/util'

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => {
  return (
    <div className="px-4 sm:px-0 mt-8">
      <h3 className="text-base/7 font-semibold text-gray-900">{title}</h3>
      <div className="mt-1 border-t border-gray-300">
        <dl className="divide-y divide-gray-200">{children}</dl>
      </div>
    </div>
  )
}

const Row = ({ label, value }: { label: string; value: string | number | undefined }) => {
  return (
    <div className="px-4 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
      <dt className="text-sm/6 font-medium text-gray-900">{label}</dt>
      <dd className="mt-1 text-sm/6 text-gray-700 sm:col-span-2 sm:mt-0">{value}</dd>
    </div>
  )
}

export default function SettingsPage(props: {
  system: { info: SystemInformationResponse | undefined }
}) {
  return (
    <SettingsLayout>
      <Head title="Settings" />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <h1 className="text-4xl font-semibold mb-6">System Information</h1>
          <div>
            <Section title="OS Information">
              <Row label="Distro" value={props.system.info?.os.distro} />
              <Row label="Kernel" value={props.system.info?.os.kernel} />
              <Row label="Architecture" value={props.system.info?.os.arch} />
              <Row label="Hostname" value={props.system.info?.os.hostname} />
            </Section>
            <Section title="CPU Manufacturer">
              <Row label="Manufacturer" value={props.system.info?.cpu.manufacturer} />
              <Row label="Brand Name" value={props.system.info?.cpu.brand} />
              <Row label="Cores" value={props.system.info?.cpu.cores} />
              <Row
                label="Virtualization Enabled"
                value={props.system.info?.cpu.virtualization ? 'Yes' : 'No'}
              />
            </Section>
            <Section title="Memory Information">
              <Row label="Total" value={formatBytes(props.system.info?.mem.total || 0)} />
              <Row label="Used" value={formatBytes(props.system.info?.mem.used || 0)} />
              <Row label="Free" value={formatBytes(props.system.info?.mem.free || 0)} />
              <Row label="Swap Total" value={formatBytes(props.system.info?.mem.swaptotal || 0)} />
              <Row label="Swap Used" value={formatBytes(props.system.info?.mem.swapused || 0)} />
            </Section>
            <Section title="Disk Information">
              {props.system.info?.disk.map((disk, index) => (
                <div key={index}>
                  <Row label={`Disk ${index + 1} Name`} value={disk.name} />
                  <Row label={`Disk ${index + 1} Size`} value={formatBytes(disk.size || 0)} />
                  <Row label={`Disk ${index + 1} Type`} value={disk.type} />
                </div>
              ))}
            </Section>
          </div>
        </main>
      </div>
    </SettingsLayout>
  )
}
