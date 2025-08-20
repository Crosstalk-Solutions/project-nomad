import {
  Cog6ToothIcon,
  CommandLineIcon,
  FolderIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { IconGavel } from '@tabler/icons-react'
import StyledSidebar from '~/components/StyledSidebar'

const navigation = [
  { name: 'Apps', href: '/settings/apps', icon: CommandLineIcon, current: false },
  { name: 'Legal Notices', href: '/settings/legal', icon: IconGavel, current: false },
  { name: 'ZIM Manager', href: '/settings/zim', icon: FolderIcon, current: false },
  {
    name: 'Zim Remote Explorer',
    href: '/settings/zim/remote-explorer',
    icon: MagnifyingGlassIcon,
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
