import {
  IconArrowBigUpLines,
  IconChartBar,
  IconDashboard,
  IconFolder,
  IconGavel,
  IconHeart,
  IconMapRoute,
  IconSettings,
  IconTerminal2,
  IconWand,
  IconZoom
} from '@tabler/icons-react'
import { usePage } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import StyledSidebar from '~/components/StyledSidebar'
import { getServiceLink } from '~/lib/navigation'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import { SERVICE_NAMES } from '../../constants/service_names'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('layout')
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props
  const aiAssistantInstallStatus = useServiceInstalledStatus(SERVICE_NAMES.OLLAMA)

  const navigation = [
    ...(aiAssistantInstallStatus.isInstalled ? [{ name: aiAssistantName, href: '/settings/models', icon: IconWand, current: false }] : []),
    { name: t('sidebar.apps'), href: '/settings/apps', icon: IconTerminal2, current: false },
    { name: t('sidebar.benchmark'), href: '/settings/benchmark', icon: IconChartBar, current: false },
    { name: t('sidebar.contentExplorer'), href: '/settings/zim/remote-explorer', icon: IconZoom, current: false },
    { name: t('sidebar.contentManager'), href: '/settings/zim', icon: IconFolder, current: false },
    { name: t('sidebar.mapsManager'), href: '/settings/maps', icon: IconMapRoute, current: false },
    {
      name: t('sidebar.serviceLogs'),
      href: getServiceLink('9999'),
      icon: IconDashboard,
      current: false,
      target: '_blank',
    },
    {
      name: t('sidebar.checkUpdates'),
      href: '/settings/update',
      icon: IconArrowBigUpLines,
      current: false,
    },
    { name: t('sidebar.system'), href: '/settings/system', icon: IconSettings, current: false },
    { name: t('sidebar.support'), href: '/settings/support', icon: IconHeart, current: false },
    { name: t('sidebar.legal'), href: '/settings/legal', icon: IconGavel, current: false },
  ]

  return (
    <div className="min-h-screen flex flex-row bg-surface-secondary/90">
      <StyledSidebar title={t('sidebar.settings')} items={navigation} />
      {children}
    </div>
  )
}
