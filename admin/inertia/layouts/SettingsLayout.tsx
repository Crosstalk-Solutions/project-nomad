import {
  ChartBarIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  FolderIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import {
  IconArrowBigUpLines,
  IconDashboard,
  IconDatabaseStar,
  IconGavel,
  IconMapRoute,
} from '@tabler/icons-react'
import StyledSidebar from '~/components/StyledSidebar'
import { getServiceLink } from '~/lib/navigation'

const navigation = [
  { name: 'Apps', href: '/settings/apps', icon: CommandLineIcon, current: false },
  { name: 'Benchmark', href: '/settings/benchmark', icon: ChartBarIcon, current: false },
  { name: 'Legal Notices', href: '/settings/legal', icon: IconGavel, current: false },
  { name: 'Maps Manager', href: '/settings/maps', icon: IconMapRoute, current: false },
  { name: 'Models Manager', href: '/settings/models', icon: IconDatabaseStar, current: false },
  {
    name: 'Service Logs & Metrics',
    href: getServiceLink('9999'),
    icon: IconDashboard,
    current: false,
    target: '_blank',
  },
  { name: 'ZIM Manager', href: '/settings/zim', icon: FolderIcon, current: false },
  {
    name: 'Zim Remote Explorer',
    href: '/settings/zim/remote-explorer',
    icon: MagnifyingGlassIcon,
    current: false,
  },
  {
    name: 'Check for Updates',
    href: '/settings/update',
    icon: IconArrowBigUpLines,
    current: false,
  },
  { name: 'System', href: '/settings/system', icon: Cog6ToothIcon, current: true },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-row bg-stone-50/90">
      <StyledSidebar title="Settings" items={navigation} />
      {children}
    </div>
  )
}
