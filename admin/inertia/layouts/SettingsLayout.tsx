import {
  IconArrowBigUpLines,
  IconChartBar,
  IconDashboard,
  IconDatabaseStar,
  IconFolder,
  IconGavel,
  IconMapRoute,
  IconSettings,
  IconTerminal2,
  IconZoom
} from '@tabler/icons-react'
import StyledSidebar from '~/components/StyledSidebar'
import { getServiceLink } from '~/lib/navigation'

const navigation = [
  { name: 'AI Model Manager', href: '/settings/models', icon: IconDatabaseStar, current: false },
  { name: 'Apps', href: '/settings/apps', icon: IconTerminal2, current: false },
  { name: 'Benchmark', href: '/settings/benchmark', icon: IconChartBar, current: false },
  { name: 'Content Explorer', href: '/settings/zim/remote-explorer', icon: IconZoom, current: false },
  { name: 'Content Manager', href: '/settings/zim', icon: IconFolder, current: false },
  { name: 'Maps Manager', href: '/settings/maps', icon: IconMapRoute, current: false },
  {
    name: 'Service Logs & Metrics',
    href: getServiceLink('9999'),
    icon: IconDashboard,
    current: false,
    target: '_blank',
  },
  {
    name: 'Check for Updates',
    href: '/settings/update',
    icon: IconArrowBigUpLines,
    current: false,
  },
  { name: 'System', href: '/settings/system', icon: IconSettings, current: false },
  { name: 'Legal Notices', href: '/settings/legal', icon: IconGavel, current: false },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-row bg-stone-50/90">
      <StyledSidebar title="Settings" items={navigation} />
      {children}
    </div>
  )
}
